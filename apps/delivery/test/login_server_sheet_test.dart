import 'package:citycart_delivery/features/auth/login_screen.dart';
import 'package:citycart_delivery/providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  testWidgets('saving a server address closes the sheet cleanly', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(900, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    SharedPreferences.setMockInitialValues({});
    final preferences = await SharedPreferences.getInstance();

    await tester.pumpWidget(
      ProviderScope(
        overrides: [sharedPreferencesProvider.overrideWithValue(preferences)],
        child: const MaterialApp(home: LoginScreen()),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Set up server').first);
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byType(TextField).last,
      'http://127.0.0.1:5001',
    );
    await tester.tap(find.text('Save address'));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(preferences.getString('citycart.delivery.api_url'), isNotNull);
  });
}
