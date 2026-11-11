import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/widgets.dart';
import '../../providers.dart';

/// Lets the app be pointed at a server without rebuilding it. A release build
/// bakes the address in, so the button that opens this is hidden then.
Future<void> showServerAddressSheet(
  BuildContext context,
  WidgetRef ref,
  ServerSettings settings,
) async {
  final controller = TextEditingController(text: settings.url ?? '');
  final saved = await showFormSheet<bool>(
    context,
    title: 'Server address',
    subtitle:
        'The address of your CityCart API. On an Android emulator with the '
        'server on this computer, that is usually http://10.0.2.2:5000.',
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: controller,
          autofocus: true,
          keyboardType: TextInputType.url,
          decoration: const InputDecoration(
            labelText: 'Server address',
            hintText: 'https://api.example.com',
            prefixIcon: Icon(Icons.link_rounded, size: 20),
          ),
        ),
        const SizedBox(height: 16),
        AppButton(
          label: 'Save address',
          icon: Icons.check_rounded,
          onPressed: () async {
            try {
              await settings.save(controller.text);
              if (context.mounted) Navigator.of(context).pop(true);
            } on FormatException catch (error) {
              if (!context.mounted) return;
              showAppSnack(context, error.message, error: true);
            }
          },
        ),
      ],
    ),
  );
  controller.dispose();
  if (saved == true && context.mounted) {
    ref.read(apiClientProvider).setBaseUrl(settings.url);
    showAppSnack(context, 'Server address saved.');
  }
}
