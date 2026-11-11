import 'package:citycart_staff/core/permissions.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('a picker gets only the picking side', () {
    final access = StaffAccess.from(role: 'PICKER', permissions: const []);

    expect(access.isPicker, isTrue);
    expect(access.hasRecords, isFalse);
    expect(access.orders, isFalse);
    expect(access.money, isFalse);
  });

  test('orders and delivery permissions open their own areas', () {
    final access = StaffAccess.from(
      role: 'BRAND_EMPLOYEE',
      permissions: const [Permissions.ordersView],
    );

    expect(access.orders, isTrue);
    expect(access.deliveries, isFalse);
    expect(access.returns, isFalse);
    expect(access.money, isFalse);
    expect(access.hasRecords, isTrue);
  });

  test('returns follow delivery.view, not payments.view', () {
    final access = StaffAccess.from(
      role: 'BRAND_EMPLOYEE',
      permissions: const [Permissions.deliveryView, Permissions.paymentsView],
    );

    expect(access.deliveries, isTrue);
    expect(access.returns, isTrue);
    expect(access.money, isTrue);
    expect(access.deliveryManage, isFalse);
  });

  test('assigning a rider needs delivery.manage and riders.view', () {
    final withoutRiders = StaffAccess.from(
      role: 'BRAND_EMPLOYEE',
      permissions: const [Permissions.deliveryView, Permissions.deliveryManage],
    );
    final full = StaffAccess.from(
      role: 'BRAND_EMPLOYEE',
      permissions: const [
        Permissions.deliveryView,
        Permissions.deliveryManage,
        Permissions.ridersView,
      ],
    );

    expect(withoutRiders.canAssignRider, isFalse);
    expect(full.canAssignRider, isTrue);
  });

  test('payment management is separate from payment reading', () {
    final viewOnly = StaffAccess.from(
      role: 'BRAND_EMPLOYEE',
      permissions: const [Permissions.paymentsView],
    );
    final manage = StaffAccess.from(
      role: 'BRAND_EMPLOYEE',
      permissions: const [Permissions.paymentsView, Permissions.paymentsManage],
    );

    expect(viewOnly.money, isTrue);
    expect(viewOnly.paymentsManage, isFalse);
    expect(manage.paymentsManage, isTrue);
  });
}
