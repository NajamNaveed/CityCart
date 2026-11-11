import 'package:citycart_staff/core/permissions.dart';
import 'package:citycart_staff/providers.dart';
import 'package:citycart_staff/router.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final picker = StaffAccess.from(role: 'PICKER', permissions: const []);
  final noAccess = StaffAccess.from(
    role: 'BRAND_EMPLOYEE',
    permissions: const [],
  );
  final everything = StaffAccess.from(
    role: 'BRAND_EMPLOYEE',
    permissions: const [
      Permissions.ordersView,
      Permissions.deliveryView,
      Permissions.paymentsView,
      Permissions.paymentsManage,
    ],
  );

  String? go(
    SessionStatus status,
    bool isPicker,
    StaffAccess access,
    String location,
  ) => staffRedirect(
    status: status,
    picker: isPicker,
    access: access,
    location: location,
  );

  test('the launch state waits on the splash screen', () {
    expect(go(SessionStatus.unknown, false, noAccess, '/splash'), isNull);
    expect(go(SessionStatus.unknown, false, noAccess, '/home'), '/splash');
  });

  test('a signed-out person only sees sign-in', () {
    expect(go(SessionStatus.signedOut, false, noAccess, '/login'), isNull);
    expect(go(SessionStatus.signedOut, false, noAccess, '/money'), '/login');
  });

  test('signing in lands on the right home for the role', () {
    expect(go(SessionStatus.signedIn, true, picker, '/login'), '/queue');
    expect(go(SessionStatus.signedIn, false, noAccess, '/login'), '/home');
    expect(go(SessionStatus.signedIn, true, picker, '/splash'), '/queue');
  });

  test('a picker cannot wander into the brand side', () {
    expect(go(SessionStatus.signedIn, true, picker, '/queue'), isNull);
    expect(go(SessionStatus.signedIn, true, picker, '/pick/abc'), isNull);
    expect(go(SessionStatus.signedIn, true, picker, '/account'), isNull);
    expect(go(SessionStatus.signedIn, true, picker, '/orders'), '/queue');
    expect(go(SessionStatus.signedIn, true, picker, '/money'), '/queue');
  });

  test('a brand user cannot open the picking screens', () {
    expect(go(SessionStatus.signedIn, false, everything, '/queue'), '/home');
    expect(go(SessionStatus.signedIn, false, everything, '/pick/abc'), '/home');
  });

  test('missing permissions close their areas, detail routes included', () {
    expect(go(SessionStatus.signedIn, false, noAccess, '/orders'), '/home');
    expect(go(SessionStatus.signedIn, false, noAccess, '/orders/123'), '/home');
    expect(
      go(SessionStatus.signedIn, false, noAccess, '/returns/123'),
      '/home',
    );
    expect(go(SessionStatus.signedIn, false, noAccess, '/cash/123'), '/home');
    expect(
      go(SessionStatus.signedIn, false, noAccess, '/receipts/123'),
      '/home',
    );
    expect(go(SessionStatus.signedIn, false, noAccess, '/verify/123'), '/home');
  });

  test('granted permissions keep every area open', () {
    expect(go(SessionStatus.signedIn, false, everything, '/orders'), isNull);
    expect(
      go(SessionStatus.signedIn, false, everything, '/deliveries/9'),
      isNull,
    );
    expect(go(SessionStatus.signedIn, false, everything, '/returns/9'), isNull);
    expect(go(SessionStatus.signedIn, false, everything, '/money'), isNull);
    expect(go(SessionStatus.signedIn, false, everything, '/cash/9'), isNull);
    expect(go(SessionStatus.signedIn, false, everything, '/account'), isNull);
  });
}
