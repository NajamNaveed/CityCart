import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/config.dart';
import '../../core/status.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../providers.dart';

/// Support contacts from the platform plus short answers to the questions the
/// shopper app raises most. Nothing here is invented locally: the email and
/// phone come from the public settings the website also uses.
class HelpScreen extends ConsumerWidget {
  const HelpScreen({super.key});

  Future<void> _contact(
    BuildContext context,
    Uri uri,
    String missingMessage,
  ) async {
    var opened = false;
    try {
      opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {
      opened = false;
    }
    if (!opened && context.mounted) {
      showAppSnack(context, missingMessage, error: true);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(publicSettingsProvider);

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            const ScreenTopBar(
              title: 'Help & support',
              subtitle: 'Answers and a real person when you need one',
            ),
            Expanded(
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(20, 2, 20, 28),
                children: [
                  const NoticeCard(
                    icon: Icons.support_agent_rounded,
                    tone: StatusTone.sage,
                    title: 'We are here to help',
                    message:
                        'Most order and booking questions are answered below. '
                        'For anything else, contact the CityCart support team.',
                  ),
                  const SizedBox(height: 18),
                  const SectionLabel('Contact support'),
                  const SizedBox(height: 10),
                  settings.when(
                    loading: () => const SkeletonBox(height: 64),
                    error: (error, _) => ErrorNotice(
                      message: error is ApiException
                          ? error.message
                          : 'Support details could not be loaded. Check your '
                                'connection.',
                      onRetry: () => ref.invalidate(publicSettingsProvider),
                    ),
                    data: (value) => _ContactCard(
                      settings: value,
                      onEmail: value.supportEmail.isEmpty
                          ? null
                          : () => _contact(
                              context,
                              Uri(
                                scheme: 'mailto',
                                path: value.supportEmail,
                                queryParameters: const {
                                  'subject': 'CityCart support',
                                },
                              ),
                              'No email app is available on this device.',
                            ),
                      onCall: value.supportPhone.isEmpty
                          ? null
                          : () => _contact(
                              context,
                              Uri(
                                scheme: 'tel',
                                path: value.supportPhone.replaceAll(
                                  RegExp(r'[^0-9+]'),
                                  '',
                                ),
                              ),
                              'No phone app is available on this device.',
                            ),
                    ),
                  ),
                  const SizedBox(height: 20),
                  const SectionLabel('Quick links'),
                  const SizedBox(height: 10),
                  SurfaceCard(
                    padding: EdgeInsets.zero,
                    child: Column(
                      children: [
                        _LinkRow(
                          icon: Icons.receipt_long_outlined,
                          title: 'Your orders',
                          subtitle: 'Track a delivery or open a receipt',
                          onTap: () => context.push('/orders'),
                        ),
                        const Divider(),
                        _LinkRow(
                          icon: Icons.event_available_outlined,
                          title: 'Your bookings',
                          subtitle: 'Service visits, offers and changes',
                          onTap: () => context.push('/bookings'),
                        ),
                        const Divider(),
                        _LinkRow(
                          icon: Icons.place_outlined,
                          title: 'Saved addresses',
                          subtitle: 'Fix a pin or add another place',
                          onTap: () => context.push('/addresses'),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),
                  const SectionLabel('Common questions'),
                  const SizedBox(height: 10),
                  const _Faq(
                    question: 'Where is my order?',
                    answer:
                        'Open Your orders and pick the order. The status moves '
                        'as the shop packs it, the rider collects it, and it '
                        'reaches your door. Live updates also appear in '
                        'Notifications.',
                  ),
                  const _Faq(
                    question: 'Can I cancel an order?',
                    answer:
                        'Yes, while the shop has not started packing. Open the '
                        'order and choose Cancel order. If packing has begun, '
                        'message the shop from the order to ask what is still '
                        'possible.',
                  ),
                  const _Faq(
                    question: 'How do service bookings work?',
                    answer:
                        'Send a request with your preferred time and notes. '
                        'The provider accepts it or offers another time. The '
                        'visit is paid after the work is done and the receipt '
                        'appears in Your bookings.',
                  ),
                  const _Faq(
                    question: 'How do I pay?',
                    answer:
                        'Orders and service visits are cash on delivery in '
                        'this release. Each receipt shows the amount and how '
                        'it was collected.',
                  ),
                  const _Faq(
                    question: 'Why can I not order to my address?',
                    answer:
                        'Every address needs a pin inside an active delivery '
                        'block. Edit the saved address and choose its block, '
                        'or change your area from the You tab if the city is '
                        'wrong.',
                  ),
                  const _Faq(
                    question: 'How do I contact a shop or provider?',
                    answer:
                        'Open the product or provider page and tap Message. '
                        'Replies arrive in Messages under the You tab, next to '
                        'your booking chats.',
                  ),
                  const SizedBox(height: 22),
                  Text(
                    'CityCart ${AppConfig.appVersion}',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ContactCard extends StatelessWidget {
  const _ContactCard({
    required this.settings,
    required this.onEmail,
    required this.onCall,
  });

  final PublicSettings settings;
  final VoidCallback? onEmail;
  final VoidCallback? onCall;

  @override
  Widget build(BuildContext context) {
    final hasEmail = settings.supportEmail.isNotEmpty;
    final hasPhone = settings.supportPhone.isNotEmpty;

    if (!hasEmail && !hasPhone) {
      return const NoticeCard(
        icon: Icons.hourglass_empty_rounded,
        tone: StatusTone.muted,
        title: 'Support details are not published yet',
        message:
            'The city team has not added a support email or phone. Check the '
            'CityCart website for contact details.',
      );
    }

    return SurfaceCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          if (hasEmail)
            _LinkRow(
              icon: Icons.alternate_email_rounded,
              title: 'Email support',
              subtitle: settings.supportEmail,
              onTap: onEmail,
            ),
          if (hasEmail && hasPhone) const Divider(),
          if (hasPhone)
            _LinkRow(
              icon: Icons.call_outlined,
              title: 'Call support',
              subtitle: settings.supportPhone,
              onTap: onCall,
            ),
        ],
      ),
    );
  }
}

class _LinkRow extends StatelessWidget {
  const _LinkRow({
    required this.icon,
    required this.title,
    required this.subtitle,
    this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final content = Padding(
      padding: const EdgeInsets.fromLTRB(16, 13, 14, 13),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: AppColors.paperDeep,
              borderRadius: BorderRadius.circular(11),
            ),
            child: Icon(icon, size: 19, color: AppColors.inkSoft),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
          if (onTap != null)
            const Icon(Icons.chevron_right_rounded, color: AppColors.muted),
        ],
      ),
    );

    if (onTap == null) return content;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppRadius.card),
      child: content,
    );
  }
}

class _Faq extends StatelessWidget {
  const _Faq({required this.question, required this.answer});

  final String question;
  final String answer;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: SurfaceCard(
        padding: EdgeInsets.zero,
        child: Theme(
          data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
          child: ExpansionTile(
            tilePadding: const EdgeInsets.symmetric(horizontal: 16),
            childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
            expandedCrossAxisAlignment: CrossAxisAlignment.start,
            title: Text(
              question,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            iconColor: AppColors.forest,
            collapsedIconColor: AppColors.muted,
            shape: const Border(),
            collapsedShape: const Border(),
            children: [
              Text(answer, style: Theme.of(context).textTheme.bodyMedium),
            ],
          ),
        ),
      ),
    );
  }
}
