import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../data/repository.dart';
import '../../providers.dart';

/// Searches shops around the chosen area and pages through the results. A new
/// search cancels the old one by generation, so a slow reply can never replace
/// the results of a newer query.
class ExploreController extends ChangeNotifier {
  ExploreController(this._repository, this._area);

  final ShopperRepository _repository;
  final AreaSelection? _area;

  String _query = '';
  final List<DiscoverBrand> _items = [];
  Pagination _pagination = const Pagination();
  bool _loading = true;
  bool _loadingMore = false;
  String? _error;
  int _generation = 0;
  bool _disposed = false;

  String get query => _query;
  List<DiscoverBrand> get items => List.unmodifiable(_items);
  Pagination get pagination => _pagination;
  bool get loading => _loading;
  bool get loadingMore => _loadingMore;
  String? get error => _error;
  bool get hasMore => _pagination.hasMore;

  Future<void> loadInitial() => _load(reset: true);

  Future<void> refresh() => _load(reset: true);

  Future<void> retry() => _load(reset: true);

  void search(String raw) {
    final next = raw.trim();
    if (next == _query) return;
    _query = next;
    _load(reset: true);
  }

  Future<void> loadMore() {
    if (_loading || _loadingMore || !_pagination.hasMore) {
      return Future.value();
    }
    return _load(reset: false);
  }

  Future<void> _load({required bool reset}) async {
    final area = _area;
    if (area == null) {
      _loading = false;
      _error = 'Choose an area to see nearby shops.';
      _notify();
      return;
    }

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
      final result = await _repository.discover(
        area: area,
        query: _query,
        page: page,
        limit: 12,
      );
      if (generation != _generation || _disposed) return;
      if (reset) _items.clear();
      _items.addAll(result.items);
      _pagination = result.pagination;
      _error = null;
    } on ApiException catch (error) {
      if (generation != _generation || _disposed) return;
      _error = error.message;
    } catch (_) {
      if (generation != _generation || _disposed) return;
      _error = 'We could not search just now. Check your connection.';
    } finally {
      if (generation == _generation && !_disposed) {
        _loading = false;
        _loadingMore = false;
        _notify();
      }
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

final exploreProvider = Provider.autoDispose<ExploreController>((ref) {
  final controller = ExploreController(
    ref.watch(shopperRepositoryProvider),
    ref.read(areaProvider).area,
  );
  controller.loadInitial();
  ref.onDispose(controller.dispose);
  return controller;
});
