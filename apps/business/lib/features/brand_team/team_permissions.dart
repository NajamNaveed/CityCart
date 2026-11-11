import 'package:flutter/material.dart';

/// What a team member can do, grouped so a shop owner picks by job rather than
/// by server key. Every key is one the server accepts on an employee.
class PermissionGroup {
  const PermissionGroup({
    required this.title,
    required this.icon,
    required this.items,
  });

  final String title;
  final IconData icon;
  final List<PermissionItem> items;
}

class PermissionItem {
  const PermissionItem(this.key, this.label);

  final String key;
  final String label;
}

const teamPermissionGroups = <PermissionGroup>[
  PermissionGroup(
    title: 'Orders',
    icon: Icons.receipt_long_outlined,
    items: [
      PermissionItem('orders.view', 'See customer orders'),
      PermissionItem('orders.manage', 'Confirm and prepare orders'),
      PermissionItem('orders.adjust', 'Change what a customer receives'),
    ],
  ),
  PermissionGroup(
    title: 'Delivery',
    icon: Icons.local_shipping_outlined,
    items: [
      PermissionItem('delivery.view', 'See deliveries'),
      PermissionItem('delivery.manage', 'Move deliveries along'),
    ],
  ),
  PermissionGroup(
    title: 'Products and stock',
    icon: Icons.inventory_2_outlined,
    items: [
      PermissionItem('products.view', 'See products and prices'),
      PermissionItem('products.create', 'Add products'),
      PermissionItem('products.update', 'Edit products'),
      PermissionItem('products.delete', 'Hide products'),
      PermissionItem('inventory.view', 'See stock levels'),
      PermissionItem('inventory.manage', 'Change stock levels'),
    ],
  ),
  PermissionGroup(
    title: 'Payments',
    icon: Icons.payments_outlined,
    items: [
      PermissionItem('payments.view', 'See payments'),
      PermissionItem('payments.manage', 'Record payments'),
    ],
  ),
  PermissionGroup(
    title: 'Customers',
    icon: Icons.people_alt_outlined,
    items: [
      PermissionItem('customers.view', 'See customer names and addresses'),
      PermissionItem('messages.view', 'Read customer messages'),
      PermissionItem('messages.manage', 'Reply to customers'),
    ],
  ),
  PermissionGroup(
    title: 'Riders',
    icon: Icons.sports_motorsports_outlined,
    items: [
      PermissionItem('riders.view', 'See riders'),
      PermissionItem('riders.create', 'Add riders'),
      PermissionItem('riders.update', 'Edit riders and change passwords'),
    ],
  ),
  PermissionGroup(
    title: 'Team and shop',
    icon: Icons.manage_accounts_outlined,
    items: [
      PermissionItem('employees.view', 'See the team'),
      PermissionItem('employees.create', 'Add team members'),
      PermissionItem('employees.update', 'Edit team members'),
      PermissionItem('employees.delete', 'Remove team members'),
      PermissionItem(
        'employees.manage_permissions',
        'Change what team members can do',
      ),
      PermissionItem('store.update', 'Edit shop settings'),
      PermissionItem('analytics.view', 'See shop insights'),
    ],
  ),
];

/// The plain words for one server permission key.
String permissionLabel(String key) {
  for (final group in teamPermissionGroups) {
    for (final item in group.items) {
      if (item.key == key) return item.label;
    }
  }
  return key;
}

/// "Orders, Delivery and 3 more" for a compact card line.
String permissionSummary(List<String> permissions) {
  if (permissions.isEmpty) return 'No access yet';
  if (permissions.length ==
      teamPermissionGroups.fold<int>(
        0,
        (total, group) => total + group.items.length,
      )) {
    return 'Full access';
  }
  final groups = <String>[];
  for (final group in teamPermissionGroups) {
    if (group.items.any((item) => permissions.contains(item.key))) {
      groups.add(group.title);
    }
  }
  if (groups.length <= 2) return groups.join(' and ');
  return '${groups.take(2).join(', ')} and ${groups.length - 2} more';
}
