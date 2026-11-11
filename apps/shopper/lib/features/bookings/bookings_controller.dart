import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../data/repository.dart';
import '../../providers.dart';

/// The shopper's service bookings, newest first. A refresh always replaces the
/// list, so a slow page can never append to a newer one.
class BookingsController extends ChangeNotifier {
  BookingsController(this._repository);

  final ShopperRepository _repository;

  final List<ServiceBooking> _items = [];
  Pagination _pagination = const Pagination();
  bool _loading = true;
  bool _loadingMore = false;
  String? _error;
  int _generation = 0;
  bool _disposed = false;

  List<ServiceBooking> get items => List.unmodifiable(_items);
  Pagination get pagination => _pagination;
  bool get loading => _loading;
  bool get loadingMore => _loadingMore;
  String? get error => _error;
  bool get hasMore => _pagination.hasMore;
  int get pendingCount => _items.where((item) => item.needsAnswer).length;

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
      final result = await _repository.serviceBookings(page: page, limit: 10);
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
      _error = 'We could not load your bookings. Check your connection.';
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

final bookingsProvider = Provider.autoDispose<BookingsController>((ref) {
  final controller = BookingsController(ref.watch(shopperRepositoryProvider));
  controller.loadInitial();
  ref.onDispose(controller.dispose);
  return controller;
});

final bookingDetailProvider = FutureProvider.autoDispose
    .family<ServiceBooking, String>((ref, bookingId) {
      return ref.watch(shopperRepositoryProvider).serviceBooking(bookingId);
    });
