import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/format.dart';
import '../../core/status.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../providers.dart';

class ProofScreen extends ConsumerStatefulWidget {
  const ProofScreen({super.key, required this.paymentId});

  final String paymentId;

  @override
  ConsumerState<ProofScreen> createState() => _ProofScreenState();
}

class _ProofScreenState extends ConsumerState<ProofScreen> {
  ProofRecord? _proof;
  bool _loading = true;
  bool _working = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load({bool quiet = false}) async {
    if (!quiet) setState(() => _loading = true);
    setState(() => _error = null);
    try {
      final proof = await ref
          .read(staffRepositoryProvider)
          .proofLink(widget.paymentId);
      if (!mounted) return;
      setState(() {
        _proof = proof;
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

  Future<void> _openInBrowser(String url) async {
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    try {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {
      if (mounted) {
        showAppSnack(
          context,
          "Couldn't open a browser on this phone.",
          error: true,
        );
      }
    }
  }

  Future<void> _verify() async {
    final proof = _proof;
    if (proof == null || _working) return;
    final confirmed = await confirmAction(
      context,
      title: 'Verify this payment?',
      message:
          'Only verify once the ${formatMoney(proof.amount, currency: proof.currency)} '
          'is in the brand account. Verifying marks the payment as paid and '
          'completes the delivery.',
      confirmLabel: 'Verify payment',
    );
    if (!confirmed || !mounted) return;
    await _decide('VERIFIED');
  }

  Future<void> _reject() async {
    final proof = _proof;
    if (proof == null || _working) return;
    final note = await showAppSheet<String>(
      context,
      title: 'Reject this proof',
      subtitle:
          'Tell the rider why it was not accepted. They will collect again.',
      child: const _RejectNoteSheet(),
    );
    if (note == null || !mounted) return;
    await _decide('REJECTED', note: note);
  }

  Future<void> _decide(String verification, {String? note}) async {
    if (_working) return;
    setState(() {
      _working = true;
      _error = null;
    });
    try {
      final updated = await ref
          .read(staffRepositoryProvider)
          .decideProof(
            paymentId: widget.paymentId,
            verification: verification,
            note: note,
          );
      if (!mounted) return;
      setState(() => _proof = updated);
      showAppSnack(
        context,
        verification == 'VERIFIED'
            ? 'Payment verified.'
            : 'Proof rejected. The rider will collect again.',
      );
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _error = error.message);
      showAppSnack(context, error.message, error: true);
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final proof = _proof;
    final access = ref.watch(accessProvider);
    final pending = proof?.isPending == true;
    final canDecide = pending && access.paymentsManage;

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            ScreenTopBar(
              title: 'Payment proof',
              subtitle: proof?.orderNumber,
              trailing: IconButton(
                onPressed: _loading ? null : () => _load(quiet: true),
                tooltip: 'Reload proof',
                icon: const Icon(Icons.refresh_rounded, size: 21),
              ),
            ),
            Expanded(
              child: _loading && proof == null
                  ? const LoadingList(count: 4)
                  : proof == null
                  ? Center(
                      child: SingleChildScrollView(
                        padding: const EdgeInsets.all(24),
                        child: EmptyState(
                          icon: Icons.error_outline_rounded,
                          title: "Couldn't load this payment",
                          message: _error ?? 'Try again in a moment.',
                          action: AppButton(
                            label: 'Try again',
                            variant: AppButtonVariant.outline,
                            expand: false,
                            height: 48,
                            onPressed: _load,
                          ),
                        ),
                      ),
                    )
                  : RefreshIndicator(
                      color: AppColors.forest,
                      backgroundColor: AppColors.surface,
                      onRefresh: () => _load(quiet: true),
                      child: ListView(
                        physics: const AlwaysScrollableScrollPhysics(
                          parent: BouncingScrollPhysics(),
                        ),
                        padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
                        children: [
                          Wrap(
                            spacing: 7,
                            runSpacing: 7,
                            children: [
                              StatusPill(
                                text: friendlyVerification(proof.verification),
                                tone: toneForVerification(proof.verification),
                                compact: true,
                              ),
                              if (proof.submittedAt != null)
                                Pill(
                                  text: 'Sent ${formatAge(proof.submittedAt)}',
                                  background: AppColors.surfaceMuted,
                                  foreground: AppColors.inkSoft,
                                ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          Text(
                            proof.orderNumber ?? 'Door payment',
                            style: Theme.of(context).textTheme.headlineSmall
                                ?.copyWith(fontSize: 23),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            formatMoney(proof.amount, currency: proof.currency),
                            style: Theme.of(context).textTheme.headlineMedium
                                ?.copyWith(color: AppColors.clay),
                          ),
                          if (_error != null) ...[
                            const SizedBox(height: 12),
                            ErrorNotice(
                              message: _error!,
                              onRetry: () => _load(quiet: true),
                            ),
                          ],
                          if (proof.duplicateReference ||
                              proof.duplicateProof) ...[
                            const SizedBox(height: 12),
                            NoticeCard(
                              icon: Icons.warning_amber_rounded,
                              title: 'This proof looks familiar',
                              message:
                                  proof.duplicateReference &&
                                      proof.duplicateProof
                                  ? 'The same reference and photo are used on '
                                        'another payment. Check both before deciding.'
                                  : proof.duplicateReference
                                  ? 'The same reference is used on another '
                                        'payment. Check both before deciding.'
                                  : 'The same photo is used on another payment. '
                                        'Check both before deciding.',
                              tone: StatusTone.danger,
                            ),
                          ],
                          const SizedBox(height: 14),
                          _PhotoCard(
                            url: proof.url,
                            onOpenBrowser: proof.url == null
                                ? null
                                : () => _openInBrowser(proof.url!),
                          ),
                          const SizedBox(height: 12),
                          SurfaceCard(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const SectionLabel('What was sent'),
                                const SizedBox(height: 8),
                                InfoRow(
                                  label: 'Handed over',
                                  value:
                                      [
                                            friendlyCollectionMethod(
                                              proof.method ?? '',
                                            ),
                                            if (proof.wallet != null)
                                              friendlyWallet(proof.wallet),
                                          ]
                                          .where((part) => part.isNotEmpty)
                                          .join(' · '),
                                ),
                                InfoRow(
                                  label: 'Reference',
                                  value: proof.reference ?? 'Not given',
                                ),
                                if (proof.submittedAt != null)
                                  InfoRow(
                                    label: 'Sent',
                                    value: formatDateTime(proof.submittedAt),
                                  ),
                                if (proof.verifiedAt != null)
                                  InfoRow(
                                    label: 'Checked',
                                    value: formatDateTime(proof.verifiedAt),
                                  ),
                                if (proof.note != null)
                                  InfoRow(label: 'Note', value: proof.note!),
                                if (proof.deliveryPending)
                                  const Padding(
                                    padding: EdgeInsets.only(top: 8),
                                    child: Text(
                                      'The delivery is still open until this '
                                      'payment is checked.',
                                      style: TextStyle(
                                        fontSize: 12.5,
                                        height: 1.4,
                                        color: AppColors.amberInk,
                                      ),
                                    ),
                                  ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 14),
                          if (!pending)
                            NoticeCard(
                              icon: proof.verification == 'VERIFIED'
                                  ? Icons.check_circle_outline_rounded
                                  : Icons.cancel_outlined,
                              title: proof.verification == 'VERIFIED'
                                  ? 'Payment verified'
                                  : 'Proof rejected',
                              message: proof.verification == 'VERIFIED'
                                  ? 'This payment is recorded as paid.'
                                  : 'The rider was asked to collect again.'
                                        '${proof.note == null ? '' : ' Note: ${proof.note}'}',
                              tone: proof.verification == 'VERIFIED'
                                  ? StatusTone.sage
                                  : StatusTone.danger,
                            )
                          else if (!access.paymentsManage)
                            const NoticeCard(
                              icon: Icons.lock_outline_rounded,
                              title: 'Waiting for a manager',
                              message:
                                  'Verifying or rejecting a payment moves money '
                                  'records, so it needs payment management '
                                  'access.',
                              tone: StatusTone.muted,
                            ),
                        ],
                      ),
                    ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: canDecide
          ? BottomActionBar(
              child: Row(
                children: [
                  Expanded(
                    child: AppButton(
                      label: 'Reject',
                      icon: Icons.close_rounded,
                      variant: AppButtonVariant.outline,
                      height: 50,
                      onPressed: _working ? null : _reject,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: AppButton(
                      label: 'Verify',
                      icon: Icons.check_rounded,
                      height: 50,
                      loading: _working,
                      onPressed: _working ? null : _verify,
                    ),
                  ),
                ],
              ),
            )
          : null,
    );
  }
}

class _PhotoCard extends StatelessWidget {
  const _PhotoCard({required this.url, required this.onOpenBrowser});

  final String? url;
  final VoidCallback? onOpenBrowser;

  @override
  Widget build(BuildContext context) {
    return SurfaceCard(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(14),
            child: Container(
              height: 320,
              color: AppColors.paperDeep,
              child: url == null
                  ? const Center(
                      child: Text(
                        'No photo was attached.',
                        style: TextStyle(color: AppColors.muted),
                      ),
                    )
                  : Image.network(
                      url!,
                      fit: BoxFit.contain,
                      loadingBuilder: (context, child, progress) =>
                          progress == null
                          ? child
                          : const Center(
                              child: CircularProgressIndicator(
                                strokeWidth: 2.2,
                                color: AppColors.forest,
                              ),
                            ),
                      errorBuilder: (context, error, stack) => const Center(
                        child: Padding(
                          padding: EdgeInsets.all(18),
                          child: Text(
                            'The photo could not be loaded. The link may have '
                            'expired — reload to get a fresh one.',
                            textAlign: TextAlign.center,
                            style: TextStyle(color: AppColors.muted),
                          ),
                        ),
                      ),
                    ),
            ),
          ),
          if (onOpenBrowser != null) ...[
            const SizedBox(height: 6),
            TextButton.icon(
              onPressed: onOpenBrowser,
              icon: const Icon(Icons.open_in_new_rounded, size: 17),
              label: const Text('Open in browser'),
            ),
          ],
        ],
      ),
    );
  }
}

class _RejectNoteSheet extends StatefulWidget {
  const _RejectNoteSheet();

  @override
  State<_RejectNoteSheet> createState() => _RejectNoteSheetState();
}

class _RejectNoteSheetState extends State<_RejectNoteSheet> {
  final _note = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  void _submit() {
    final value = _note.text.trim();
    if (value.isEmpty) {
      setState(() => _error = 'Say why the proof was not accepted.');
      return;
    }
    Navigator.of(context).pop(value);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _note,
          maxLines: 3,
          maxLength: 300,
          autofocus: true,
          textCapitalization: TextCapitalization.sentences,
          decoration: InputDecoration(
            labelText: 'Reason for the rider',
            hintText: 'For example: this reference is not in our statement.',
            errorText: _error,
          ),
          onChanged: (_) {
            if (_error != null) setState(() => _error = null);
          },
        ),
        const SizedBox(height: 8),
        AppButton(
          label: 'Reject proof',
          icon: Icons.close_rounded,
          variant: AppButtonVariant.danger,
          onPressed: _submit,
        ),
      ],
    );
  }
}
