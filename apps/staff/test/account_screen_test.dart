import 'package:citycart_staff/core/theme.dart';
import 'package:citycart_staff/data/api_client.dart';
import 'package:citycart_staff/data/models.dart';
import 'package:citycart_staff/data/repository.dart';
import 'package:citycart_staff/data/session_store.dart';
import 'package:citycart_staff/features/account/account_screen.dart';
import 'package:citycart_staff/providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

const _email = 'areeba.saleem@saharliestyle.pk';

class _UnusedRepository extends StaffRepository {
  _UnusedRepository() : super(ApiClient(SessionStore()));
}

/// A signed-in session with no storage or network behind it: the test only
/// reads what the Account screen draws.
class _SignedInSession extends SessionController {
  _SignedInSession()
    : super(_UnusedRepository(), SessionStore(), ApiClient(SessionStore()));

  static const _user = AppUser(
    id: 'u1',
    name: 'Areeba Saleem',
    email: _email,
    role: 'PICKER',
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
  testWidgets('a long email reads left to right on a narrow account screen', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 720);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    final session = _SignedInSession();
    addTearDown(session.dispose);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [sessionProvider.overrideWithValue(session)],
        child: MaterialApp(
          theme: AppTheme.light,
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context)
                .copyWith(textScaler: const TextScaler.linear(1.3)),
            child: child!,
          ),
          home: const AccountScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.text('Signed in as'),
      240,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();

    final value = find.byKey(const Key('account-email'));
    expect(value, findsOneWidget);
    expect(tester.widget<Text>(value).data, _email);

    final label = tester.getTopLeft(find.text('Signed in as'));
    final topLeft = tester.getTopLeft(value);
    // Stacked under its label and starting from the left, not squeezed into
    // the right-hand half of the row.
    expect(topLeft.dy, greaterThan(label.dy));
    expect(topLeft.dx, lessThan(160));
    expect(tester.takeException(), isNull);
  });
}
