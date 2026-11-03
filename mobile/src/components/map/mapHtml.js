// A small OpenStreetMap viewer that runs inside a WebView. No Google Maps key,
// no map SDK: raster tiles from OpenStreetMap, drawn zones/markers as plain DOM.
// React Native sends data with window.CityCartMap.setData() and gets taps back
// through postMessage. Keep this file free of backticks: it is one JS template.
export const MAP_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; background: #eef3f0; }
  #map { position: fixed; inset: 0; touch-action: none; cursor: grab; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  #map.pickable { cursor: crosshair; }
  #tiles { position: absolute; inset: 0; overflow: hidden; }
  #tiles img { position: absolute; width: 256px; height: 256px; pointer-events: none; user-select: none; -webkit-user-drag: none; opacity: 0; transition: opacity .15s linear; background: #e8ece9; }
  #zones { position: absolute; inset: 0; pointer-events: none; }
  #marks { position: absolute; inset: 0; pointer-events: none; }
  .marker { position: absolute; width: 26px; height: 26px; margin: 0; padding: 0; border: 0; background: transparent; transform: translate(-13px, -26px); pointer-events: auto; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .pin { display: block; width: 26px; height: 26px; border-radius: 50% 50% 50% 0; border: 2px solid #fff; box-shadow: 0 1px 5px rgba(0,0,0,.45); transform: rotate(-45deg); }
  .pin span { display: block; width: 8px; height: 8px; margin: 7px; border-radius: 50%; background: #fff; }
  .pin.shop { background: #b6472a; }
  .pin.chosen { background: #3b5b7c; }
  #popup { position: absolute; z-index: 5; display: none; width: 210px; box-sizing: border-box; padding: 10px 12px; border: 1px solid #e5ded4; border-radius: 10px; background: #fff; box-shadow: 0 8px 24px rgba(15,23,42,.2); pointer-events: auto; }
  #popup strong { display: block; font-size: 14px; color: #1f2937; }
  #popup span { display: block; margin-top: 2px; font-size: 12px; line-height: 1.35; color: #6b7280; }
  #popup button { display: inline-block; margin-top: 7px; padding: 0; border: 0; background: transparent; color: #b6472a; font-size: 12.5px; font-weight: 600; text-decoration: underline; cursor: pointer; }
  #popup .close { position: absolute; top: 4px; right: 6px; margin: 0; font-size: 16px; line-height: 1; color: #6b7280; text-decoration: none; }
  #attrib { position: absolute; right: 4px; bottom: 4px; z-index: 6; padding: 2px 5px; border-radius: 4px; background: rgba(255,255,255,.86); font-size: 10px; color: #3f4a44; pointer-events: auto; }
  #attrib a { color: #3f4a44; }
</style>
</head>
<body>
<div id="map" role="application" aria-label="Map">
  <div id="tiles"></div>
  <div id="zones"></div>
  <div id="marks"></div>
  <div id="popup"></div>
  <div id="attrib">&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a></div>
</div>
<script>
(function () {
  var TILE = 256;
  var MIN_Z = 3;
  var MAX_Z = 19;
  var FALLBACK = { lat: 31.4504, lng: 73.135, zoom: 12 };
  var state = { center: { lat: FALLBACK.lat, lng: FALLBACK.lng }, zoom: FALLBACK.zoom, data: null };
  var map = document.getElementById('map');
  var tileBox = document.getElementById('tiles');
  var zoneBox = document.getElementById('zones');
  var markBox = document.getElementById('marks');
  var popup = document.getElementById('popup');
  var cache = {};
  var placed = [];

  function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
  function width() { return map.clientWidth || window.innerWidth; }
  function height() { return map.clientHeight || window.innerHeight; }
  function project(lat, lng, zoom) {
    var scale = TILE * Math.pow(2, zoom);
    var sin = Math.sin(lat * Math.PI / 180);
    return {
      x: (lng + 180) / 360 * scale,
      y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
    };
  }
  function unproject(x, y, zoom) {
    var scale = TILE * Math.pow(2, zoom);
    var n = Math.PI - 2 * Math.PI * y / scale;
    return {
      lat: 180 / Math.PI * Math.atan(Math.sinh(n)),
      lng: x / scale * 360 - 180,
    };
  }
  function offset() {
    var zoom = clamp(Math.round(state.zoom), MIN_Z, MAX_Z);
    var center = project(state.center.lat, state.center.lng, zoom);
    return { zoom: zoom, x: center.x - width() / 2, y: center.y - height() / 2 };
  }
  function post(message) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(message));
  }

  function drawTiles(view) {
    var count = Math.pow(2, view.zoom);
    var left = Math.floor(view.x / TILE);
    var right = Math.floor((view.x + width()) / TILE);
    var top = Math.max(0, Math.floor(view.y / TILE));
    var bottom = Math.min(count - 1, Math.floor((view.y + height()) / TILE));
    var used = {};
    for (var tx = left; tx <= right; tx += 1) {
      var wrapped = ((tx % count) + count) % count;
      for (var ty = top; ty <= bottom; ty += 1) {
        var key = view.zoom + '/' + wrapped + '/' + ty;
        used[key] = true;
        var img = cache[key];
        if (!img) {
          img = document.createElement('img');
          img.alt = '';
          img.setAttribute('aria-hidden', 'true');
          img.onload = (function (node) { return function () { node.style.opacity = 1; }; })(img);
          img.onerror = (function (node) { return function () { node.style.opacity = 0; }; })(img);
          img.src = 'https://tile.openstreetmap.org/' + view.zoom + '/' + wrapped + '/' + ty + '.png';
          cache[key] = img;
        }
        img.style.left = (tx * TILE - view.x) + 'px';
        img.style.top = (ty * TILE - view.y) + 'px';
        img.setAttribute('data-key', key);
        tileBox.appendChild(img);
      }
    }
    var nodes = Array.prototype.slice.call(tileBox.children);
    nodes.forEach(function (node) { if (!used[node.getAttribute('data-key')]) tileBox.removeChild(node); });
    Object.keys(cache).forEach(function (key) { if (!used[key]) delete cache[key]; });
  }

  function drawZones(view) {
    var data = state.data;
    zoneBox.innerHTML = '';
    if (!data || !data.zones || data.zones.length === 0) return;
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('viewBox', '0 0 ' + width() + ' ' + height());
    data.zones.forEach(function (zone) {
      var points = zone.ring.map(function (point) {
        var p = project(point[0], point[1], view.zoom);
        return (p.x - view.x).toFixed(1) + ',' + (p.y - view.y).toFixed(1);
      }).join(' ');
      var poly = document.createElementNS(ns, 'polygon');
      poly.setAttribute('points', points);
      poly.setAttribute('fill', zone.selected ? 'rgba(30,58,47,0.16)' : 'rgba(100,116,139,0.07)');
      poly.setAttribute('stroke', zone.selected ? '#1e3a2f' : '#6b7280');
      poly.setAttribute('stroke-width', zone.selected ? '2.5' : '1.5');
      var title = document.createElementNS(ns, 'title');
      title.textContent = zone.name || '';
      poly.appendChild(title);
      svg.appendChild(poly);
    });
    zoneBox.appendChild(svg);
  }

  function drawCircle(view) {
    var data = state.data;
    if (!data || !data.pin || !data.radiusKm) return null;
    var center = project(data.pin.lat, data.pin.lng, view.zoom);
    var metersPerPixel = 156543.03392 * Math.cos(data.pin.lat * Math.PI / 180) / Math.pow(2, view.zoom);
    var radius = data.radiusKm * 1000 / metersPerPixel;
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('viewBox', '0 0 ' + width() + ' ' + height());
    var circle = document.createElementNS(ns, 'circle');
    circle.setAttribute('cx', center.x - view.x);
    circle.setAttribute('cy', center.y - view.y);
    circle.setAttribute('r', radius);
    circle.setAttribute('fill', 'rgba(30,58,47,0.07)');
    circle.setAttribute('stroke', '#1e3a2f');
    circle.setAttribute('stroke-width', '1');
    svg.appendChild(circle);
    zoneBox.appendChild(svg);
    return null;
  }

  function marker(kind, label, x, y, onTap) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'marker';
    button.setAttribute('aria-label', label);
    button.style.left = x + 'px';
    button.style.top = y + 'px';
    var pin = document.createElement('span');
    pin.className = 'pin ' + kind;
    pin.appendChild(document.createElement('span'));
    button.appendChild(pin);
    button.addEventListener('pointerup', function (event) {
      event.stopPropagation();
      event.preventDefault();
      onTap();
    });
    markBox.appendChild(button);
    return button;
  }

  function closePopup() {
    popup.style.display = 'none';
    popup.innerHTML = '';
  }

  function showPopup(item, x, y) {
    popup.innerHTML = '';
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'close';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '\u00d7';
    close.addEventListener('pointerup', function (event) {
      event.stopPropagation();
      closePopup();
    });
    popup.appendChild(close);

    var title = document.createElement('strong');
    title.textContent = item.title;
    popup.appendChild(title);

    item.lines.forEach(function (line) {
      if (!line) return;
      var row = document.createElement('span');
      row.textContent = line;
      popup.appendChild(row);
    });

    if (item.brandId) {
      var open = document.createElement('button');
      open.type = 'button';
      open.textContent = 'See products';
      open.addEventListener('pointerup', function (event) {
        event.stopPropagation();
        post({ type: 'open', brandId: item.brandId });
      });
      popup.appendChild(open);
    }

    popup.style.display = 'block';
    var w = popup.offsetWidth || 210;
    var h = popup.offsetHeight || 110;
    popup.style.left = clamp(x + 14, 8, Math.max(8, width() - w - 8)) + 'px';
    var above = y - h - 12;
    popup.style.top = (above < 8 ? y + 14 : above) + 'px';
  }

  function drawMarks(view) {
    var data = state.data;
    markBox.innerHTML = '';
    placed = [];
    if (!data) return;
    (data.pins || []).forEach(function (pin) {
      var point = project(pin.lat, pin.lng, view.zoom);
      var x = point.x - view.x;
      var y = point.y - view.y;
      if (x < -40 || y < -50 || x > width() + 40 || y > height() + 40) return;
      placed.push({ x: x, y: y });
      marker('shop', pin.brandName + ', ' + pin.branchName, x, y, function () {
        showPopup({ title: pin.brandName, lines: [pin.branchName, pin.where, pin.distance], brandId: pin.brandId }, x, y);
      });
    });
    if (data.pin) {
      var at = project(data.pin.lat, data.pin.lng, view.zoom);
      var px = at.x - view.x;
      var py = at.y - view.y;
      if (px > -40 && py > -50 && px < width() + 40 && py < height() + 40) {
        placed.push({ x: px, y: py });
        marker('chosen', data.pin.label, px, py, function () {
          showPopup({ title: data.pin.label, lines: [], brandId: null }, px, py);
        });
      }
    }
  }

  function render() {
    var view = offset();
    state.zoom = view.zoom;
    drawTiles(view);
    zoneBox.innerHTML = '';
    drawZones(view);
    drawCircle(view);
    drawMarks(view);
  }

  function fit() {
    var data = state.data;
    var points = [];
    if (data) {
      (data.zones || []).forEach(function (zone) { zone.ring.forEach(function (p) { points.push({ lat: p[0], lng: p[1] }); }); });
      (data.pins || []).forEach(function (p) { points.push({ lat: p.lat, lng: p.lng }); });
      if (data.pin) {
        points.push({ lat: data.pin.lat, lng: data.pin.lng });
        if (data.radiusKm) {
          var dLat = data.radiusKm / 111.32;
          var dLng = data.radiusKm / (111.32 * Math.cos(data.pin.lat * Math.PI / 180));
          points.push({ lat: data.pin.lat + dLat, lng: data.pin.lng });
          points.push({ lat: data.pin.lat - dLat, lng: data.pin.lng });
          points.push({ lat: data.pin.lat, lng: data.pin.lng + dLng });
          points.push({ lat: data.pin.lat, lng: data.pin.lng - dLng });
        }
      }
    }
    if (points.length === 0) {
      state.center = { lat: FALLBACK.lat, lng: FALLBACK.lng };
      state.zoom = FALLBACK.zoom;
      render();
      return;
    }
    if (points.length === 1) {
      state.center = points[0];
      state.zoom = 15;
      render();
      return;
    }
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    points.forEach(function (p) {
      var q = project(p.lat, p.lng, 0);
      minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x);
      minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y);
    });
    var dx = Math.max(maxX - minX, 0.000001);
    var dy = Math.max(maxY - minY, 0.000001);
    var scale = Math.min((width() - 64) / dx, (height() - 64) / dy);
    state.zoom = clamp(Math.round(Math.log(scale) / Math.LN2), 9, 17);
    state.center = unproject((minX + maxX) / 2, (minY + maxY) / 2, 0);
    render();
  }

  function pick(clientX, clientY) {
    var data = state.data;
    if (!data || !data.pickable) return;
    var view = offset();
    var point = unproject(clientX + view.x, clientY + view.y, view.zoom);
    post({ type: 'pick', lat: point.lat, lng: point.lng });
  }

  function panBy(dx, dy) {
    var view = offset();
    var center = project(state.center.lat, state.center.lng, view.zoom);
    state.center = unproject(center.x - dx, center.y - dy, view.zoom);
    render();
  }

  function zoomAt(clientX, clientY, nextZoom) {
    var view = offset();
    var zoom = clamp(nextZoom, MIN_Z, MAX_Z);
    if (zoom === view.zoom) return;
    var anchor = unproject(clientX + view.x, clientY + view.y, view.zoom);
    var point = project(anchor.lat, anchor.lng, zoom);
    state.zoom = zoom;
    state.center = unproject(point.x + width() / 2 - clientX, point.y + height() / 2 - clientY, zoom);
    render();
  }

  var pointers = {};
  var drag = null;
  var pinch = null;
  var suppressTap = false;

  function countKeys(object) { return Object.keys(object).length; }

  map.addEventListener('pointerdown', function (event) {
    var target = event.target;
    if (target.closest('.marker') || target.closest('#popup') || target.closest('#attrib')) return;
    var hadPopup = popup.style.display === 'block';
    pointers[event.pointerId] = { x: event.clientX, y: event.clientY };
    if (map.setPointerCapture) map.setPointerCapture(event.pointerId);
    if (countKeys(pointers) === 1) {
      drag = { x: event.clientX, y: event.clientY, moved: false };
      // The first tap on the map closes an open card; it does not move the pin.
      suppressTap = hadPopup;
    } else if (countKeys(pointers) === 2) {
      var list = Object.keys(pointers).map(function (id) { return pointers[id]; });
      var middle = { x: (list[0].x + list[1].x) / 2, y: (list[0].y + list[1].y) / 2 };
      var distance = Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y);
      var view = offset();
      pinch = { distance: Math.max(distance, 1), zoom: view.zoom, anchor: unproject(middle.x + view.x, middle.y + view.y, view.zoom) };
      drag = null;
      suppressTap = true;
    }
    closePopup();
  });

  map.addEventListener('pointermove', function (event) {
    if (!pointers[event.pointerId]) return;
    pointers[event.pointerId] = { x: event.clientX, y: event.clientY };
    if (event.cancelable) event.preventDefault();
    var ids = Object.keys(pointers);
    if (ids.length >= 2 && pinch) {
      var a = pointers[ids[0]];
      var b = pointers[ids[1]];
      var middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      var distance = Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1);
      var nextZoom = clamp(Math.round(pinch.zoom + Math.log(distance / pinch.distance) / Math.LN2), MIN_Z, MAX_Z);
      if (nextZoom !== Math.round(state.zoom)) {
        var point = project(pinch.anchor.lat, pinch.anchor.lng, nextZoom);
        state.zoom = nextZoom;
        state.center = unproject(point.x + width() / 2 - middle.x, point.y + height() / 2 - middle.y, nextZoom);
        render();
      }
      return;
    }
    if (drag) {
      var dx = event.clientX - drag.x;
      var dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
      if (drag.moved) {
        drag.x = event.clientX;
        drag.y = event.clientY;
        panBy(dx, dy);
      }
    }
  });

  function release(event) {
    if (!pointers[event.pointerId]) return;
    delete pointers[event.pointerId];
    if (map.releasePointerCapture) { try { map.releasePointerCapture(event.pointerId); } catch (err) {} }
    if (countKeys(pointers) === 0) {
      var tap = drag && !drag.moved;
      var blocked = suppressTap || pinch;
      drag = null;
      pinch = null;
      suppressTap = false;
      if (tap && !blocked && event.cancelable) event.preventDefault();
      if (tap && !blocked) pick(event.clientX, event.clientY);
    } else if (countKeys(pointers) === 1) {
      pinch = null;
      var only = pointers[Object.keys(pointers)[0]];
      drag = { x: only.x, y: only.y, moved: true };
    }
  }
  map.addEventListener('pointerup', release);
  map.addEventListener('pointercancel', release);

  map.addEventListener('wheel', function (event) {
    event.preventDefault();
    closePopup();
    zoomAt(event.clientX, event.clientY, Math.round(state.zoom) + (event.deltaY < 0 ? 1 : -1));
  }, { passive: false });

  var attrib = document.getElementById('attrib');
  attrib.addEventListener('pointerup', function (event) { event.stopPropagation(); });

  window.addEventListener('resize', function () { render(); });

  window.CityCartMap = {
    setData: function (data) {
      state.data = data || null;
      closePopup();
      map.className = data && data.pickable ? 'pickable' : '';
      fit();
    },
  };

  render();
  post({ type: 'ready' });
})();
</script>
</body>
</html>`
