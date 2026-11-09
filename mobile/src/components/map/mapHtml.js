// A small OpenStreetMap viewer that runs inside a WebView. No Google Maps key,
// no map SDK: raster tiles from OpenStreetMap, drawn zones/markers as plain DOM.
// React Native sends data with window.CityCartMap.setData() and gets taps back
// through postMessage. Keep this file free of backticks: it is one JS template.
//
// Smoothness model, the same idea Leaflet uses:
//  * tiles, zones and pins are laid out once in world-pixel coordinates;
//  * a drag only moves one GPU layer (translate3d), so nothing is laid out or
//    rebuilt while the finger is down, and a short fling glides on;
//  * pinch zoom scales that layer continuously and snaps to a whole zoom only
//    when the fingers lift, instead of re-rendering on every pinch step;
//  * a zoom step paints the tiles already on screen as a scaled under-layer
//    until the new level arrives, so the map never goes blank.
export const MAP_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="preconnect" href="https://tile.openstreetmap.org" crossorigin>
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; background: #f8f2e7; }
  #map { position: fixed; inset: 0; overflow: hidden; touch-action: none; cursor: grab; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent; }
  #map.pickable { cursor: crosshair; }
  /* Everything inside #world is positioned in world pixels relative to #layout,
     and a gesture only changes this one transform. */
  #world { position: absolute; left: 0; top: 0; width: 100%; height: 100%; transform-origin: 0 0; will-change: transform; backface-visibility: hidden; }
  #under, #tiles, #zones, #marks { position: absolute; left: 0; top: 0; width: 0; height: 0; }
  #zones, #marks { pointer-events: none; }
  #under img { position: absolute; opacity: 1; pointer-events: none; }
  #tiles img { position: absolute; width: 256px; height: 256px; pointer-events: none; user-select: none; -webkit-user-drag: none; opacity: 0; transition: opacity .12s linear; background: #f0e9df; }
  .marker { position: absolute; width: 26px; height: 26px; margin: 0; padding: 0; border: 0; background: transparent; transform: translate(-13px, -26px); pointer-events: auto; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .pin { display: block; width: 26px; height: 26px; border-radius: 50% 50% 50% 0; border: 2px solid #fff; box-shadow: 0 1px 5px rgba(0,0,0,.45); transform: rotate(-45deg); box-sizing: border-box; }
  .pin span { display: block; width: 8px; height: 8px; margin: 7px; border-radius: 50%; background: #fff; }
  .pin.shop { background: #b6472a; }
  .pin.provider { background: #1c3a2e; }
  .pin.chosen { background: #3b5b7c; }
  .marker.dot { width: 18px; height: 18px; transform: translate(-9px, -9px); }
  .dot { display: block; width: 18px; height: 18px; border-radius: 50%; border: 2px solid #fff; background: #3b5b7c; box-shadow: 0 1px 4px rgba(0,0,0,.35); box-sizing: border-box; }
  .dot.rider { background: #b6472a; }
  #zoom { position: absolute; top: 10px; left: 10px; z-index: 7; display: flex; flex-direction: column; border-radius: 6px; overflow: hidden; box-shadow: 0 1px 5px rgba(0,0,0,.35); }
  #zoom button { width: 36px; height: 36px; margin: 0; padding: 0; border: 0; background: #fffcf6; color: #15140f; font: 22px/1 system-ui, sans-serif; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  #zoom button + button { border-top: 1px solid #e7ddcb; }
  #zoom button:active { background: #f0e9df; }
  #popup { position: absolute; z-index: 8; display: none; width: 210px; box-sizing: border-box; padding: 10px 12px; border: 1px solid #e7ddcb; border-radius: 10px; background: #fffcf6; box-shadow: 0 8px 24px rgba(21,20,15,.2); pointer-events: auto; }
  #popup strong { display: block; font-size: 14px; color: #15140f; }
  #popup span { display: block; margin-top: 2px; font-size: 12px; line-height: 1.35; color: #5f6b7c; }
  #popup button { display: inline-block; margin-top: 7px; padding: 0; border: 0; background: transparent; color: #b6472a; font-size: 12.5px; font-weight: 600; text-decoration: underline; cursor: pointer; }
  #popup .close { position: absolute; top: 4px; right: 6px; margin: 0; font-size: 16px; line-height: 1; color: #5f6b7c; text-decoration: none; }
  #attrib { position: absolute; right: 4px; bottom: 4px; z-index: 6; padding: 2px 5px; border-radius: 4px; background: rgba(255,252,246,.9); font-size: 10px; color: #3f4a44; pointer-events: auto; }
  #attrib a { color: #3f4a44; }
</style>
</head>
<body>
<div id="map" role="application" aria-label="Map">
  <div id="world">
    <div id="under"></div>
    <div id="tiles"></div>
    <div id="zones"></div>
    <div id="marks"></div>
  </div>
  <div id="zoom" role="group" aria-label="Zoom">
    <button type="button" id="zoom-in" aria-label="Zoom in">+</button>
    <button type="button" id="zoom-out" aria-label="Zoom out">\u2212</button>
  </div>
  <div id="popup"></div>
  <div id="attrib">&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a></div>
</div>
<script>
(function () {
  var TILE = 256;
  var MIN_Z = 3;
  var MAX_Z = 19;
  // One tile of spare map on every side: crossing that line appends the missing
  // row/column, which is cheap, rather than rebuilding the whole page.
  var PAD = TILE;
  // Once a pan has travelled this far, the world offset is folded back into the
  // centre so CSS coordinates stay small. This happens between gestures.
  var REBASE = 6000;
  var MAX_CACHE = 200;
  var FALLBACK = { lat: 31.4504, lng: 73.135, zoom: 12 };
  var state = { center: { lat: FALLBACK.lat, lng: FALLBACK.lng }, zoom: FALLBACK.zoom, data: null };
  var view = { zoom: FALLBACK.zoom, x: 0, y: 0 };
  // World pixel that children's CSS (0, 0) sits on. Fixed while the finger is
  // down; only render() moves it.
  var layout = { x: 0, y: 0 };
  var tiles = { zoom: 0, left: 0, right: -1, top: 0, bottom: -1 };
  var cache = {};
  var cacheCount = 0;
  var clock = 0;
  var underWait = 0;
  var underTimer = null;
  var tileTick = false;
  var map = document.getElementById('map');
  var world = document.getElementById('world');
  var underBox = document.getElementById('under');
  var tileBox = document.getElementById('tiles');
  var zoneBox = document.getElementById('zones');
  var markBox = document.getElementById('marks');
  var popup = document.getElementById('popup');

  function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
  function now() { return window.performance && window.performance.now ? window.performance.now() : Date.now(); }
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
  function worldSize(zoom) { return TILE * Math.pow(2, zoom); }
  function clampViewY() {
    var low = 0;
    var high = Math.max(0, worldSize(view.zoom) - height());
    view.y = clamp(view.y, low, high);
  }
  function screenPoint(lat, lng) {
    var p = project(lat, lng, view.zoom);
    return { x: p.x - view.x, y: p.y - view.y };
  }
  function childPoint(lat, lng) {
    var p = project(lat, lng, view.zoom);
    return { x: p.x - layout.x, y: p.y - layout.y };
  }
  function centerFromView() {
    var c = unproject(view.x + width() / 2, view.y + height() / 2, view.zoom);
    if (!isFinite(c.lat) || !isFinite(c.lng)) return { lat: FALLBACK.lat, lng: FALLBACK.lng };
    return c;
  }
  function post(message) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(message));
  }

  // A drag, a fling and a pinch all move this one layer.
  function applyTransform() {
    var x = layout.x - view.x;
    var y = layout.y - view.y;
    world.style.transform = x || y ? 'translate3d(' + x + 'px,' + y + 'px,0)' : '';
  }

  function underReady(img) {
    if (!img._wait) return;
    img._wait = false;
    underWait = Math.max(0, underWait - 1);
    if (underWait === 0) clearUnder();
  }

  function clearUnder() {
    if (underTimer) { clearTimeout(underTimer); underTimer = null; }
    underWait = 0;
    Object.keys(cache).forEach(function (key) { cache[key].img._wait = false; });
    if (underBox.firstChild) underBox.innerHTML = '';
  }

  // When the zoom changes, the tiles already on screen are stretched into the
  // new pixel scale underneath the real layer: the map stays readable while the
  // new level downloads, instead of flashing the page background.
  function buildUnder(oldZoom) {
    clearUnder();
    if (!oldZoom || oldZoom === view.zoom) return;
    var factor = Math.pow(2, view.zoom - oldZoom);
    if (factor < 0.25 || factor > 8) return;
    var size = TILE * factor;
    var nodes = Array.prototype.slice.call(tileBox.children);
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      if (!node.complete || !node.naturalWidth) continue;
      var img = document.createElement('img');
      img.alt = '';
      img.setAttribute('aria-hidden', 'true');
      img.src = node.getAttribute('src');
      img.style.left = (Number(node.getAttribute('data-tx')) * size - layout.x) + 'px';
      img.style.top = (Number(node.getAttribute('data-ty')) * size - layout.y) + 'px';
      img.style.width = size + 'px';
      img.style.height = size + 'px';
      underBox.appendChild(img);
    }
    if (underBox.firstChild) {
      underTimer = setTimeout(clearUnder, 1500);
    }
  }

  function trimCache() {
    if (cacheCount <= MAX_CACHE) return;
    var keys = Object.keys(cache);
    keys.sort(function (a, b) { return cache[a].used - cache[b].used; });
    for (var i = 0; i < keys.length && cacheCount > MAX_CACHE; i += 1) {
      var node = cache[keys[i]].img;
      if (node.parentNode === tileBox) continue;
      delete cache[keys[i]];
      cacheCount -= 1;
    }
  }

  function addTile(tx, ty) {
    var zoom = view.zoom;
    var count = Math.pow(2, zoom);
    var key = zoom + '/' + tx + '/' + ty;
    var entry = cache[key];
    var fresh = false;
    if (!entry) {
      var img = document.createElement('img');
      img.alt = '';
      img.setAttribute('aria-hidden', 'true');
      img.decoding = 'async';
      img.onload = function () { img.style.opacity = '1'; underReady(img); };
      img.onerror = function () { img.style.opacity = '0'; underReady(img); };
      var wrapped = ((tx % count) + count) % count;
      img.src = 'https://tile.openstreetmap.org/' + zoom + '/' + wrapped + '/' + ty + '.png';
      entry = { img: img, used: 0 };
      cache[key] = entry;
      cacheCount += 1;
      fresh = true;
    }
    entry.used = ++clock;
    var node = entry.img;
    node.setAttribute('data-tx', tx);
    node.setAttribute('data-ty', ty);
    node.style.left = (tx * TILE - layout.x) + 'px';
    node.style.top = (ty * TILE - layout.y) + 'px';
    if (node.parentNode !== tileBox) tileBox.appendChild(node);
    if (node.complete && node.naturalWidth) node.style.opacity = '1';
    // Any tile the under-layer is waiting on (new or still loading) keeps it up.
    if (underBox.firstChild && !node.complete && !node._wait) { node._wait = true; underWait += 1; }
    if (fresh) trimCache();
  }

  // Adds only the tiles the viewport can now see; existing tiles never move.
  function drawTiles() {
    var zoom = view.zoom;
    if (tiles.zoom !== zoom) {
      tileBox.innerHTML = '';
      tiles = { zoom: zoom, left: 0, right: -1, top: 0, bottom: -1 };
    }
    var count = Math.pow(2, zoom);
    var left = Math.floor((view.x - PAD) / TILE);
    var right = Math.floor((view.x + width() + PAD) / TILE);
    var top = Math.max(0, Math.floor((view.y - PAD) / TILE));
    var bottom = Math.min(count - 1, Math.floor((view.y + height() + PAD) / TILE));
    if (left >= tiles.left && right <= tiles.right && top >= tiles.top && bottom <= tiles.bottom) return;
    for (var tx = left; tx <= right; tx += 1) {
      for (var ty = top; ty <= bottom; ty += 1) {
        if (tx >= tiles.left && tx <= tiles.right && ty >= tiles.top && ty <= tiles.bottom) continue;
        addTile(tx, ty);
      }
    }
    var nodes = Array.prototype.slice.call(tileBox.children);
    nodes.forEach(function (node) {
      var nx = Number(node.getAttribute('data-tx'));
      var ny = Number(node.getAttribute('data-ty'));
      if (nx < left - 1 || nx > right + 1 || ny < top - 1 || ny > bottom + 1) tileBox.removeChild(node);
    });
    tiles = { zoom: zoom, left: left, right: right, top: top, bottom: bottom };
  }

  // Runs at most once per frame while panning, so a fast drag does not queue work.
  function scheduleTiles() {
    if (tileTick) return;
    tileTick = true;
    requestAnimationFrame(function () { tileTick = false; drawTiles(); });
  }

  // Zones and the radius circle share one SVG, positioned in world pixels.
  function drawShapes() {
    var data = state.data;
    zoneBox.innerHTML = '';
    if (!data) return;
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', String(width()));
    svg.setAttribute('height', String(height()));
    svg.style.left = '0px';
    svg.style.top = '0px';
    svg.style.overflow = 'visible';
    var drawn = 0;
    if (data.zones) {
      data.zones.forEach(function (zone) {
        var points = zone.ring.map(function (point) {
          var p = project(point[0], point[1], view.zoom);
          return (p.x - layout.x).toFixed(1) + ',' + (p.y - layout.y).toFixed(1);
        }).join(' ');
        var poly = document.createElementNS(ns, 'polygon');
        poly.setAttribute('points', points);
        poly.setAttribute('fill', zone.selected ? 'rgba(28,58,46,0.16)' : 'rgba(100,116,139,0.07)');
        poly.setAttribute('stroke', zone.selected ? '#1c3a2e' : '#6b7280');
        poly.setAttribute('stroke-width', zone.selected ? '2.5' : '1.5');
        var title = document.createElementNS(ns, 'title');
        title.textContent = zone.name || '';
        poly.appendChild(title);
        svg.appendChild(poly);
        drawn += 1;
      });
    }
    if (data.pin && data.radiusKm) {
      var center = project(data.pin.lat, data.pin.lng, view.zoom);
      var metersPerPixel = 156543.03392 * Math.cos(data.pin.lat * Math.PI / 180) / Math.pow(2, view.zoom);
      var circle = document.createElementNS(ns, 'circle');
      circle.setAttribute('cx', String(center.x - layout.x));
      circle.setAttribute('cy', String(center.y - layout.y));
      circle.setAttribute('r', String(data.radiusKm * 1000 / metersPerPixel));
      circle.setAttribute('fill', 'rgba(28,58,46,0.07)');
      circle.setAttribute('stroke', '#1c3a2e');
      circle.setAttribute('stroke-width', '1');
      svg.appendChild(circle);
      drawn += 1;
    }
    if (drawn > 0) zoneBox.appendChild(svg);
  }

  function makeMarker(lat, lng, label, extra, tap) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = extra ? 'marker ' + extra : 'marker';
    button.setAttribute('aria-label', label);
    var at = childPoint(lat, lng);
    button.style.left = at.x + 'px';
    button.style.top = at.y + 'px';
    button._lat = lat;
    button._lng = lng;
    // The pin moves with the layer, so its screen spot is read at tap time.
    button.addEventListener('pointerup', function (event) {
      event.stopPropagation();
      event.preventDefault();
      var screen = screenPoint(lat, lng);
      tap(screen.x, screen.y);
    });
    markBox.appendChild(button);
    return button;
  }

  function pinMarker(lat, lng, kind, label, tap) {
    var button = makeMarker(lat, lng, label, '', tap);
    var pin = document.createElement('span');
    pin.className = 'pin ' + kind;
    pin.appendChild(document.createElement('span'));
    button.appendChild(pin);
    return button;
  }

  function dotMarker(lat, lng, label, tap, kind) {
    var button = makeMarker(lat, lng, label, kind ? 'dot ' + kind : 'dot', tap);
    var dot = document.createElement('span');
    dot.className = kind ? 'dot ' + kind : 'dot';
    button.appendChild(dot);
    return button;
  }

  function cullMarks() {
    var nodes = markBox.children;
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      var at = screenPoint(node._lat, node._lng);
      var away = at.x < -80 || at.y < -90 || at.x > width() + 80 || at.y > height() + 90;
      var next = away ? 'none' : '';
      if (node.style.display !== next) node.style.display = next;
    }
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

    if (item.target) {
      var open = document.createElement('button');
      open.type = 'button';
      open.textContent = item.action || 'Open';
      open.addEventListener('pointerup', function (event) {
        event.stopPropagation();
        post({ type: 'open', targetKind: item.target.kind, targetId: item.target.id });
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

  function drawMarks() {
    var data = state.data;
    markBox.innerHTML = '';
    if (!data) return;
    (data.pins || []).forEach(function (pin) {
      // Shop branches and service providers share the map; the pin colour and
      // the popup's action say which one it is.
      var isProvider = Boolean(pin.providerId);
      var name = isProvider ? pin.providerName : pin.brandName;
      pinMarker(pin.lat, pin.lng, isProvider ? 'provider' : 'shop', name + ', ' + (isProvider ? pin.blockName : pin.branchName), function (x, y) {
        showPopup(
          isProvider
            ? {
                title: pin.providerName,
                lines: [pin.categoryName, pin.blockName, pin.price, pin.distance],
                action: 'View services',
                target: { kind: 'provider', id: pin.providerId },
              }
            : {
                title: pin.brandName,
                lines: [pin.branchName, pin.where, pin.distance],
                action: 'See products',
                target: { kind: 'brand', id: pin.brandId },
              },
          x,
          y,
        );
      });
    });
    if (data.pin) {
      if (data.pin.kind === 'origin') {
        // The website draws the search point as a small blue dot, not a pin.
        dotMarker(data.pin.lat, data.pin.lng, data.pin.label, function (x, y) {
          showPopup({ title: data.pin.label, lines: [] }, x, y);
        });
      } else {
        pinMarker(data.pin.lat, data.pin.lng, 'chosen', data.pin.label, function (x, y) {
          showPopup({ title: data.pin.label, lines: [] }, x, y);
        });
      }
    }
    // The rider's last shared position, drawn as a clay dot on top of the stops.
    if (data.rider) {
      dotMarker(data.rider.lat, data.rider.lng, 'Your rider', function (x, y) {
        showPopup({ title: 'Your rider', lines: ['Last shared position'] }, x, y);
      }, 'rider');
    }
    cullMarks();
  }

  // The one place the whole page is laid out. Runs on data changes, zoom steps
  // and after a pan long enough to need a fresh origin, never mid-gesture. The
  // stretched under-layer is only worth showing for a zoom in place, not when
  // new data moves the map to another part of the city.
  function render(withUnder) {
    var zoom = clamp(Math.round(state.zoom), MIN_Z, MAX_Z);
    if (!isFinite(zoom)) zoom = FALLBACK.zoom;
    var center = project(state.center.lat, state.center.lng, zoom);
    if (!isFinite(center.x) || !isFinite(center.y)) center = project(FALLBACK.lat, FALLBACK.lng, zoom);
    view.zoom = zoom;
    view.x = center.x - width() / 2;
    view.y = center.y - height() / 2;
    clampViewY();
    layout = { x: view.x, y: view.y };
    if (withUnder) buildUnder(tiles.zoom); else clearUnder();
    tileBox.innerHTML = '';
    tiles = { zoom: zoom, left: 0, right: -1, top: 0, bottom: -1 };
    drawTiles();
    drawShapes();
    drawMarks();
    world.style.transform = '';
  }

  // Folds the current pan into the centre after a gesture; cheap, so it may run
  // at the end of every drag. Re-laying out only happens after a very long pan.
  var inertia = null;

  function settle() {
    state.center = centerFromView();
    cullMarks();
    if (Math.abs(view.x - layout.x) > REBASE || Math.abs(view.y - layout.y) > REBASE) render();
  }

  function stopInertia() {
    if (!inertia) return;
    inertia = null;
    state.center = centerFromView();
  }

  function startInertia(vx, vy) {
    var speed = Math.hypot(vx, vy);
    if (!isFinite(speed) || speed < 0.12) return;
    // Cap the launch speed so a hard flick does not send the map into orbit.
    var cap = Math.min(speed, 3.2);
    inertia = { vx: vx / speed * cap, vy: vy / speed * cap, at: now() };
    requestAnimationFrame(fling);
  }

  function fling() {
    if (!inertia) return;
    var at = now();
    var dt = clamp(at - inertia.at, 0, 32);
    inertia.at = at;
    view.x += inertia.vx * dt;
    view.y += inertia.vy * dt;
    clampViewY();
    applyTransform();
    drawTiles();
    var damp = Math.pow(0.94, dt / 16);
    inertia.vx *= damp;
    inertia.vy *= damp;
    if (Math.hypot(inertia.vx, inertia.vy) > 0.02) {
      requestAnimationFrame(fling);
    } else {
      inertia = null;
      settle();
    }
  }

  function fit() {
    // A WebView can report a zero-sized viewport during its first layout pass;
    // wait a tick rather than fitting to an impossible size (which is NaN).
    if (width() < 80 || height() < 80) {
      setTimeout(fit, 60);
      return;
    }
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
      // The customer's rider: the first sight of it also frames the way to the door.
      if (data.rider) points.push({ lat: data.rider.lat, lng: data.rider.lng });
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
    var point = unproject(clientX + view.x, clientY + view.y, view.zoom);
    post({ type: 'pick', lat: point.lat, lng: point.lng });
  }

  function zoomAt(clientX, clientY, nextZoom) {
    var zoom = clamp(Math.round(nextZoom), MIN_Z, MAX_Z);
    if (zoom === view.zoom) return;
    var anchor = unproject(clientX + view.x, clientY + view.y, view.zoom);
    var point = project(anchor.lat, anchor.lng, zoom);
    view.zoom = zoom;
    view.x = point.x - clientX;
    view.y = point.y - clientY;
    clampViewY();
    state.zoom = zoom;
    state.center = centerFromView();
    render(true);
  }

  var pointers = {};
  var drag = null;
  var pinch = null;
  var suppressTap = false;

  function countKeys(object) { return Object.keys(object).length; }

  function startPinch() {
    var ids = Object.keys(pointers);
    var a = pointers[ids[0]];
    var b = pointers[ids[1]];
    var mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    var distance = Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1);
    var anchor = unproject(mid.x + view.x, mid.y + view.y, view.zoom);
    pinch = { dist: distance, zoom: view.zoom, lat: anchor.lat, lng: anchor.lng, scale: 1, mid: mid, ids: [ids[0], ids[1]] };
    drag = null;
    suppressTap = true;
    world.style.transform = '';
    applyTransform();
  }

  function finishPinch() {
    var p = pinch;
    pinch = null;
    if (!p) return;
    var scale = p.scale > 0 ? p.scale : 1;
    var target = clamp(Math.round(p.zoom + Math.log(scale) / Math.LN2), MIN_Z, MAX_Z);
    var anchor = project(p.lat, p.lng, target);
    view.zoom = target;
    view.x = anchor.x - p.mid.x;
    view.y = anchor.y - p.mid.y;
    clampViewY();
    state.zoom = target;
    state.center = centerFromView();
    world.style.transform = '';
    render(true);
  }

  map.addEventListener('pointerdown', function (event) {
    var target = event.target;
    if (target.closest && (target.closest('.marker') || target.closest('#popup') || target.closest('#attrib') || target.closest('#zoom'))) return;
    var hadPopup = popup.style.display === 'block';
    stopInertia();
    pointers[event.pointerId] = { x: event.clientX, y: event.clientY };
    if (map.setPointerCapture) { try { map.setPointerCapture(event.pointerId); } catch (err) {} }
    if (countKeys(pointers) === 1) {
      drag = {
        x: event.clientX, y: event.clientY,
        sx: event.clientX, sy: event.clientY,
        viewX: view.x, viewY: view.y,
        moved: false, vx: 0, vy: 0, at: now(),
      };
      pinch = null;
      // The first tap on the map closes an open card; it does not move the pin.
      suppressTap = hadPopup;
    } else if (countKeys(pointers) === 2) {
      startPinch();
    }
    closePopup();
  });

  map.addEventListener('pointermove', function (event) {
    var point = pointers[event.pointerId];
    if (!point) return;
    point.x = event.clientX;
    point.y = event.clientY;
    if (event.cancelable) event.preventDefault();

    if (pinch) {
      var a = pointers[pinch.ids[0]];
      var b = pointers[pinch.ids[1]];
      if (!a || !b) return;
      var mid = pinch.mid;
      mid.x = (a.x + b.x) / 2;
      mid.y = (a.y + b.y) / 2;
      var distance = Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1);
      var minS = Math.pow(2, MIN_Z - pinch.zoom);
      var maxS = Math.pow(2, MAX_Z - pinch.zoom);
      var scale = clamp(distance / pinch.dist, minS, maxS);
      pinch.scale = scale;
      var anchor = project(pinch.lat, pinch.lng, pinch.zoom);
      var cx = anchor.x - layout.x;
      var cy = anchor.y - layout.y;
      world.style.transform = 'translate3d(' + (mid.x - cx * scale) + 'px,' + (mid.y - cy * scale) + 'px,0) scale(' + scale + ')';
      return;
    }

    if (!drag) return;
    var dx = event.clientX - drag.x;
    var dy = event.clientY - drag.y;
    if (!drag.moved && Math.abs(event.clientX - drag.sx) + Math.abs(event.clientY - drag.sy) > 6) drag.moved = true;
    if (!drag.moved) return;
    var at = now();
    var dt = at - drag.at;
    if (dt > 0) {
      // Smoothed finger velocity (pixels per millisecond), used for the fling.
      drag.vx = drag.vx * 0.7 + (-dx / dt) * 0.3;
      drag.vy = drag.vy * 0.7 + (-dy / dt) * 0.3;
      drag.at = at;
    }
    drag.x = event.clientX;
    drag.y = event.clientY;
    view.x = drag.viewX - (event.clientX - drag.sx);
    view.y = drag.viewY - (event.clientY - drag.sy);
    clampViewY();
    applyTransform();
    scheduleTiles();
  });

  function release(event) {
    if (!pointers[event.pointerId]) return;
    delete pointers[event.pointerId];
    if (map.releasePointerCapture) { try { map.releasePointerCapture(event.pointerId); } catch (err) {} }
    var remaining = countKeys(pointers);

    if (pinch) {
      if (remaining < 2) {
        finishPinch();
        if (remaining === 1) {
          var only = pointers[Object.keys(pointers)[0]];
          drag = {
            x: only.x, y: only.y, sx: only.x, sy: only.y,
            viewX: view.x, viewY: view.y,
            moved: true, vx: 0, vy: 0, at: now(),
          };
        } else {
          drag = null;
          suppressTap = false;
        }
      }
      return;
    }

    if (remaining === 0) {
      if (!drag) { suppressTap = false; return; }
      var tap = !drag.moved && !suppressTap;
      var vx = drag.vx;
      var vy = drag.vy;
      drag = null;
      suppressTap = false;
      settle();
      if (tap) pick(event.clientX, event.clientY);
      else startInertia(vx, vy);
    }
  }

  map.addEventListener('pointerup', release);
  map.addEventListener('pointercancel', release);

  map.addEventListener('wheel', function (event) {
    event.preventDefault();
    stopInertia();
    closePopup();
    zoomAt(event.clientX, event.clientY, view.zoom + (event.deltaY < 0 ? 1 : -1));
  }, { passive: false });

  document.getElementById('zoom-in').addEventListener('click', function () {
    stopInertia();
    closePopup();
    zoomAt(width() / 2, height() / 2, view.zoom + 1);
  });
  document.getElementById('zoom-out').addEventListener('click', function () {
    stopInertia();
    closePopup();
    zoomAt(width() / 2, height() / 2, view.zoom - 1);
  });

  var attrib = document.getElementById('attrib');
  attrib.addEventListener('pointerup', function (event) { event.stopPropagation(); });

  window.addEventListener('resize', function () {
    stopInertia();
    state.center = centerFromView();
    render();
  });

  window.CityCartMap = {
    setData: function (data) {
      stopInertia();
      // A new payload (a wider search, a moved pin) keeps the rider already on the map.
      var rider = state.data && state.data.rider;
      state.data = data || null;
      if (state.data && rider) state.data.rider = rider;
      closePopup();
      map.className = data && data.pickable ? 'pickable' : '';
      map.setAttribute('aria-label', (data && data.label) || 'Map');
      fit();
    },
    // A city choice or a recenter frames a whole rectangle instead of fitting
    // the pins, so the view can leave the current results behind.
    setFocus: function (bounds) {
      if (!bounds) return;
      stopInertia();
      closePopup();
      var sw = project(bounds.south, bounds.west, 0);
      var ne = project(bounds.north, bounds.east, 0);
      var dx = Math.max(Math.abs(ne.x - sw.x), 0.000001);
      var dy = Math.max(Math.abs(ne.y - sw.y), 0.000001);
      var scale = Math.min((width() - 32) / dx, (height() - 32) / dy);
      state.zoom = clamp(Math.round(Math.log(scale) / Math.LN2), 8, 13);
      state.center = unproject((sw.x + ne.x) / 2, (sw.y + ne.y) / 2, 0);
      render();
    },
    recenter: function () {
      stopInertia();
      closePopup();
      fit();
    },
    // Move only the rider dot. The first shared position (or a fresh one after a
    // pause) frames the rider and the delivery pin together; later moves do not
    // move the camera, so the page stays where the customer put it.
    setRider: function (lat, lng) {
      if (!state.data) return;
      var shown = Boolean(state.data.rider);
      var valid = isFinite(lat) && isFinite(lng);
      if (!valid && !shown) return;
      state.data.rider = valid ? { lat: Number(lat), lng: Number(lng), label: 'Your rider' } : null;
      if (state.data.rider && !shown) fit();
      else drawMarks();
    },
  };

  render();
  post({ type: 'ready' });
})();
</script>
</body>
</html>`
