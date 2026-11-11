import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../data/repository.dart';
import '../../providers.dart';

/// The shopper's personal notification inbox. Every write goes to the server
/// first; the local list only changes after the server agrees, so a failed tap
/// cannot hide an update that is still unread there.
class NotificationsController extends ChangeNotifier {
  NotificationsController(this._repository);

  final ShopperRepository _repository;

  List<AppNotification> _items = const <AppNotification>[];
  Pagination _pagination = const Pagination();
  int _unread = 0;
  bool _loading = true;
  bool _loadingMore = false;
  bool _busy = false;
  bool _disposed = false;
  int _generation = 0;
  String? _error;

  List<AppNotification> get items => _items;
  int get unreadCount => _unread;
  bool get loading => _loading;
  bool get loadingMore => _loadingMore;
  bool get busy => _busy;
  bool get hasMore => _pagination.hasMore;
  String? get error => _error;

  Future<void> loadInitial() => _load();

  Future<void> refresh() => _load();

  Future<void> _load() async {
    final generation = ++_generation;
    if (_items.isEmpty) {
      _loading = true;
      _notify();
    }
    try {
      final page = await _repository.notifications(page: 1, limit: 20);
      if (_disposed || generation != _generation) return;
      _items = page.items;
      _pagination = page.pagination;
      _unread = page.unreadCount;
      _error = null;
    } on ApiException catch (error) {
      if (_disposed || generation != _generation) return;
      _error = error.message;
    } catch (_) {
      if (_disposed || generation != _generation) return;
      _error = 'We could not load your notifications. Check your connection.';
    } finally {
      if (!_disposed && generation == _generation) {
        _loading = false;
        _notify();
      }
    }
  }

  Future<void> loadMore() async {
    if (_loading || _loadingMore || !hasMore) return;
    final generation = _generation;
    _loadingMore = true;
    _notify();
    try {
      final page = await _repository.notifications(
        page: _pagination.page + 1,
        limit: _pagination.limit,
      );
      if (_disposed || generation != _generation) return;
      final known = _items.map((item) => item.id).toSet();
      _items = [
        ..._items,
        ...page.items.where((item) => !known.contains(item.id)),
      ];
      _pagination = page.pagination;
      _unread = page.unreadCount;
      _error = null;
    } on ApiException catch (error) {
      if (_disposed || generation != _generation) return;
      _error = error.message;
    } finally {
      if (!_disposed && generation == _generation) {
        _loadingMore = false;
        _notify();
      }
    }
  }

  /// Marks one notification read. Returns an error message when the server
  /// refused, otherwise null.
  Future<String?> markRead(AppNotification notification) async {
    if (notification.isRead) return null;
    try {
      await _repository.markNotificationRead(notification.id);
      if (_disposed) return null;
      _items = [
        for (final item in _items)
          item.id == notification.id ? item.copyWith(isRead: true) : item,
      ];
      if (_unread > 0) _unread -= 1;
      _notify();
      return null;
    } on ApiException catch (error) {
      return error.message;
    }
  }

  Future<String?> markAllRead() async {
    if (_busy || _unread == 0) return null;
    _busy = true;
    _notify();
    try {
      await _repository.markAllNotificationsRead();
      if (_disposed) return null;
      _items = [for (final item in _items) item.copyWith(isRead: true)];
      _unread = 0;
      return null;
    } on ApiException catch (error) {
      return error.message;
    } finally {
      if (!_disposed) {
        _busy = false;
        _notify();
      }
    }
  }

  Future<String?> remove(AppNotification notification) async {
    try {
      await _repository.deleteNotification(notification.id);
      if (_disposed) return null;
      _items = _items
          .where((item) => item.id != notification.id)
          .toList(growable: false);
      if (!notification.isRead && _unread > 0) _unread -= 1;
      if (_pagination.total > 0) {
        _pagination = Pagination(
          page: _pagination.page,
          limit: _pagination.limit,
          pages: _pagination.pages,
          total: _pagination.total - 1,
        );
      }
      _notify();
      return null;
    } on ApiException catch (error) {
      return error.message;
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

final notificationsProvider = Provider.autoDispose<NotificationsController>((
  ref,
) {
  final controller = NotificationsController(
    ref.watch(shopperRepositoryProvider),
  );
  controller.loadInitial();
  ref.onDispose(controller.dispose);
  return controller;
});
