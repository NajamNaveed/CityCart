import 'package:citycart_staff/core/permissions.dart';
import 'package:citycart_staff/core/theme.dart';
import 'package:citycart_staff/data/api_client.dart';
import 'package:citycart_staff/data/models.dart';
import 'package:citycart_staff/data/repository.dart';
import 'package:citycart_staff/data/session_store.dart';
import 'package:citycart_staff/features/home/home_screen.dart';
import 'package:citycart_staff/providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

class _UnusedRepository extends StaffRepository {
  _UnusedRepository() : super(ApiClient(SessionStore()));
}

/// A signed-in team member with no permissions at all, as the Team page saves
/// someone before the owner ticks anything.
class _EmptyAccessSession extends SessionController {
  _EmptyAccessSession()
    : super(_UnusedRepository(), SessionStore(), ApiClient(SessionStore()));

  static const _user = AppUser(
    id: 'u1',
    name: 'Ali',
    email: 'ali@gmail.com',
    role: 'BRAND_EMPLOYEE',
    brandId: 'b1',
  );

  @override
  SessionStatus get status => SessionStatus.signedIn;

  @override
  AppUser? get user => _user;

  @override
  bool get isOffline => false;

  @override
  bool get profileIncomplete => false;

  @override
  List<Workspace> get workspaces => const [];
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('en');
  });

  testWidgets('a team member with no permissions is told why the app is empty', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(360, 720);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    final session = _EmptyAccessSession();
    addTearDown(session.dispose);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          sessionProvider.overrideWithValue(session),
          accessProvider.overrideWithValue(
            const StaffAccess(
              isPicker: false,
              orders: false,
              deliveries: false,
              returns: false,
              money: false,
            ),
          ),
          staffRepositoryProvider.overrideWithValue(_UnusedRepository()),
        ],
        child: MaterialApp(
          theme: AppTheme.light,
          home: const HomeScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Your account has no access yet'), findsOneWidget);
    expect(find.text('Check my access'), findsOneWidget);
    expect(find.text('Nothing needs you right now'), findsNothing);
  });
}
