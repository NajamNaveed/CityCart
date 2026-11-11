import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:citycart_delivery/core/theme.dart';
import 'package:citycart_delivery/core/widgets.dart';

Widget _wrap(Widget child) => MaterialApp(
  theme: AppTheme.light,
  home: Scaffold(body: Center(child: child)),
);

void main() {
  testWidgets('a status pill uses the rider\'s words, not the server\'s', (
    tester,
  ) async {
    await tester.pumpWidget(
      _wrap(const StatusPill(status: 'READY_FOR_PICKUP')),
    );
    expect(find.text('Ready to pick up'), findsOneWidget);
    expect(find.textContaining('READY_FOR_PICKUP'), findsNothing);
  });

  testWidgets('an empty state explains what to do next', (tester) async {
    await tester.pumpWidget(
      _wrap(
        EmptyState(
          icon: Icons.wb_sunny_outlined,
          title: 'All caught up',
          message: 'No jobs are waiting for you right now.',
          action: AppButton(
            label: 'Check again',
            expand: false,
            height: 48,
            onPressed: () {},
          ),
        ),
      ),
    );

    expect(find.text('All caught up'), findsOneWidget);
    expect(find.text('Check again'), findsOneWidget);
  });

  testWidgets('a disabled primary action is shown disabled', (tester) async {
    await tester.pumpWidget(_wrap(const AppButton(label: 'Finish delivery')));
    final button = tester.widget<FilledButton>(find.byType(FilledButton));

    expect(button.onPressed, isNull);
    expect(find.text('Finish delivery'), findsOneWidget);
  });
}
