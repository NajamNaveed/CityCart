import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/models.dart';
import '../../providers.dart';

class _Destination {
  const _Destination(this.label, this.icon, this.selectedIcon);

  final String label;
  final IconData icon;
  final IconData selectedIcon;
}

/// Home and Account are shared by both kinds of owner. A service provider also
/// gets Bookings. Wide windows get a settled sidebar; phones get a bottom bar
/// with the same destinations in the same order.
const _homeDestination = _Destination(
  'Home',
  Icons.space_dashboard_outlined,
  Icons.space_dashboard_rounded,
);
const _bookingsDestination = _Destination(
  'Bookings',
  Icons.event_note_outlined,
  Icons.event_note_rounded,
);
const _messagesDestination = _Destination(
  'Messages',
  Icons.chat_bubble_outline_rounded,
  Icons.chat_bubble_rounded,
);
const _accountDestination = _Destination(
  'Account',
  Icons.person_outline_rounded,
  Icons.person_rounded,
);

/// The middle tab is the provider's bookings or the shop's customer messages.
List<_Destination> _destinationsFor(AppUser? user) {
  if (user?.isProvider ?? false) {
    return const [_homeDestination, _bookingsDestination, _accountDestination];
  }
  return const [_homeDestination, _messagesDestination, _accountDestination];
}

class BusinessShell extends ConsumerWidget {
  const BusinessShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  void _openBranch(BuildContext context, AppUser? user, int branch) {
    if (branch == 1 && (user?.isBrand ?? false)) {
      context.go('/brand-messages');
      return;
    }
    navigationShell.goBranch(
      branch,
      initialLocation: branch == navigationShell.currentIndex,
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(sessionProvider).user;
    final destinations = _destinationsFor(user);
    final selected = navigationShell.currentIndex;

    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth >= 900) {
          return Scaffold(
            body: SafeArea(
              child: Row(
                children: [
                  _Sidebar(
                    user: user,
                    destinations: destinations,
                    index: selected,
                    onOpen: (visible) => _openBranch(context, user, visible),
                  ),
                  const VerticalDivider(width: 1),
                  Expanded(child: navigationShell),
                ],
              ),
            ),
          );
        }
        return Scaffold(
          body: navigationShell,
          bottomNavigationBar: DecoratedBox(
            decoration: const BoxDecoration(
              color: AppColors.surface,
              border: Border(top: BorderSide(color: AppColors.line)),
            ),
            child: NavigationBar(
              selectedIndex: selected,
              onDestinationSelected: (visible) =>
                  _openBranch(context, user, visible),
              destinations: [
                for (final destination in destinations)
                  NavigationDestination(
                    icon: Icon(destination.icon),
                    selectedIcon: Icon(destination.selectedIcon),
                    label: destination.label,
                  ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _Sidebar extends StatelessWidget {
  const _Sidebar({
    required this.user,
    required this.destinations,
    required this.index,
    required this.onOpen,
  });

  final AppUser? user;
  final List<_Destination> destinations;
  final int index;
  final ValueChanged<int> onOpen;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 262,
      color: AppColors.surface,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 22, 20, 20),
            child: Row(
              children: [
                const BusinessMark(size: 40),
                const SizedBox(width: 11),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'CityCart',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: AppColors.ink,
                        ),
                      ),
                      Text(
                        'Business',
                        maxLines: 1,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          const SizedBox(height: 10),
          for (var i = 0; i < destinations.length; i++)
            _SideDestination(
              destination: destinations[i],
              selected: i == index,
              onTap: () => onOpen(i),
            ),
          const Spacer(),
          if (user != null) ...[
            const Divider(height: 1),
            InkWell(
              onTap: () => onOpen(destinations.length - 1),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    AvatarBadge(name: user!.name, size: 38),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            user!.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.titleSmall,
                          ),
                          Text(
                            roleName(user!.role),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
            child: Text(
              'CityCart Business',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.labelSmall,
            ),
          ),
        ],
      ),
    );
  }
}

class _SideDestination extends StatelessWidget {
  const _SideDestination({
    required this.destination,
    required this.selected,
    required this.onTap,
  });

  final _Destination destination;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
      child: Material(
        color: selected ? AppColors.mint : Colors.transparent,
        borderRadius: BorderRadius.circular(AppRadius.md),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(AppRadius.md),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            child: Row(
              children: [
                Icon(
                  selected ? destination.selectedIcon : destination.icon,
                  size: 21,
                  color: selected ? AppColors.forest : AppColors.inkSoft,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    destination.label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 14.5,
                      fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                      color: selected ? AppColors.forestInk : AppColors.inkSoft,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
