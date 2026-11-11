import 'package:citycart_staff/core/theme.dart';
import 'package:citycart_staff/features/auth/login_screen.dart';
import 'package:citycart_staff/providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  Future<void> pumpLogin(
    WidgetTester tester, {
    double width = 320,
    double height = 640,
    double textScale = 1.3,
  }) async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    tester.view.physicalSize = Size(width, height);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
        child: MaterialApp(
          theme: AppTheme.light,
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context)
                .copyWith(textScaler: TextScaler.linear(textScale)),
            child: child!,
          ),
          home: const LoginScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('sign-in screen fits a narrow phone with large text', (
    tester,
  ) async {
    await pumpLogin(tester);

    expect(find.text('CityCart Staff'), findsOneWidget);
    expect(find.text('Work email'), findsOneWidget);
    expect(find.text('Password'), findsOneWidget);
    expect(find.text('Sign in'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('empty sign-in explains both missing fields', (tester) async {
    await pumpLogin(tester);

    await tester.tap(find.text('Sign in'));
    await tester.pumpAndSettle();

    expect(find.text('Enter your work email.'), findsOneWidget);
    expect(find.text('Enter your password.'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('sign-in screen stays intact at the default text scale', (
    tester,
  ) async {
    await pumpLogin(tester, width: 360, height: 720, textScale: 1);

    expect(find.text('Sign in'), findsOneWidget);
    expect(find.textContaining('No server address set'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
