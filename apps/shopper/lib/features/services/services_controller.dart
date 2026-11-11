import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../data/repository.dart';
import '../../providers.dart';

enum ServiceSort {
  rank('rank', 'Best match'),
  rating('rating', 'Top rated'),
  price('price', 'Lowest price');

  const ServiceSort(this.value, this.label);

  final String value;
  final String label;
}

/// Finds approved service providers around the chosen area, then narrows by
/// category, words and sort. A new search cancels an older request by
/// generation, so a slow reply can never replace newer results.
class ServicesController extends ChangeNotifier {
  ServicesController(this._repository, this._area);

  final ShopperRepository _repository;
  final AreaSelection? _area;

  String _query = '';
  String _categoryId = '';
  ServiceSort _sort = ServiceSort.rank;
  final List<ServiceProvider> _items = [];
  Pagination _pagination = const Pagination();
  bool _loading = true;
  bool _loadingMore = false;
  String? _error;
  int _generation = 0;
  bool _disposed = false;

  String get query => _query;
  String get categoryId => _categoryId;
  ServiceSort get sort => _sort;
  List<ServiceProvider> get items => List.unmodifiable(_items);
  Pagination get pagination => _pagination;
  bool get loading => _loading;
  bool get loadingMore => _loadingMore;
  String? get error => _error;
  bool get hasMore => _pagination.hasMore;
  bool get hasFilters => _query.isNotEmpty || _categoryId.isNotEmpty;

  Future<void> loadInitial() => _load(reset: true);

  Future<void> refresh() => _load(reset: true);

  Future<void> retry() => _load(reset: true);

  void search(String raw) {
    final next = raw.trim();
    if (next == _query) return;
    _query = next;
    _load(reset: true);
  }

  void chooseCategory(String categoryId) {
    if (categoryId == _categoryId) return;
    _categoryId = categoryId;
    _load(reset: true);
  }

  void chooseSort(ServiceSort sort) {
    if (sort == _sort) return;
    _sort = sort;
    _load(reset: true);
  }

  void clearFilters() {
    if (!hasFilters) return;
    _query = '';
    _categoryId = '';
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
      _error = 'Choose an area to see nearby providers.';
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
      final result = await _repository.discoverServices(
        area: area,
        categoryId: _categoryId,
        query: _query,
        sort: _sort.value,
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
      _error = 'We could not find services just now. Check your connection.';
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

final servicesProvider = Provider.autoDispose<ServicesController>((ref) {
  final controller = ServicesController(
    ref.watch(shopperRepositoryProvider),
    ref.read(areaProvider).area,
  );
  controller.loadInitial();
  ref.onDispose(controller.dispose);
  return controller;
});
