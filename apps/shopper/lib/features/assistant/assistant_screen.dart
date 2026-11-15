import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/status.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/models.dart';
import '../../providers.dart';
import 'assistant_controller.dart';

const _shopSuggestions = ['Cheap rice', 'Gift under 3000', 'Milk nearby'];
const _orderSuggestions = [
  'Where is my order?',
  'How do I cancel an order?',
  'Can I return an item?',
];
const _serviceSuggestions = [
  'AC repair tomorrow evening',
  'Plumber near me',
  'Salon for a haircut',
];

String _modeTitle(AssistantMode mode) => switch (mode) {
  AssistantMode.orders => 'Order help',
  AssistantMode.services => 'Booking help',
  AssistantMode.shop => 'Shopping assistant',
};

/// Phase 2a–2c: the shopping, order and service assistants. The server answers
/// with real rows it read itself; this screen only shows what came back.
class AssistantScreen extends ConsumerStatefulWidget {
  const AssistantScreen({super.key});

  @override
  ConsumerState<AssistantScreen> createState() => _AssistantScreenState();
}

class _AssistantScreenState extends ConsumerState<AssistantScreen> {
  final _input = TextEditingController();
  final _scroll = ScrollController();

  @override
  void initState() {
    super.initState();
    _input.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _send(AssistantController controller, [String? preset]) async {
    final text = (preset ?? _input.text).trim();
    if (text.isEmpty || controller.sending) return;
    FocusScope.of(context).unfocus();
    _input.clear();
    await controller.send(text);
    if (!mounted) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) _scroll.jumpTo(0);
    });
  }

  @override
  Widget build(BuildContext context) {
    final controller = ref.watch(assistantProvider);
    final areaLabel = ref.read(areaProvider).area?.label ?? 'your area';
    final mode = controller.mode;

    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) {
        return Scaffold(
          body: SafeArea(
            child: Column(
              children: [
                ScreenTopBar(
                  title: 'Ask CityCart',
                  subtitle: _modeTitle(mode),
                ),
                const Divider(height: 1),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                  child: Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      _ModeChip(
                        label: 'Find products',
                        active: mode == AssistantMode.shop,
                        onTap: () =>
                            controller.setMode(AssistantMode.shop),
                      ),
                      _ModeChip(
                        label: 'My orders',
                        active: mode == AssistantMode.orders,
                        onTap: () =>
                            controller.setMode(AssistantMode.orders),
                      ),
                      _ModeChip(
                        label: 'Services',
                        active: mode == AssistantMode.services,
                        onTap: () =>
                            controller.setMode(AssistantMode.services),
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: controller.turns.isEmpty
                      ? _Starter(
                          mode: mode,
                          areaLabel: areaLabel,
                          onSuggestion: (text) => _send(controller, text),
                        )
                      : ListView.builder(
                          controller: _scroll,
                          reverse: true,
                          padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
                          itemCount:
                              controller.turns.length +
                              (controller.sending ? 1 : 0),
                          itemBuilder: (context, index) {
                            if (controller.sending && index == 0) {
                              return _Thinking(
                                label: switch (mode) {
                                  AssistantMode.orders =>
                                    'Checking your orders…',
                                  AssistantMode.services =>
                                    'Checking providers…',
                                  AssistantMode.shop =>
                                    'Looking through the shops…',
                                },
                              );
                            }
                            final offset = controller.sending ? 1 : 0;
                            final turn = controller.turns[controller
                                    .turns
                                    .length -
                                1 -
                                (index - offset)];
                            return _Turn(turn: turn);
                          },
                        ),
                ),
                if (controller.error != null)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
                    child: ErrorNotice(
                      message: controller.error!,
                      onRetry: controller.hasFailed
                          ? controller.retry
                          : null,
                    ),
                  ),
                BottomActionBar(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _input,
                          minLines: 1,
                          maxLines: 4,
                          maxLength: 500,
                          textCapitalization: TextCapitalization.sentences,
                          textInputAction: TextInputAction.send,
                          onSubmitted: (_) => _send(controller),
                          decoration: InputDecoration(
                            hintText: switch (mode) {
                              AssistantMode.orders =>
                                'Ask about one of your orders',
                              AssistantMode.services =>
                                'Ask about a service or a free time',
                              AssistantMode.shop =>
                                'Ask about a product or a shop',
                            },
                            counterText: '',
                            contentPadding: EdgeInsets.symmetric(
                              horizontal: 16,
                              vertical: 13,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      SizedBox(
                        width: 50,
                        height: 50,
                        child: FilledButton(
                          onPressed:
                              _input.text.trim().isEmpty || controller.sending
                              ? null
                              : () => _send(controller),
                          style: FilledButton.styleFrom(
                            backgroundColor: AppColors.forest,
                            padding: EdgeInsets.zero,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(
                                AppRadius.button,
                              ),
                            ),
                          ),
                          child: controller.sending
                              ? const SizedBox(
                                  width: 20,
                                  height: 20,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2.2,
                                    color: AppColors.white,
                                  ),
                                )
                              : const Icon(
                                  Icons.arrow_upward_rounded,
                                  size: 22,
                                ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _Starter extends StatelessWidget {
  const _Starter({
    required this.mode,
    required this.areaLabel,
    required this.onSuggestion,
  });

  final AssistantMode mode;
  final String areaLabel;
  final ValueChanged<String> onSuggestion;

  @override
  Widget build(BuildContext context) {
    final (title, body, suggestions, footer) = switch (mode) {
      AssistantMode.orders => (
        'Ask about your orders',
        'Ask where an order is, what its status means, or how cancellation '
            'and returns work. I can only read your own orders.',
        _orderSuggestions,
        'Answers come from your own orders.',
      ),
      AssistantMode.services => (
        'Need a service?',
        'Ask for a plumber, repair, salon or any other service. I can find '
            'providers and show the free times they have published. You book '
            'on the provider page.',
        _serviceSuggestions,
        'Answers come from real providers in $areaLabel.',
      ),
      AssistantMode.shop => (
        'What are you looking for?',
        'Ask in your own words. I can find products, compare prices and point '
            'you to shops near you.',
        _shopSuggestions,
        'Answers come from real listings in $areaLabel.',
      ),
    };

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 40, 20, 24),
      children: [
        Center(
          child: Container(
            width: 64,
            height: 64,
            decoration: const BoxDecoration(
              color: AppColors.sage,
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.auto_awesome_rounded,
              size: 28,
              color: AppColors.sageInk,
            ),
          ),
        ),
        const SizedBox(height: 16),
        Text(
          title,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.headlineSmall,
        ),
        const SizedBox(height: 8),
        Text(
          body,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodyMedium,
        ),
        const SizedBox(height: 22),
        Wrap(
          alignment: WrapAlignment.center,
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final suggestion in suggestions)
              _Suggestion(
                text: suggestion,
                onTap: () => onSuggestion(suggestion),
              ),
          ],
        ),
        const SizedBox(height: 26),
        Text(
          footer,
          textAlign: TextAlign.center,
          style: Theme.of(
            context,
          ).textTheme.bodySmall?.copyWith(color: AppColors.muted),
        ),
      ],
    );
  }
}

class _ModeChip extends StatelessWidget {
  const _ModeChip({
    required this.label,
    required this.active,
    required this.onTap,
  });

  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: active ? AppColors.forest : AppColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.pill),
        side: BorderSide(
          color: active ? AppColors.forest : AppColors.line,
        ),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(AppRadius.pill),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w600,
              color: active ? AppColors.white : AppColors.inkSoft,
            ),
          ),
        ),
      ),
    );
  }
}

class _Suggestion extends StatelessWidget {
  const _Suggestion({required this.text, required this.onTap});

  final String text;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.pill),
        side: const BorderSide(color: AppColors.line),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(AppRadius.pill),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 10),
          child: Text(
            text,
            style: const TextStyle(
              fontSize: 13.5,
              fontWeight: FontWeight.w600,
              color: AppColors.inkSoft,
            ),
          ),
        ),
      ),
    );
  }
}

class _Turn extends StatelessWidget {
  const _Turn({required this.turn});

  final AssistantTurn turn;

  @override
  Widget build(BuildContext context) {
    final maxWidth = MediaQuery.sizeOf(context).width * 0.86;
    if (turn.isQuestion) {
      return Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: Align(
          alignment: Alignment.centerRight,
          child: ConstrainedBox(
            constraints: BoxConstraints(maxWidth: maxWidth),
            child: Container(
              padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
              decoration: BoxDecoration(
                color: AppColors.forest,
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(18),
                  topRight: Radius.circular(18),
                  bottomLeft: Radius.circular(18),
                  bottomRight: Radius.circular(5),
                ),
              ),
              child: Text(
                turn.text,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: AppColors.white,
                ),
              ),
            ),
          ),
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.auto_awesome_rounded,
                size: 15,
                color: AppColors.sageInk,
              ),
              SizedBox(width: 6),
              Text(
                'CityCart assistant',
                style: TextStyle(
                  fontSize: 11.5,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.1,
                  color: AppColors.sageInk,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          ConstrainedBox(
            constraints: BoxConstraints(maxWidth: maxWidth),
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(5),
                  topRight: Radius.circular(18),
                  bottomLeft: Radius.circular(18),
                  bottomRight: Radius.circular(18),
                ),
                border: Border.all(color: AppColors.line),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (turn.degraded) ...[
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          turn.orders.isNotEmpty
                              ? Icons.receipt_long_rounded
                              : turn.providers.isNotEmpty
                              ? Icons.storefront_rounded
                              : Icons.search_rounded,
                          size: 14,
                          color: AppColors.muted,
                        ),
                        const SizedBox(width: 5),
                        Text(
                          turn.orders.isNotEmpty
                              ? 'Latest orders without the assistant.'
                              : turn.providers.isNotEmpty
                              ? 'Providers without the assistant.'
                              : 'Plain search results.',
                          style: const TextStyle(
                            fontSize: 11.5,
                            fontWeight: FontWeight.w600,
                            color: AppColors.muted,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                  ],
                  Text(turn.text, style: Theme.of(context).textTheme.bodyMedium),
                  for (final product in turn.products) ...[
                    const SizedBox(height: 10),
                    _AssistantProductCard(product: product),
                  ],
                  for (final order in turn.orders) ...[
                    const SizedBox(height: 10),
                    _AssistantOrderCard(order: order),
                  ],
                  for (final provider in turn.providers) ...[
                    const SizedBox(height: 10),
                    _AssistantProviderCard(provider: provider),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _AssistantProductCard extends StatelessWidget {
  const _AssistantProductCard({required this.product});

  final ProductSummary product;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.paper,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: product.id.isEmpty
            ? null
            : () => context.push('/product/${product.id}'),
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Row(
            children: [
              ProductThumb(url: product.image, size: 48, radius: 10),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      product.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 13.5,
                        fontWeight: FontWeight.w600,
                        height: 1.3,
                        color: AppColors.ink,
                      ),
                    ),
                    if (product.brandName != null) ...[
                      const SizedBox(height: 1),
                      Text(
                        product.brandName!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 11.5,
                          color: AppColors.muted,
                        ),
                      ),
                    ],
                    const SizedBox(height: 5),
                    Wrap(
                      spacing: 6,
                      runSpacing: 4,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        Text(
                          formatMoney(product.price),
                          style: const TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w700,
                            color: AppColors.clay,
                          ),
                        ),
                        if (product.availability == 'LOW_STOCK')
                          const Pill(
                            text: 'Low stock',
                            background: AppColors.goldSoft,
                            foreground: AppColors.goldInk,
                          ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 4),
              const Icon(
                Icons.chevron_right_rounded,
                size: 18,
                color: AppColors.muted,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AssistantOrderCard extends StatelessWidget {
  const _AssistantOrderCard({required this.order});

  final AssistantOrder order;

  @override
  Widget build(BuildContext context) {
    final canOpen = order.id.isNotEmpty;
    final detail = <String?>[
      order.brandName,
      itemCountLabel(order.itemCount),
      formatShortDate(order.placedAt),
    ].whereType<String>().where((part) => part.isNotEmpty).join(' · ');

    return Material(
      color: AppColors.paper,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: canOpen ? () => context.push('/orders/${order.id}') : null,
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      order.orderNumber,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: AppColors.ink,
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  StatusPill(
                    text: friendlyOrder(order.orderStatus),
                    tone: toneForOrder(order.orderStatus),
                    compact: true,
                  ),
                ],
              ),
              if (detail.isNotEmpty) ...[
                const SizedBox(height: 3),
                Text(
                  detail,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 11.5,
                    color: AppColors.muted,
                  ),
                ),
              ],
              const SizedBox(height: 6),
              Row(
                children: [
                  Text(
                    formatMoney(order.payableTotal),
                    style: const TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w700,
                      color: AppColors.clay,
                    ),
                  ),
                  const Spacer(),
                  if (canOpen)
                    const Icon(
                      Icons.chevron_right_rounded,
                      size: 18,
                      color: AppColors.muted,
                    ),
                ],
              ),
              if (order.actions.isNotEmpty) ...[
                const SizedBox(height: 7),
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  children: [
                    for (final action in order.actions)
                      _ActionTag(action: action),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// A provider the server found, with only the free times it generated. The
/// assistant never books; the card opens the provider page where booking
/// happens normally.
class _AssistantProviderCard extends StatelessWidget {
  const _AssistantProviderCard({required this.provider});

  final AssistantServiceProvider provider;

  @override
  Widget build(BuildContext context) {
    final canOpen = provider.slug.isNotEmpty;
    final meta = [
      provider.categoryName,
      provider.blockName,
      formatDistance(provider.distanceKm),
    ].whereType<String>().where((part) => part.isNotEmpty).join(' · ');
    final rated = provider.ratingAvg != null && provider.ratingCount > 0;

    return Material(
      color: AppColors.paper,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: canOpen
            ? () => context.push('/services/provider/${provider.slug}')
            : null,
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      provider.displayName,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 13.5,
                        fontWeight: FontWeight.w700,
                        height: 1.3,
                        color: AppColors.ink,
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  if (provider.isNew)
                    const Pill(
                      text: 'New',
                      background: AppColors.paperDeep,
                      foreground: AppColors.inkSoft,
                    )
                  else if (rated)
                    Text(
                      '${provider.ratingAvg!.toStringAsFixed(1)} ★ '
                      '(${provider.ratingCount})',
                      style: const TextStyle(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w600,
                        color: AppColors.inkSoft,
                      ),
                    ),
                ],
              ),
              if (meta.isNotEmpty) ...[
                const SizedBox(height: 3),
                Text(
                  meta,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 11.5,
                    color: AppColors.muted,
                  ),
                ),
              ],
              const SizedBox(height: 6),
              Text(
                'From ${formatMoney(provider.startingAtPrice)}',
                style: const TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w700,
                  color: AppColors.clay,
                ),
              ),
              for (final offering in provider.offerings) ...[
                const SizedBox(height: 8),
                _AssistantOffering(offering: offering),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _AssistantOffering extends StatelessWidget {
  const _AssistantOffering({required this.offering});

  final AssistantServiceOffering offering;

  @override
  Widget build(BuildContext context) {
    final slots = offering.slots;
    final shown = slots.take(2).map((slot) => slot.label).join(' · ');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Text(
                offering.title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: AppColors.inkSoft,
                ),
              ),
            ),
            const SizedBox(width: 6),
            Text(
              '${offering.durationMinutes} min · '
              '${formatMoney(offering.startingAtPrice)}',
              style: const TextStyle(fontSize: 10.5, color: AppColors.muted),
            ),
          ],
        ),
        if (slots.isNotEmpty) ...[
          const SizedBox(height: 2),
          Text(
            'Free: $shown${slots.length > 2 ? ' +${slots.length - 2} more' : ''}',
            style: const TextStyle(
              fontSize: 10.5,
              fontWeight: FontWeight.w600,
              color: AppColors.forest,
            ),
          ),
        ],
      ],
    );
  }
}

/// The server builds these labels; the card opens the normal order page, where
/// the customer performs the action (the assistant never changes an order).
class _ActionTag extends StatelessWidget {
  const _ActionTag({required this.action});

  final OrderAssistantAction action;

  @override
  Widget build(BuildContext context) {
    final cancel = action.type == 'cancel_order';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: cancel ? AppColors.claySoft : AppColors.paperDeep,
        borderRadius: BorderRadius.circular(AppRadius.pill),
      ),
      child: Text(
        action.label,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: cancel ? AppColors.clay : AppColors.inkSoft,
        ),
      ),
    );
  }
}

class _Thinking extends StatelessWidget {
  const _Thinking({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Align(
        alignment: Alignment.centerLeft,
        child: Container(
          padding: const EdgeInsets.fromLTRB(14, 11, 14, 11),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: AppColors.line),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(
                width: 15,
                height: 15,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: AppColors.forest,
                ),
              ),
              const SizedBox(width: 10),
              Text(
                label,
                style: const TextStyle(fontSize: 13, color: AppColors.muted),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
