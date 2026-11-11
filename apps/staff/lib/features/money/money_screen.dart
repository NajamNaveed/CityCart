import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/status.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../providers.dart';
import '../records/paged_controller.dart';

const _proofFilters = <(String, String)>[
  ('SUBMITTED', 'Waiting'),
  ('VERIFIED', 'Verified'),
  ('REJECTED', 'Rejected'),
];

class MoneyScreen extends ConsumerStatefulWidget {
  const MoneyScreen({super.key});

  @override
  ConsumerState<MoneyScreen> createState() => _MoneyScreenState();
}

class _MoneyScreenState extends ConsumerState<MoneyScreen> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(sessionProvider).user;
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            PageHeader(
              eyebrow: 'Money',
              title: 'Receipts & cash',
              subtitle: 'What was paid, what to check, and who holds cash.',
              trailing: GestureDetector(
                onTap: () => context.push('/account'),
                child: Avatar(name: user?.name ?? 'Team'),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
              child: Align(
                alignment: Alignment.centerLeft,
                child: SegmentedControl<int>(
                  values: const [0, 1, 2],
                  labelOf: (value) => switch (value) {
                    0 => 'Receipts',
                    1 => 'To verify',
                    _ => 'Cash',
                  },
                  value: _tab,
                  onChanged: (value) => setState(() => _tab = value),
                ),
              ),
            ),
            Expanded(
              child: IndexedStack(
                index: _tab,
                children: const [_ReceiptsTab(), _ProofsTab(), _CashTab()],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// --- Receipts --------------------------------------------------------------

class _ReceiptsTab extends ConsumerStatefulWidget {
  const _ReceiptsTab();

  @override
  ConsumerState<_ReceiptsTab> createState() => _ReceiptsTabState();
}

class _ReceiptsTabState extends ConsumerState<_ReceiptsTab> {
  late final PagedController<ReceiptRecord> _controller;

  @override
  void initState() {
    super.initState();
    final repository = ref.read(staffRepositoryProvider);
    _controller = PagedController((page) => repository.receipts(page: page))
      ..addListener(_onChanged);
    _controller.load();
  }

  @override
  void dispose() {
    _controller.removeListener(_onChanged);
    _controller.dispose();
    super.dispose();
  }

  void _onChanged() {
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final items = _controller.items;

    return RefreshIndicator(
      color: AppColors.forest,
      backgroundColor: AppColors.surface,
      onRefresh: _controller.refresh,
      child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(
          parent: BouncingScrollPhysics(),
        ),
        slivers: [
          if (_controller.error != null)
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
                child: ErrorNotice(
                  message: _controller.error!,
                  onRetry: _controller.refresh,
                ),
              ),
            ),
          if (_controller.loading && items.isEmpty)
            const SliverToBoxAdapter(child: LoadingList(count: 3))
          else if (items.isEmpty)
            const SliverFillRemaining(
              hasScrollBody: false,
              child: EmptyState(
                icon: Icons.receipt_long_outlined,
                title: 'No receipts yet',
                message:
                    'A receipt is created the moment a payment is marked paid.',
              ),
            )
          else ...[
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(20, 2, 20, 0),
              sliver: SliverList.separated(
                itemCount: items.length,
                separatorBuilder: (context, index) =>
                    const SizedBox(height: 10),
                itemBuilder: (context, index) {
                  final receipt = items[index];
                  return _ReceiptCard(
                    receipt: receipt,
                    onTap: () async {
                      await context.push('/receipts/${receipt.id}');
                      if (context.mounted) await _controller.refresh();
                    },
                  );
                },
              ),
            ),
            if (_controller.hasMore)
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 18, 20, 0),
                  child: AppButton(
                    label: 'Load more receipts',
                    variant: AppButtonVariant.outline,
                    height: 48,
                    loading: _controller.loadingMore,
                    onPressed: _controller.loadMore,
                  ),
                ),
              ),
            const SliverToBoxAdapter(child: SizedBox(height: 26)),
          ],
        ],
      ),
    );
  }
}

class _ReceiptCard extends StatelessWidget {
  const _ReceiptCard({required this.receipt, required this.onTap});

  final ReceiptRecord receipt;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final payer = receipt.billedTo?.trim();
    return SurfaceCard(
      onTap: onTap,
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      receipt.receiptNumber.isEmpty
                          ? 'Receipt'
                          : receipt.receiptNumber,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleSmall
                          ?.copyWith(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      receipt.orderNumber ?? 'Order',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              MoneyText(
                formatMoney(receipt.amount, currency: receipt.currency),
                size: 16,
              ),
            ],
          ),
          if (payer != null && payer.isNotEmpty) ...[
            const SizedBox(height: 7),
            Text(
              'Billed to $payer',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
          const SizedBox(height: 9),
          Wrap(
            spacing: 7,
            runSpacing: 7,
            children: [
              Pill(
                text: friendlyPaymentMethod(receipt.method),
                background: AppColors.infoSoft,
                foreground: AppColors.info,
                icon: Icons.payments_outlined,
              ),
              if (receipt.issuedAt != null)
                Pill(
                  text: formatDateTime(receipt.issuedAt),
                  background: AppColors.surfaceMuted,
                  foreground: AppColors.inkSoft,
                ),
              if (receipt.proofVerification == 'SUBMITTED')
                const Pill(
                  text: 'Proof waiting',
                  background: AppColors.amber,
                  foreground: AppColors.amberInk,
                ),
            ],
          ),
        ],
      ),
    );
  }
}

// --- Payments to verify ----------------------------------------------------

class _ProofsTab extends ConsumerStatefulWidget {
  const _ProofsTab();

  @override
  ConsumerState<_ProofsTab> createState() => _ProofsTabState();
}

class _ProofsTabState extends ConsumerState<_ProofsTab> {
  PagedController<ProofRecord>? _controller;
  String _status = 'SUBMITTED';

  @override
  void initState() {
    super.initState();
    _bind();
  }

  @override
  void dispose() {
    _controller?.removeListener(_onChanged);
    _controller?.dispose();
    super.dispose();
  }

  void _bind() {
    _controller?.removeListener(_onChanged);
    _controller?.dispose();
    final repository = ref.read(staffRepositoryProvider);
    _controller = PagedController(
      (page) => repository.proofs(status: _status, page: page),
    )..addListener(_onChanged);
    _controller!.load();
  }

  void _onChanged() {
    if (mounted) setState(() {});
  }

  void _filter(String status) {
    if (_status == status) return;
    setState(() => _status = status);
    _bind();
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    final items = controller?.items ?? const <ProofRecord>[];
    final access = ref.watch(accessProvider);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: FilterChips<String>(
            values: _proofFilters
                .map((filter) => filter.$1)
                .toList(growable: false),
            labelOf: (status) =>
                _proofFilters.firstWhere((filter) => filter.$1 == status).$2,
            value: _status,
            onChanged: _filter,
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            color: AppColors.forest,
            backgroundColor: AppColors.surface,
            onRefresh: () async {
              await controller?.refresh();
            },
            child: CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(
                parent: BouncingScrollPhysics(),
              ),
              slivers: [
                if (controller?.error != null)
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
                      child: ErrorNotice(
                        message: controller!.error!,
                        onRetry: controller.refresh,
                      ),
                    ),
                  ),
                if (controller == null || (controller.loading && items.isEmpty))
                  const SliverToBoxAdapter(child: LoadingList(count: 3))
                else if (items.isEmpty)
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: EmptyState(
                      icon: Icons.verified_outlined,
                      title: _status == 'SUBMITTED'
                          ? 'Nothing to check'
                          : 'No payments here',
                      message: _status == 'SUBMITTED'
                          ? 'Non-cash payments taken at the door wait here '
                                'until someone checks the proof.'
                          : 'No payment proof has this result.',
                    ),
                  )
                else ...[
                  SliverPadding(
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    sliver: SliverList.separated(
                      itemCount: items.length,
                      separatorBuilder: (context, index) =>
                          const SizedBox(height: 10),
                      itemBuilder: (context, index) {
                        final proof = items[index];
                        return _ProofCard(
                          proof: proof,
                          onTap: () async {
                            await context.push('/verify/${proof.paymentId}');
                            if (context.mounted) await controller.refresh();
                          },
                        );
                      },
                    ),
                  ),
                  if (controller.hasMore)
                    SliverToBoxAdapter(
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(20, 18, 20, 0),
                        child: AppButton(
                          label: 'Load more payments',
                          variant: AppButtonVariant.outline,
                          height: 48,
                          loading: controller.loadingMore,
                          onPressed: controller.loadMore,
                        ),
                      ),
                    ),
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(20, 14, 20, 26),
                      child: Text(
                        access.paymentsManage
                            ? 'Open a payment to see the photo and decide.'
                            : 'Checking a payment needs payment management '
                                  'access. You can still see the queue.',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _ProofCard extends StatelessWidget {
  const _ProofCard({required this.proof, required this.onTap});

  final ProofRecord proof;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final what = proof.wallet == null
        ? friendlyCollectionMethod(proof.method ?? '')
        : friendlyWallet(proof.wallet);
    return SurfaceCard(
      onTap: onTap,
      padding: const EdgeInsets.fromLTRB(16, 14, 13, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  proof.orderNumber ?? 'Payment',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleMedium
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
              const SizedBox(width: 8),
              Flexible(
                child: StatusPill(
                  text: friendlyVerification(proof.verification),
                  tone: toneForVerification(proof.verification),
                  compact: true,
                ),
              ),
            ],
          ),
          const SizedBox(height: 5),
          MoneyText(
            formatMoney(proof.amount, currency: proof.currency),
            size: 20,
            align: TextAlign.left,
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 7,
            runSpacing: 7,
            children: [
              if (what.isNotEmpty)
                Pill(
                  text: what,
                  background: AppColors.surfaceMuted,
                  foreground: AppColors.inkSoft,
                  icon: Icons.account_balance_wallet_outlined,
                ),
              if (proof.reference != null)
                Pill(
                  text: proof.reference!,
                  background: AppColors.surfaceMuted,
                  foreground: AppColors.inkSoft,
                  icon: Icons.tag_rounded,
                ),
              if (proof.submittedAt != null)
                Pill(
                  text: 'Sent ${formatAge(proof.submittedAt)}',
                  background: AppColors.paperDeep,
                  foreground: AppColors.muted,
                ),
            ],
          ),
          if (proof.duplicateReference || proof.duplicateProof) ...[
            const SizedBox(height: 9),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(
                  Icons.warning_amber_rounded,
                  size: 17,
                  color: AppColors.danger,
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    proof.duplicateReference && proof.duplicateProof
                        ? 'Same reference and photo as another payment.'
                        : proof.duplicateReference
                        ? 'This reference is used on another payment.'
                        : 'This photo is used on another payment.',
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 12.5,
                      height: 1.35,
                      fontWeight: FontWeight.w600,
                      color: AppColors.danger,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

// --- Cash in hand ----------------------------------------------------------

class _CashTab extends ConsumerStatefulWidget {
  const _CashTab();

  @override
  ConsumerState<_CashTab> createState() => _CashTabState();
}

class _CashTabState extends ConsumerState<_CashTab> {
  List<CashCollector> _collectors = const [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final collectors = await ref
          .read(staffRepositoryProvider)
          .outstandingCash();
      if (!mounted) return;
      setState(() {
        _collectors = collectors;
        _loading = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final access = ref.watch(accessProvider);
    final total = _collectors.fold<double>(
      0,
      (sum, collector) => sum + collector.total,
    );
    final payments = _collectors.fold<int>(
      0,
      (sum, collector) => sum + collector.count,
    );

    return RefreshIndicator(
      color: AppColors.forest,
      backgroundColor: AppColors.surface,
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(
          parent: BouncingScrollPhysics(),
        ),
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 26),
        children: [
          if (_error != null) ...[
            ErrorNotice(message: _error!, onRetry: _load),
            const SizedBox(height: 12),
          ],
          if (_loading && _collectors.isEmpty) ...[
            const SkeletonBox(height: 116, radius: 20),
            const SizedBox(height: 12),
            const LoadingList(count: 2),
          ] else if (_collectors.isEmpty)
            const SizedBox(
              height: 320,
              child: EmptyState(
                icon: Icons.account_balance_wallet_outlined,
                title: 'No cash in hand',
                message:
                    'Cash collected at the door appears here until it is '
                    'handed over and settled.',
              ),
            )
          else ...[
            Container(
              padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
              decoration: BoxDecoration(
                color: AppColors.forest,
                borderRadius: BorderRadius.circular(AppRadius.card),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'CASH IN HAND',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 1.1,
                      color: AppColors.sage.withValues(alpha: 0.9),
                    ),
                  ),
                  const SizedBox(height: 6),
                  FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: Alignment.centerLeft,
                    child: Text(
                      formatMoney(total),
                      maxLines: 1,
                      style: const TextStyle(
                        fontSize: 32,
                        height: 1.05,
                        fontWeight: FontWeight.w700,
                        letterSpacing: -0.8,
                        color: AppColors.white,
                      ),
                    ),
                  ),
                  const SizedBox(height: 5),
                  Text(
                    '$payments ${payments == 1 ? 'payment' : 'payments'} with '
                    '${_collectors.length} ${_collectors.length == 1 ? 'person' : 'people'}',
                    maxLines: 2,
                    style: TextStyle(
                      fontSize: 12.5,
                      height: 1.35,
                      color: AppColors.sage.withValues(alpha: 0.9),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            for (final collector in _collectors) ...[
              _CollectorCard(
                collector: collector,
                onTap: () async {
                  await context.push(
                    '/cash/${collector.collectorId}',
                    extra: collector,
                  );
                  if (context.mounted) await _load();
                },
              ),
              const SizedBox(height: 10),
            ],
            Text(
              access.paymentsManage
                  ? 'Open a person to tick off the cash they handed over.'
                  : 'Settling cash needs payment management access. '
                        'You can still see who holds what.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ],
      ),
    );
  }
}

class _CollectorCard extends StatelessWidget {
  const _CollectorCard({required this.collector, required this.onTap});

  final CashCollector collector;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SurfaceCard(
      onTap: onTap,
      padding: const EdgeInsets.fromLTRB(15, 13, 13, 13),
      child: Row(
        children: [
          Avatar(name: collector.name, size: 42),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  collector.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleSmall
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 2),
                Text(
                  '${collector.count} ${collector.count == 1 ? 'payment' : 'payments'}'
                  '${collector.oldest == null ? '' : ' · oldest ${formatShortDate(collector.oldest)}'}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              SizedBox(
                width: 108,
                child: MoneyText(formatMoney(collector.total), size: 16),
              ),
              const SizedBox(height: 2),
              const Icon(
                Icons.chevron_right_rounded,
                size: 18,
                color: AppColors.muted,
              ),
            ],
          ),
        ],
      ),
    );
  }
}
