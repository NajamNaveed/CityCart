import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../providers.dart';

/// What the rider is holding. The app only reads the server's figure; money is
/// settled with the store in person, so there is deliberately no "send" button
/// here to invent.
class CashScreen extends ConsumerStatefulWidget {
  const CashScreen({super.key});

  @override
  ConsumerState<CashScreen> createState() => _CashScreenState();
}

class _CashScreenState extends ConsumerState<CashScreen> {
  CashInHand? _cash;
  bool _loading = true;
  String? _error;
  DateTime? _checkedAt;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (_cash == null) setState(() => _loading = true);
    try {
      final cash = await ref.read(deliveryRepositoryProvider).cash();
      if (!mounted) return;
      setState(() {
        _cash = cash;
        _checkedAt = DateTime.now();
        _error = null;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _error = error.message);
    } catch (_) {
      if (!mounted) return;
      setState(
        () => _error = 'Your cash balance could not be loaded. Check your connection and try again.',
      );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cash = _cash;
    final total = cash?.total ?? 0;
    final count = cash?.count ?? 0;

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          color: AppColors.forest,
          backgroundColor: AppColors.surface,
          onRefresh: _load,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(
              parent: BouncingScrollPhysics(),
            ),
            padding: const EdgeInsets.fromLTRB(20, 14, 20, 28),
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Cash in hand',
                          style: Theme.of(context).textTheme.headlineMedium
                              ?.copyWith(fontSize: 25),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Money you collected that is not settled yet',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: _load,
                    icon: const Icon(Icons.refresh_rounded, size: 21),
                    tooltip: 'Refresh',
                    style: IconButton.styleFrom(
                      backgroundColor: AppColors.surface,
                      side: const BorderSide(color: AppColors.line),
                      minimumSize: const Size(44, 44),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 18),
              if (_error != null) ...[
                ErrorNotice(message: _error!, onRetry: _load),
                const SizedBox(height: 14),
              ],
              if (_loading && cash == null)
                const _CashSkeleton()
              else ...[
                _BalanceCard(total: total, count: count),
                const SizedBox(height: 22),
                const SectionLabel('How this works'),
                const SizedBox(height: 10),
                const _Step(
                  number: '1',
                  title: 'Collect at the door',
                  message: 'Cash payments are added here as soon as the delivery is finished.',
                ),
                const _Step(
                  number: '2',
                  title: 'Hand it to your store',
                  message: 'Give the cash to your store at the end of your shift, the way your store asks.',
                ),
                const _Step(
                  number: '3',
                  title: 'The store settles it',
                  message: 'When the store records the handover, that cash leaves this screen.',
                ),
                const SizedBox(height: 16),
                SurfaceCard(
                  color: AppColors.paperDeep,
                  borderColor: AppColors.paperDeep,
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(
                        Icons.info_outline_rounded,
                        size: 18,
                        color: AppColors.muted,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          'CityCart does not take money from your account. Settlements happen directly with your store.',
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(color: AppColors.inkSoft),
                        ),
                      ),
                    ],
                  ),
                ),
                if (_checkedAt != null) ...[
                  const SizedBox(height: 14),
                  Center(
                    child: Text(
                      'Last checked at ${formatTime(_checkedAt)}',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ),
                ],
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _BalanceCard extends StatelessWidget {
  const _BalanceCard({required this.total, required this.count});

  final double total;
  final int count;

  @override
  Widget build(BuildContext context) {
    final clear = total <= 0;
    return Container(
      padding: const EdgeInsets.fromLTRB(22, 22, 22, 22),
      decoration: BoxDecoration(
        color: clear ? AppColors.sage : AppColors.forest,
        borderRadius: BorderRadius.circular(24),
        boxShadow: clear
            ? null
            : const [
                BoxShadow(
                  color: Color(0x2E1E3A2F),
                  blurRadius: 26,
                  offset: Offset(0, 12),
                ),
              ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                clear
                    ? Icons.check_circle_outline_rounded
                    : Icons.account_balance_wallet_outlined,
                size: 20,
                color: clear
                    ? AppColors.sageInk
                    : AppColors.surface.withValues(alpha: 0.75),
              ),
              const SizedBox(width: 8),
              Text(
                clear ? 'ALL CLEAR' : 'WITH YOU NOW',
                style: TextStyle(
                  fontSize: 10.5,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.2,
                  color: clear
                      ? AppColors.sageInk
                      : AppColors.surface.withValues(alpha: 0.62),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Text(
            formatMoney(total),
            style: TextStyle(
              fontSize: 44,
              height: 1.02,
              fontWeight: FontWeight.w700,
              letterSpacing: -1.2,
              color: clear ? AppColors.sageInk : AppColors.surface,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
          const SizedBox(height: 10),
          Text(
            clear
                ? 'No cash is waiting to be handed over.'
                : '$count ${count == 1 ? 'delivery' : 'deliveries'} · hand this to your store',
            style: TextStyle(
              fontSize: 13.5,
              height: 1.35,
              color: clear
                  ? AppColors.sageInk
                  : AppColors.surface.withValues(alpha: 0.8),
            ),
          ),
        ],
      ),
    );
  }
}

class _Step extends StatelessWidget {
  const _Step({
    required this.number,
    required this.title,
    required this.message,
  });

  final String number;
  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: SurfaceCard(
        padding: const EdgeInsets.fromLTRB(14, 14, 16, 14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 30,
              height: 30,
              alignment: Alignment.center,
              decoration: const BoxDecoration(
                color: AppColors.paper,
                shape: BoxShape.circle,
              ),
              child: Text(
                number,
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: AppColors.forest,
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 14.5,
                      fontWeight: FontWeight.w600,
                      color: AppColors.ink,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(message, style: Theme.of(context).textTheme.bodySmall),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CashSkeleton extends StatelessWidget {
  const _CashSkeleton();

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          height: 168,
          decoration: BoxDecoration(
            color: AppColors.paperDeep,
            borderRadius: BorderRadius.circular(24),
          ),
        ),
        const SizedBox(height: 22),
        Container(
          height: 14,
          width: 110,
          decoration: BoxDecoration(
            color: AppColors.paperDeep,
            borderRadius: BorderRadius.circular(7),
          ),
        ),
        const SizedBox(height: 12),
        for (var i = 0; i < 3; i++) ...[
          Container(
            height: 74,
            decoration: BoxDecoration(
              color: AppColors.paperDeep,
              borderRadius: BorderRadius.circular(18),
            ),
          ),
          const SizedBox(height: 10),
        ],
      ],
    );
  }
}
