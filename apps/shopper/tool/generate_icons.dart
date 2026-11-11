// Renders the launcher icon from the same forest + cream shopping bag used by
// the sign-in mark, so the icon, splash and app chrome match.
//
// Run from apps/shopper:
//   flutter test tool/generate_icons.dart
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

const _forest = Color(0xFF2F4A3C);
const _cream = Color(0xFFFBF4EA);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('render the shopper launcher icon', () async {
    final font = _findMaterialIcons();
    if (font == null) {
      fail('MaterialIcons font not found in the Flutter SDK.');
    }
    final loader = FontLoader('MaterialIcons')
      ..addFont(font.readAsBytes().then((bytes) => bytes.buffer.asByteData()));
    await loader.load();

    final root = Directory.current.path;

    Future<void> writeIcon(
      String relative,
      int size, {
      bool alpha = false,
    }) async {
      final image = await _render(size, background: !alpha);
      final file = File('$root/$relative');
      await file.parent.create(recursive: true);
      if (alpha) {
        final data = await image.toByteData(format: ui.ImageByteFormat.png);
        await file.writeAsBytes(data!.buffer.asUint8List());
      } else {
        await file.writeAsBytes(await _pngRgb(image));
      }
      stdout.writeln('${relative.padRight(62)} ${size}x$size');
    }

    await writeIcon('assets/icon/app_icon.png', 1024);

    const android = {
      'mipmap-mdpi': 48,
      'mipmap-hdpi': 72,
      'mipmap-xhdpi': 96,
      'mipmap-xxhdpi': 144,
      'mipmap-xxxhdpi': 192,
    };
    for (final entry in android.entries) {
      await writeIcon(
        'android/app/src/main/res/${entry.key}/ic_launcher.png',
        entry.value,
      );
    }

    // Adaptive icon foreground: 108dp canvas, the bag stays inside the 66dp
    // safe zone so no launcher mask can clip it.
    const adaptive = {
      'mipmap-mdpi': 108,
      'mipmap-hdpi': 162,
      'mipmap-xhdpi': 216,
      'mipmap-xxhdpi': 324,
      'mipmap-xxxhdpi': 432,
    };
    for (final entry in adaptive.entries) {
      await writeIcon(
        'android/app/src/main/res/${entry.key}/ic_launcher_foreground.png',
        entry.value,
        alpha: true,
      );
    }

    final contents = jsonDecode(
      File('$root/ios/Runner/Assets.xcassets/AppIcon.appiconset/Contents.json')
          .readAsStringSync(),
    ) as Map<String, dynamic>;
    for (final image in contents['images'] as List) {
      final entry = image as Map<String, dynamic>;
      final filename = entry['filename'] as String?;
      final size = (entry['size'] as String?)?.split('x').first;
      if (filename == null || size == null) continue;
      final scale = int.parse((entry['scale'] as String).replaceAll('x', ''));
      final pixels = (double.parse(size) * scale).round();
      await writeIcon(
        'ios/Runner/Assets.xcassets/AppIcon.appiconset/$filename',
        pixels,
      );
    }

    await writeIcon('web/favicon.png', 32);
    await writeIcon('web/icons/Icon-192.png', 192);
    await writeIcon('web/icons/Icon-512.png', 512);
    await writeIcon('web/icons/Icon-maskable-192.png', 192);
    await writeIcon('web/icons/Icon-maskable-512.png', 512);
  });
}

Future<ui.Image> _render(int size, {required bool background}) async {
  final side = size.toDouble();
  final recorder = ui.PictureRecorder();
  final canvas = Canvas(recorder, Rect.fromLTWH(0, 0, side, side));
  if (background) {
    canvas.drawRect(Rect.fromLTWH(0, 0, side, side), Paint()..color = _forest);
  }

  final icon = Icons.shopping_bag_rounded;
  final painter = TextPainter(
    text: TextSpan(
      text: String.fromCharCode(icon.codePoint),
      style: TextStyle(
        fontFamily: icon.fontFamily,
        fontSize: side * 0.6,
        color: _cream,
      ),
    ),
    textDirection: TextDirection.ltr,
  )..layout();
  painter.paint(
    canvas,
    Offset((side - painter.width) / 2, (side - painter.height) / 2),
  );

  return recorder.endRecording().toImage(size, size);
}

/// PNG with 8-bit RGB pixels and no alpha channel. Apple rejects App Store
/// icons that carry transparency, even fully opaque ones.
Future<Uint8List> _pngRgb(ui.Image image) async {
  final rgba = await image.toByteData(format: ui.ImageByteFormat.rawRgba);
  final width = image.width;
  final height = image.height;
  final pixels = rgba!.buffer.asUint8List();

  final raw = Uint8List(height * (1 + width * 3));
  var src = 0;
  var dst = 0;
  for (var y = 0; y < height; y++) {
    raw[dst++] = 0;
    for (var x = 0; x < width; x++) {
      raw[dst++] = pixels[src];
      raw[dst++] = pixels[src + 1];
      raw[dst++] = pixels[src + 2];
      src += 4;
    }
  }

  final out = BytesBuilder();
  out.add(const [137, 80, 78, 71, 13, 10, 26, 10]);

  void chunk(String type, List<int> data) {
    final body = <int>[...ascii.encode(type), ...data];
    out.add((ByteData(4)..setUint32(0, data.length)).buffer.asUint8List());
    out.add(body);
    out.add((ByteData(4)..setUint32(0, _crc32(body))).buffer.asUint8List());
  }

  chunk(
    'IHDR',
    (ByteData(13)
          ..setUint32(0, width)
          ..setUint32(4, height)
          ..setUint8(8, 8)
          ..setUint8(9, 2))
        .buffer
        .asUint8List(),
  );
  chunk('IDAT', ZLibCodec(level: 9).encode(raw));
  chunk('IEND', const []);
  return out.toBytes();
}

final _crcTable = List<int>.generate(256, (n) {
  var value = n;
  for (var bit = 0; bit < 8; bit++) {
    value = (value & 1) != 0 ? 0xEDB88320 ^ (value >> 1) : value >> 1;
  }
  return value;
});

int _crc32(List<int> bytes) {
  var crc = 0xFFFFFFFF;
  for (final byte in bytes) {
    crc = _crcTable[(crc ^ byte) & 0xFF] ^ (crc >> 8);
  }
  return crc ^ 0xFFFFFFFF;
}

File? _findMaterialIcons() {
  final candidates = <File>[];
  final root = Platform.environment['FLUTTER_ROOT'];
  if (root != null && root.isNotEmpty) {
    candidates.add(
      File(
        '$root/bin/cache/artifacts/material_fonts/materialicons-regular.otf',
      ),
    );
  }
  var dir = File(Platform.resolvedExecutable).parent;
  for (var i = 0; i < 10; i++) {
    candidates.add(
      File('${dir.path}/artifacts/material_fonts/materialicons-regular.otf'),
    );
    candidates.add(
      File(
        '${dir.path}/bin/cache/artifacts/material_fonts/materialicons-regular.otf',
      ),
    );
    dir = dir.parent;
  }
  for (final candidate in candidates) {
    if (candidate.existsSync()) return candidate;
  }
  return null;
}
