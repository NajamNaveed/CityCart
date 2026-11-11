import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../data/repository.dart';
import '../../providers.dart';

/// The server-side cart. Every write returns the fresh cart, so the screen and
/// the tab badge always show exactly what the backend has. One write at a time
/// keeps quantity taps from racing each other.
class CartController extends ChangeNotifier {
  CartController(this._repository);

  final ShopperRepository _repository;

  CartView _cart = const CartView();
  bool _loading = false;
  bool _loaded = false;
  String? _error;
  String? _busyProductId;
  bool _clearing = false;
  int _version = 0;
  bool _disposed = false;

  CartView get cart => _cart;
  bool get loading => _loading;
  bool get loaded => _loaded;
  String? get error => _error;
  int get itemCount => _cart.itemCount;
  int get shopCount => _cart.groups.length;
  bool get hasIssues => _cart.hasIssues;
  bool get isEmpty => _cart.isEmpty;
  String? get busyProductId => _busyProductId;
  bool get busy => _busyProductId != null || _clearing;
  bool get clearing => _clearing;

  Future<void> load() async {
    if (_loading) return;
    final version = _version;
    _loading = true;
    _error = null;
    _notify();
    try {
      final fresh = await _repository.cart();
      if (_disposed || version != _version) return;
      _cart = fresh;
      _loaded = true;
      _error = null;
    } on ApiException catch (error) {
      if (_disposed || version != _version) return;
      _error = error.message;
    } catch (_) {
      if (_disposed || version != _version) return;
      _error = 'We could not open your basket. Check your connection.';
    } finally {
      if (!_disposed && version == _version) {
        _loading = false;
        _notify();
      }
    }
  }

  /// Adds [quantity] of one product. Returns an error for a snackbar, or null.
  Future<String?> add(String productId, {int quantity = 1}) {
    return _write(
      productId,
      () => _repository.addToCart(productId, quantity: quantity),
    );
  }

  Future<String?> setQuantity(String productId, int quantity) {
    return _write(
      productId,
      () => _repository.updateCartItem(productId, quantity),
    );
  }

  Future<String?> remove(String productId) {
    return _write(productId, () => _repository.removeCartItem(productId));
  }

  Future<String?> clear() async {
    if (clearing) return null;
    _clearing = true;
    _notify();
    try {
      final fresh = await _repository.clearCart();
      if (_disposed) return null;
      _version++;
      _cart = fresh;
      _loaded = true;
      _error = null;
      return null;
    } on ApiException catch (error) {
      return error.message;
    } catch (_) {
      return 'The basket could not be cleared. Try again.';
    } finally {
      if (!_disposed) {
        _clearing = false;
        _notify();
      }
    }
  }

  /// Which lines survive in another shop area. Null means the check itself
  /// failed and the shopper should not be interrupted with a guess.
  Future<CartAreaCheck?> checkArea(List<String> blockIds) async {
    if (blockIds.isEmpty) return null;
    try {
      return await _repository.checkCartArea(blockIds);
    } catch (_) {
      return null;
    }
  }

  Future<String?> _write(
    String productId,
    Future<CartView> Function() request,
  ) async {
    if (busy) return null;
    _busyProductId = productId;
    _notify();
    try {
      final fresh = await request();
      if (_disposed) return null;
      _version++;
      _cart = fresh;
      _loaded = true;
      _error = null;
      return null;
    } on ApiException catch (error) {
      return error.message;
    } catch (_) {
      return 'Your basket did not update. Try again.';
    } finally {
      if (!_disposed) {
        _busyProductId = null;
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

final cartProvider = Provider<CartController>((ref) {
  final controller = CartController(ref.watch(shopperRepositoryProvider));
  controller.load();
  ref.onDispose(controller.dispose);
  return controller;
});
