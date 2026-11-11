/// What a brand team member may see in the app. The permission list comes from
/// the server (`GET /auth/me`); the server checks the same permission on every
/// request, so hiding a screen is a convenience and never the security.
class Permissions {
  const Permissions._();

  static const ordersView = 'orders.view';
  static const ordersManage = 'orders.manage';
  static const deliveryView = 'delivery.view';
  static const deliveryManage = 'delivery.manage';
  static const paymentsView = 'payments.view';
  static const paymentsManage = 'payments.manage';
  static const ridersView = 'riders.view';
}

bool can(List<String>? permissions, String permission) =>
    permissions != null && permissions.contains(permission);

class StaffAccess {
  const StaffAccess({
    required this.isPicker,
    required this.orders,
    required this.deliveries,
    required this.returns,
    required this.money,
    this.deliveryManage = false,
    this.paymentsManage = false,
    this.ridersView = false,
  });

  factory StaffAccess.from({
    required String role,
    required List<String> permissions,
  }) {
    if (role == 'PICKER') {
      return const StaffAccess(
        isPicker: true,
        orders: false,
        deliveries: false,
        returns: false,
        money: false,
      );
    }
    final deliveries = can(permissions, Permissions.deliveryView);
    return StaffAccess(
      isPicker: false,
      orders: can(permissions, Permissions.ordersView),
      deliveries: deliveries,
      returns: deliveries,
      money: can(permissions, Permissions.paymentsView),
      deliveryManage: can(permissions, Permissions.deliveryManage),
      paymentsManage: can(permissions, Permissions.paymentsManage),
      ridersView: can(permissions, Permissions.ridersView),
    );
  }

  final bool isPicker;
  final bool orders;
  final bool deliveries;
  final bool returns;
  final bool money;
  final bool deliveryManage;
  final bool paymentsManage;
  final bool ridersView;

  bool get hasRecords => orders || deliveries || returns || money;
  bool get canAssignRider => deliveries && deliveryManage && ridersView;
}
