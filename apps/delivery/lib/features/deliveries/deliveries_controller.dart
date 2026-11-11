import 'package:flutter/foundation.dart';

import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../data/repository.dart';

/// The rider's active jobs, kept in one place so Today can show a calm hero,
/// a short route list and an honest error without any of them inventing data.
class DeliveriesController extends ChangeNotifier {
  DeliveriesController(this._repository, {this.scope = 'active'});

  final DeliveryRepository _repository;
  final String scope;

  final List<RiderDelivery> items = [];
  bool loading = true;
  bool refreshing = false;
  bool loadingMore = false;
  String? error;
  int page = 1;
  int pages = 1;
  bool _disposed = false;

  bool get hasMore => page < pages;

  Future<void> load({bool fromRefresh = false}) async {
    if (!fromRefresh) {
      loading = items.isEmpty;
      error = null;
      _notify();
    }
    try {
      final result = await _repository.list(scope: scope, page: 1, limit: 20);
      items
        ..clear()
        ..addAll(result.items);
      page = result.page;
      pages = result.pages;
      error = null;
    } on ApiException catch (failure) {
      error = failure.message;
    } catch (_) {
      error =
          'Your jobs could not be loaded. Check your connection and try again.';
    } finally {
      loading = false;
      refreshing = false;
      _notify();
    }
  }

  Future<void> refresh() async {
    if (refreshing) return;
    refreshing = true;
    _notify();
    await load(fromRefresh: true);
  }

  Future<void> loadMore() async {
    if (loadingMore || !hasMore) return;
    loadingMore = true;
    _notify();
    try {
      final result = await _repository.list(
        scope: scope,
        page: page + 1,
        limit: 20,
      );
      final known = items.map((item) => item.id).toSet();
      items.addAll(result.items.where((item) => !known.contains(item.id)));
      page = result.page;
      pages = result.pages;
      error = null;
    } on ApiException catch (failure) {
      error = failure.message;
    } finally {
      loadingMore = false;
      _notify();
    }
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}
