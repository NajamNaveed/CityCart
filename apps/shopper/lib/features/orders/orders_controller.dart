import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../data/repository.dart';
import '../../providers.dart';

/// The shopper's orders, newest first. The list is paged and a refresh always
/// replaces it, so a slow page can never append to a newer one.
class OrdersController extends ChangeNotifier {
  OrdersController(this._repository);

  final ShopperRepository _repository;

  final List<CustomerOrder> _items = [];
  final Map<String, String> _brandNames = {};
  Pagination _pagination = const Pagination();
  bool _loading = true;
  bool _loadingMore = false;
  String? _error;
  int _generation = 0;
  bool _disposed = false;

  List<CustomerOrder> get items => List.unmodifiable(_items);
  Pagination get pagination => _pagination;
  bool get loading => _loading;
  bool get loadingMore => _loadingMore;
  String? get error => _error;
  bool get hasMore => _pagination.hasMore;

  /// The shop's name once it has been read; the card falls back to "Shop".
  String? brandNameFor(String brandId) => _brandNames[brandId];

  Future<void> loadInitial() => _load(reset: true);

  Future<void> refresh() => _load(reset: true);

  Future<void> loadMore() {
    if (_loading || _loadingMore || !hasMore) return Future.value();
    return _load(reset: false);
  }

  Future<void> _load({required bool reset}) async {
    final generation = ++_generation;
    if (reset) {
      _loading = true;
      _loadingMore = false;
      _error = null;
    } else {
      _loadingMore = true;
    }
    _notify();

    final page = reset ? 1 : _pagination.page + 1;
    try {
      final result = await _repository.myOrders(page: page, limit: 10);
      if (generation != _generation || _disposed) return;
      if (reset) _items.clear();
      _items.addAll(result.items);
      _pagination = result.pagination;
      _error = null;
      // Shop names are a nicety: the list is usable before they arrive.
      unawaited(_resolveBrands());
    } on ApiException catch (error) {
      if (generation != _generation || _disposed) return;
      _error = error.message;
    } catch (_) {
      if (generation != _generation || _disposed) return;
      _error = 'We could not load your orders. Check your connection.';
    } finally {
      if (generation == _generation && !_disposed) {
        _loading = false;
        _loadingMore = false;
        _notify();
      }
    }
  }

  Future<void> _resolveBrands() async {
    final missing = <String>{
      for (final order in _items)
        if (order.brandId.isNotEmpty && !_brandNames.containsKey(order.brandId))
          order.brandId,
    };
    var changed = false;
    for (final id in missing) {
      try {
        final brand = await _repository.brand(id);
        if (_disposed) return;
        _brandNames[id] = brand.name;
        changed = true;
      } catch (_) {
        // A suspended shop keeps its old orders; the card just says "Shop".
      }
    }
    if (changed && !_disposed) _notify();
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

final ordersProvider = Provider.autoDispose<OrdersController>((ref) {
  final controller = OrdersController(ref.watch(shopperRepositoryProvider));
  controller.loadInitial();
  ref.onDispose(controller.dispose);
  return controller;
});
