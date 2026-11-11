import 'package:flutter/foundation.dart';

import '../../data/api_exception.dart';
import '../../data/models.dart';

typedef PageLoader<T> = Future<Page<T>> Function(int page);

/// Load, refresh and "load more" for every paged staff list. Each screen owns
/// one and rebuilds when it changes.
class PagedController<T> extends ChangeNotifier {
  PagedController(this._loader);

  final PageLoader<T> _loader;

  List<T> items = const [];
  Pagination pagination = const Pagination();
  bool loading = false;
  bool loadingMore = false;
  String? error;

  bool get hasMore => pagination.hasMore;

  Future<void> load() async {
    if (loading) return;
    loading = true;
    error = null;
    notifyListeners();
    try {
      final page = await _loader(1);
      items = page.items;
      pagination = page.pagination;
    } catch (error) {
      this.error = messageFor(error);
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> refresh() async {
    error = null;
    try {
      final page = await _loader(1);
      items = page.items;
      pagination = page.pagination;
    } catch (error) {
      this.error = messageFor(error);
    }
    notifyListeners();
  }

  Future<void> loadMore() async {
    if (loadingMore || !hasMore) return;
    loadingMore = true;
    notifyListeners();
    try {
      final page = await _loader(pagination.page + 1);
      items = [...items, ...page.items];
      pagination = page.pagination;
    } catch (error) {
      this.error = messageFor(error);
    } finally {
      loadingMore = false;
      notifyListeners();
    }
  }

  static String messageFor(Object error) => error is ApiException
      ? error.message
      : 'Something went wrong. Pull down to try again.';
}
