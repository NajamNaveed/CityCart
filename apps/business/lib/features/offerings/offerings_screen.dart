import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../providers.dart';

String _errorSentence(Object? error) {
  if (error is ApiException) return error.message;
  return 'We could not load your services. Check the connection and try again.';
}

class OfferingsScreen extends ConsumerStatefulWidget {
  const OfferingsScreen({super.key});

  @override
  ConsumerState<OfferingsScreen> createState() => _OfferingsScreenState();
}

class _OfferingsScreenState extends ConsumerState<OfferingsScreen> {
  String? _busyId;

  Future<void> _openEditor([ServiceOffering? offering]) async {
    final draft = await showFormSheet<_OfferingDraft>(
      context,
      title: offering == null ? 'Add a service' : 'Edit service',
      subtitle: offering == null
          ? 'Customers pick a service when they book you.'
          : 'Changes apply to new bookings. Past bookings keep their record.',
      child: _OfferingSheet(offering: offering),
    );
    if (draft == null || !mounted) return;

    final repository = ref.read(businessRepositoryProvider);
    setState(() => _busyId = offering?.id ?? 'new');
    try {
      if (offering == null) {
        await repository.createProviderOffering(
          title: draft.title,
          description: draft.description,
          startingAtPricePaisa: draft.pricePaisa,
          durationMinutes: draft.durationMinutes,
        );
      } else {
        await repository.updateProviderOffering(
          offering.id,
          title: draft.title,
          description: draft.description,
          startingAtPricePaisa: draft.pricePaisa,
          durationMinutes: draft.durationMinutes,
        );
      }
      ref.invalidate(providerOfferingsProvider);
      if (mounted) {
        showAppSnack(
          context,
          offering == null ? 'Service added.' : 'Service updated.',
        );
      }
    } catch (error) {
      if (mounted) showAppSnack(context, _errorSentence(error), error: true);
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  Future<void> _toggle(ServiceOffering offering) async {
    if (_busyId != null) return;
    if (offering.isActive) {
      final ok = await confirmAction(
        context,
        title: 'Pause this service?',
        message:
            'Customers will no longer see “${offering.title}” when they look '
            'for you. You can put it back any time.',
        confirmLabel: 'Pause service',
        destructive: true,
      );
      if (!ok || !mounted) return;
    }

    final repository = ref.read(businessRepositoryProvider);
    setState(() => _busyId = offering.id);
    try {
      if (offering.isActive) {
        await repository.deactivateProviderOffering(offering.id);
      } else {
        await repository.updateProviderOffering(offering.id, isActive: true);
      }
      ref.invalidate(providerOfferingsProvider);
      if (mounted) {
        showAppSnack(
          context,
          offering.isActive ? 'Service paused.' : 'Service is live again.',
        );
      }
    } catch (error) {
      if (mounted) showAppSnack(context, _errorSentence(error), error: true);
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final asyncOfferings = ref.watch(providerOfferingsProvider);
    final offerings = asyncOfferings.asData?.value;

    return Scaffold(
      appBar: AppBar(title: const Text('Your services')),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(providerOfferingsProvider),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.only(bottom: 30),
          children: [
            const PageHeader(
              eyebrow: 'Services',
              title: 'What you offer',
              subtitle:
                  'Customers pick one of these when they book you. Keep the '
                  'prices and visit lengths up to date.',
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.page,
                20,
                AppSpacing.page,
                0,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (asyncOfferings.isLoading && offerings == null)
                    const LoadingView(label: 'Loading your services')
                  else if (asyncOfferings.hasError && offerings == null)
                    ErrorPanel(
                      message: _errorSentence(asyncOfferings.error),
                      onRetry: () => ref.invalidate(providerOfferingsProvider),
                    )
                  else ...[
                    AppButton(
                      key: const Key('offering_add'),
                      label: 'Add a service',
                      icon: Icons.add_rounded,
                      onPressed: _busyId == null ? () => _openEditor() : null,
                    ),
                    const SizedBox(height: 18),
                    if (offerings == null || offerings.isEmpty)
                      EmptyPanel(
                        icon: Icons.home_repair_service_outlined,
                        title: 'No services yet',
                        message:
                            'Add the jobs you take, with a starting price and '
                            'how long they usually take.',
                        action: AppButton(
                          label: 'Add your first service',
                          icon: Icons.add_rounded,
                          expand: false,
                          onPressed: () => _openEditor(),
                        ),
                      )
                    else ...[
                      for (final offering in offerings) ...[
                        _OfferingCard(
                          offering: offering,
                          busy: _busyId == offering.id,
                          onEdit: _busyId == null
                              ? () => _openEditor(offering)
                              : null,
                          onToggle: _busyId == null
                              ? () => _toggle(offering)
                              : null,
                        ),
                        const SizedBox(height: 12),
                      ],
                    ],
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _OfferingCard extends StatelessWidget {
  const _OfferingCard({
    required this.offering,
    required this.busy,
    required this.onEdit,
    required this.onToggle,
  });

  final ServiceOffering offering;
  final bool busy;
  final VoidCallback? onEdit;
  final VoidCallback? onToggle;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return SurfacePanel(
      key: Key('offering_card_${offering.id}'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  offering.title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: text.titleMedium,
                ),
              ),
              const SizedBox(width: 8),
              StatusTag(
                label: offering.isActive ? 'Live' : 'Paused',
                tone: offering.isActive ? AppTone.green : AppTone.neutral,
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'From ${money(offering.startingAtPricePaisa)} · '
            '${durationLabel(offering.durationMinutes)}',
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: text.bodyMedium,
          ),
          if (offering.description.trim().isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              offering.description,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
              style: text.bodySmall,
            ),
          ],
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: AppButton(
                  key: Key('offering_edit_${offering.id}'),
                  label: 'Edit',
                  icon: Icons.edit_outlined,
                  variant: AppButtonVariant.quiet,
                  compact: true,
                  onPressed: busy ? null : onEdit,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: AppButton(
                  key: Key('offering_toggle_${offering.id}'),
                  label: offering.isActive ? 'Pause' : 'Put back',
                  icon: offering.isActive
                      ? Icons.pause_circle_outline_rounded
                      : Icons.play_circle_outline_rounded,
                  variant: AppButtonVariant.outline,
                  compact: true,
                  loading: busy,
                  onPressed: onToggle,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _OfferingDraft {
  const _OfferingDraft({
    required this.title,
    required this.description,
    required this.pricePaisa,
    required this.durationMinutes,
  });

  final String title;
  final String description;
  final int pricePaisa;
  final int durationMinutes;
}

class _OfferingSheet extends StatefulWidget {
  const _OfferingSheet({this.offering});

  final ServiceOffering? offering;

  @override
  State<_OfferingSheet> createState() => _OfferingSheetState();
}

class _OfferingSheetState extends State<_OfferingSheet> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _title;
  late final TextEditingController _price;
  late final TextEditingController _duration;
  late final TextEditingController _description;

  @override
  void initState() {
    super.initState();
    final offering = widget.offering;
    _title = TextEditingController(text: offering?.title ?? '');
    _price = TextEditingController(
      text: offering == null ? '' : rupeesField(offering.startingAtPricePaisa),
    );
    _duration = TextEditingController(
      text: offering == null ? '60' : '${offering.durationMinutes}',
    );
    _description = TextEditingController(text: offering?.description ?? '');
  }

  @override
  void dispose() {
    _title.dispose();
    _price.dispose();
    _duration.dispose();
    _description.dispose();
    super.dispose();
  }

  void _submit() {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    FocusScope.of(context).unfocus();
    Navigator.of(context).pop(
      _OfferingDraft(
        title: _title.text.trim(),
        description: _description.text.trim(),
        pricePaisa: paisaFromRupees(_price.text)!,
        durationMinutes: int.parse(_duration.text.trim()),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AppField(
            key: const Key('offering_title'),
            label: 'Service name',
            controller: _title,
            hint: 'For example, AC repair visit',
            textInputAction: TextInputAction.next,
            validator: (value) {
              final text = (value ?? '').trim();
              if (text.length < 2) return 'Give the service a name.';
              if (text.length > 120) return 'Keep the name under 120 letters.';
              return null;
            },
          ),
          const SizedBox(height: 13),
          AppField(
            key: const Key('offering_price'),
            label: 'Starting price',
            controller: _price,
            prefixText: 'Rs ',
            hint: '1500',
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            textInputAction: TextInputAction.next,
            validator: (value) {
              final paisa = paisaFromRupees(value ?? '');
              if (paisa == null) return 'Enter a price in rupees.';
              if (paisa <= 0) return 'Enter a price greater than zero.';
              return null;
            },
          ),
          const SizedBox(height: 13),
          AppField(
            key: const Key('offering_duration'),
            label: 'Visit length (minutes)',
            controller: _duration,
            hint: '60',
            keyboardType: TextInputType.number,
            textInputAction: TextInputAction.next,
            validator: (value) {
              final minutes = int.tryParse((value ?? '').trim());
              if (minutes == null) return 'Enter the length in minutes.';
              if (minutes < 15) return 'Use at least 15 minutes.';
              if (minutes > 1440) return 'Use 1440 minutes or fewer.';
              return null;
            },
          ),
          const SizedBox(height: 13),
          AppField(
            key: const Key('offering_description'),
            label: 'What is included (optional)',
            controller: _description,
            hint: 'Parts are extra. A 30-day check is included.',
            maxLines: 4,
            textInputAction: TextInputAction.done,
            onSubmitted: (_) => _submit(),
          ),
          const SizedBox(height: 20),
          AppButton(
            key: const Key('offering_save'),
            label: widget.offering == null ? 'Add service' : 'Save changes',
            icon: Icons.check_rounded,
            onPressed: _submit,
          ),
        ],
      ),
    );
  }
}
