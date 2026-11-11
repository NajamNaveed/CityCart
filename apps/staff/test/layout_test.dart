import 'package:citycart_staff/core/status.dart';
import 'package:citycart_staff/core/theme.dart';
import 'package:citycart_staff/core/widgets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Shared pieces are the ones every screen reuses, so a break here would show
/// up in many places. These tests pump them at the smallest phone width the
/// app supports with a large accessibility text scale.
Widget _frame(Widget child, {double textScale = 1.3}) {
  return MaterialApp(
    theme: AppTheme.light,
    builder: (context, appChild) => MediaQuery(
      data: MediaQuery.of(context)
          .copyWith(textScaler: TextScaler.linear(textScale)),
      child: appChild!,
    ),
    home: Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: child,
        ),
      ),
    ),
  );
}

Future<void> _pumpAtWidth(
  WidgetTester tester,
  Widget child,
  double width,
) async {
  tester.view.physicalSize = Size(width, 720);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(_frame(child));
  // A loading button spins forever, so settle only one frame of animation.
  await tester.pump(const Duration(milliseconds: 100));
}

void main() {
  testWidgets('buttons hold long labels on a narrow screen', (tester) async {
    const label = 'Settle all cash collected today';
    await _pumpAtWidth(
      tester,
      Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final variant in AppButtonVariant.values) ...[
            AppButton(
              label: label,
              icon: Icons.check_circle_outline_rounded,
              variant: variant,
              onPressed: () {},
            ),
            const SizedBox(height: 10),
          ],
          AppButton(
            label: '$label and continue to the next delivery',
            loading: true,
            helper: 'This may take a moment on a slow connection.',
            onPressed: () {},
          ),
        ],
      ),
      320,
    );

    expect(tester.takeException(), isNull);
  });

  testWidgets('summary cards and info rows fit a narrow screen', (
    tester,
  ) async {
    final child = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: const [
            Expanded(
              child: MetricTile(
                label: 'Cash waiting to be collected',
                value: 'Rs 128,450',
                caption: 'From 4 riders',
                tone: StatusTone.forest,
                icon: Icons.payments_outlined,
              ),
            ),
            SizedBox(width: 10),
            Expanded(
              child: MetricTile(
                label: 'Proofs to check',
                value: '12',
                caption: 'Two look like duplicates',
                tone: StatusTone.amber,
                icon: Icons.receipt_long_outlined,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        SurfaceCard(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const ProductThumb(size: 52),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Builder(
                      builder: (context) => Text(
                        'Sri Lankan red rice, 5 kg family bag',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                    ),
                    const SizedBox(height: 7),
                    const Wrap(
                      spacing: 7,
                      runSpacing: 7,
                      children: [
                        StatusPill(
                          text: 'Out for delivery',
                          tone: StatusTone.info,
                          compact: true,
                        ),
                        StatusPill(
                          text: 'Cash on delivery',
                          tone: StatusTone.muted,
                          compact: true,
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              const SizedBox(width: 86, child: MoneyText('Rs 128,450')),
            ],
          ),
        ),
        const SizedBox(height: 12),
        const InfoRow(
          label: 'Delivery address',
          value:
              'No. 42, Temple Road, Kandy, Central Province, Sri Lanka, 20000',
        ),
        const InfoRow(
          label: 'Amount to collect',
          value: 'Rs 128,450.00',
          strong: true,
        ),
        const SizedBox(height: 12),
        const NoticeCard(
          title: 'Read this before you settle',
          message:
              'A cash settlement cannot be undone. Count the notes before you '
              'confirm the amount with the rider.',
          icon: Icons.info_outline_rounded,
        ),
        const SizedBox(height: 12),
        const ErrorNotice(
          message:
              'The cash list could not be loaded. Check the connection and '
              'try again.',
          onRetry: _noop,
        ),
      ],
    );

    await _pumpAtWidth(tester, child, 320);

    expect(tester.takeException(), isNull);
  });

  testWidgets('segments, chips and headers fit a narrow screen', (
    tester,
  ) async {
    await _pumpAtWidth(
      tester,
      StatefulBuilder(
        builder: (context, setState) {
          var segment = 0;
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              PageHeader(
                eyebrow: 'Daily takings',
                title: 'Money for today',
                subtitle: 'Receipts, payment proofs and cash with riders',
                trailing: const StatusPill(
                  text: 'As of 09:41',
                  tone: StatusTone.sage,
                  compact: true,
                ),
              ),
              SegmentedControl<int>(
                values: const [0, 1, 2],
                labelOf: (value) =>
                    const ['Receipts', 'To verify', 'Cash in hand'][value],
                value: segment,
                onChanged: (value) => setState(() => segment = value),
              ),
              const SizedBox(height: 12),
              FilterChips<String>(
                values: const ['All', 'Coming back', 'Received'],
                labelOf: (value) => value,
                value: 'All',
                countOf: (value) => value == 'All' ? 18 : 3,
                onChanged: (_) {},
              ),
              const SizedBox(height: 12),
              const EmptyState(
                icon: Icons.inbox_outlined,
                title: 'No returns yet',
                message:
                    'When a customer sends something back it will appear here '
                    'with the reason and the delivery details.',
              ),
              const SizedBox(height: 12),
              const Align(
                alignment: Alignment.centerLeft,
                child: Avatar(name: 'Mohamed Ahamed Najam'),
              ),
            ],
          );
        },
      ),
      320,
    );

    expect(tester.takeException(), isNull);
  });
}

void _noop() {}
