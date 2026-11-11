import 'package:flutter/material.dart';

import '../../core/format.dart';
import '../../core/status.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/models.dart';
import 'delivery_rules.dart';

class CurrentJobCard extends StatelessWidget {
  const CurrentJobCard({
    super.key,
    required this.delivery,
    required this.onTap,
  });

  final RiderDelivery delivery;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final money = cashLineFor(delivery);
    final progress = progressIndexFor(delivery.status);
    final customer = delivery.address?.name ?? 'Customer';
    final area = delivery.address?.line ?? '';

    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      excludeFromSemantics: true,
      child: Container(
        decoration: BoxDecoration(
          color: AppColors.forest,
          borderRadius: BorderRadius.circular(26),
          boxShadow: const [
            BoxShadow(
              color: Color(0x2E1E3A2F),
              blurRadius: 26,
              offset: Offset(0, 12),
            ),
          ],
        ),
        clipBehavior: Clip.antiAlias,
        child: Stack(
          children: [
            Positioned(
              right: -50,
              top: -70,
              child: Container(
                width: 190,
                height: 190,
                decoration: BoxDecoration(
                  color: AppColors.surface.withValues(alpha: 0.045),
                  shape: BoxShape.circle,
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(22, 20, 22, 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 9,
                          vertical: 5,
                        ),
                        decoration: BoxDecoration(
                          color: AppColors.surface.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(AppRadius.pill),
                        ),
                        child: Text(
                          friendlyStatus(delivery.status).toUpperCase(),
                          style: TextStyle(
                            fontSize: 10.5,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 1.2,
                            color: AppColors.surface.withValues(alpha: 0.85),
                          ),
                        ),
                      ),
                      const Spacer(),
                      Text(
                        delivery.orderNumber ?? 'Delivery',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: AppColors.surface.withValues(alpha: 0.7),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Text(
                    customer,
                    style: const TextStyle(
                      fontSize: 23,
                      height: 1.15,
                      fontWeight: FontWeight.w700,
                      color: AppColors.surface,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (area.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      area,
                      style: TextStyle(
                        fontSize: 13.5,
                        height: 1.35,
                        color: AppColors.surface.withValues(alpha: 0.72),
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                  const SizedBox(height: 18),
                  if (progress != null) StepRail(index: progress, onDark: true),
                  if (delivery.status == 'FAILED') ...[
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 10,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.surface.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Row(
                        children: [
                          const Icon(
                            Icons.replay_rounded,
                            size: 17,
                            color: AppColors.surface,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              delivery.failureReason?.isNotEmpty == true
                                  ? 'Last try: ${delivery.failureReason}'
                                  : 'Last attempt was not delivered.',
                              style: TextStyle(
                                fontSize: 12.5,
                                color: AppColors.surface.withValues(
                                  alpha: 0.85,
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                  const SizedBox(height: 18),
                  Container(
                    height: 1,
                    color: AppColors.surface.withValues(alpha: 0.12),
                  ),
                  const SizedBox(height: 16),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Expanded(
                        child: _MoneyBlock(
                          line: money,
                          currency: delivery.currency,
                        ),
                      ),
                      const SizedBox(width: 12),
                      ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 168),
                        child: AppButton(
                          label: _ctaFor(delivery.status),
                          variant: AppButtonVariant.cream,
                          height: 48,
                          icon: Icons.arrow_forward_rounded,
                          onPressed: onTap,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _ctaFor(String status) => switch (status) {
    'READY_FOR_PICKUP' => 'Review pickup',
    'PICKED_UP' || 'IN_TRANSIT' => 'Review delivery',
    'OUT_FOR_DELIVERY' => 'Complete delivery',
    'FAILED' => 'Try again',
    _ => 'Open job',
  };
}

class _MoneyBlock extends StatelessWidget {
  const _MoneyBlock({required this.line, required this.currency});

  final CashLine line;
  final String currency;

  @override
  Widget build(BuildContext context) {
    final label = switch (line.kind) {
      CashKind.collect => 'COLLECT ON DELIVERY',
      CashKind.rejected => 'COLLECT AGAIN',
      CashKind.waiting => 'PAYMENT WITH THE STORE',
      CashKind.prepaid => 'ALREADY PAID ONLINE',
      CashKind.collected => 'CASH COLLECTED',
      CashKind.proof => 'PAID AT THE DOOR',
      CashKind.none => 'NOTHING TO COLLECT',
    };

    final amount = switch (line.kind) {
      CashKind.collect ||
      CashKind.rejected => formatMoney(line.amount, currency: currency),
      _ => null,
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.w700,
            letterSpacing: 1.1,
            color: AppColors.surface.withValues(alpha: 0.62),
          ),
        ),
        const SizedBox(height: 5),
        if (amount != null)
          Text(
            amount,
            style: const TextStyle(
              fontSize: 30,
              height: 1.05,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.8,
              color: AppColors.surface,
              fontFeatures: [FontFeature.tabularFigures()],
            ),
          )
        else
          Text(
            switch (line.kind) {
              CashKind.waiting => 'Waiting for a check',
              CashKind.prepaid => 'Collect nothing',
              CashKind.collected => 'In your cash',
              CashKind.proof => friendlyProofStatus(line.proofStatus),
              _ => 'All returned',
            },
            maxLines: 2,
            style: TextStyle(
              fontSize: 13,
              height: 1.3,
              color: AppColors.surface.withValues(alpha: 0.85),
            ),
          ),
      ],
    );
  }
}

class DeliveryRow extends StatelessWidget {
  const DeliveryRow({super.key, required this.delivery, required this.onTap});

  final RiderDelivery delivery;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final waiting = isWaitingOnStore(delivery);
    final money = cashLineFor(delivery);
    final customer = delivery.address?.name ?? 'Customer';
    final area = delivery.address?.area ?? '';
    final amount =
        money.kind == CashKind.collect || money.kind == CashKind.rejected
        ? money.amount
        : 0.0;

    return SurfaceCard(
      onTap: onTap,
      padding: const EdgeInsets.fromLTRB(16, 15, 12, 15),
      color: waiting
          ? AppColors.surface.withValues(alpha: 0.62)
          : AppColors.surface,
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: waiting
                  ? AppColors.paperDeep
                  : _toneBackground(delivery.status),
              shape: BoxShape.circle,
            ),
            child: Icon(
              waiting
                  ? Icons.hourglass_top_rounded
                  : _toneIcon(delivery.status),
              size: 19,
              color: waiting
                  ? AppColors.muted
                  : _toneForeground(delivery.status),
            ),
          ),
          const SizedBox(width: 13),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        customer,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 15.5,
                          fontWeight: FontWeight.w600,
                          color: waiting ? AppColors.inkSoft : AppColors.ink,
                        ),
                      ),
                    ),
                    if (delivery.paymentRejected) ...[
                      const SizedBox(width: 8),
                      const Pill(
                        text: 'Collect again',
                        background: AppColors.claySoft,
                        foreground: AppColors.clay,
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 3),
                Text(
                  [
                    area,
                    friendlyStatus(delivery.status),
                  ].where((part) => part.isNotEmpty).join(' · '),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          if (amount > 0)
            Text(
              formatMoney(amount, currency: delivery.currency),
              style: const TextStyle(
                fontSize: 14.5,
                fontWeight: FontWeight.w700,
                color: AppColors.ink,
              ),
            )
          else if (money.kind == CashKind.prepaid)
            const Text(
              'Paid',
              style: TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w600,
                color: AppColors.sageInk,
              ),
            ),
          const SizedBox(width: 2),
          const Icon(
            Icons.chevron_right_rounded,
            size: 22,
            color: AppColors.muted,
          ),
        ],
      ),
    );
  }

  Color _toneBackground(String status) => switch (toneForStatus(status)) {
    StatusTone.clay => AppColors.claySoft,
    StatusTone.sage => AppColors.sage,
    StatusTone.forest => AppColors.sage,
    StatusTone.amber => AppColors.amber,
    StatusTone.danger => AppColors.dangerSoft,
    StatusTone.muted => AppColors.paperDeep,
  };

  Color _toneForeground(String status) => switch (toneForStatus(status)) {
    StatusTone.clay => AppColors.clay,
    StatusTone.sage => AppColors.sageInk,
    StatusTone.forest => AppColors.forest,
    StatusTone.amber => AppColors.amberInk,
    StatusTone.danger => AppColors.danger,
    StatusTone.muted => AppColors.muted,
  };

  IconData _toneIcon(String status) => switch (status) {
    'READY_FOR_PICKUP' => Icons.inventory_2_outlined,
    'PICKED_UP' || 'IN_TRANSIT' => Icons.two_wheeler_rounded,
    'OUT_FOR_DELIVERY' => Icons.location_on_outlined,
    'FAILED' => Icons.replay_rounded,
    _ => Icons.receipt_long_outlined,
  };
}
