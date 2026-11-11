import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../data/repository.dart';
import '../../providers.dart';

enum InboxKind { job, direct, store }

/// One row in the Messages inbox. [routeId] is the booking id for job chats,
/// and the conversation id for direct provider and shop chats, matching the
/// server routes behind each kind.
class InboxItem {
  const InboxItem({
    required this.kind,
    required this.routeId,
    required this.name,
    required this.contextLabel,
    this.image,
    this.preview = '',
    this.lastMessageAt,
    this.lastSenderRole = '',
    this.unread = 0,
  });

  final InboxKind kind;
  final String routeId;
  final String name;
  final String? image;
  final String contextLabel;
  final String preview;
  final DateTime? lastMessageAt;
  final String lastSenderRole;
  final int unread;
}

/// The shopper's conversations in one inbox: threads attached to a booking,
/// direct threads with a provider, and product threads with a shop. Every list
/// comes from a customer-scoped server endpoint, so nothing from another
/// shopper can appear here.
class MessagesController extends ChangeNotifier {
  MessagesController(this._repository);

  final ShopperRepository _repository;

  List<InboxItem> _items = const <InboxItem>[];
  bool _loading = true;
  bool _refreshing = false;
  String? _error;
  bool _disposed = false;

  List<InboxItem> get items => _items;
  bool get loading => _loading;
  String? get error => _error;
  int get totalUnread => _items.fold(0, (total, item) => total + item.unread);
  int get jobCount => _items.where((item) => item.kind == InboxKind.job).length;
  int get directCount =>
      _items.where((item) => item.kind == InboxKind.direct).length;
  int get storeCount =>
      _items.where((item) => item.kind == InboxKind.store).length;

  Future<void> loadInitial() => _load();

  Future<void> refresh() => _load();

  Future<void> _load() async {
    if (_refreshing) return;
    _refreshing = true;
    if (_items.isEmpty) {
      _loading = true;
      _notify();
    }
    try {
      final jobsFuture = _repository.bookingChats(limit: 30);
      final directFuture = _repository.directChats(limit: 30);
      final storesFuture = _repository.storeChats(limit: 30);
      final jobs = await jobsFuture;
      final directs = await directFuture;
      final stores = await storesFuture;
      if (_disposed) return;
      _items = _combine(jobs.items, directs.items, stores.items);
      _error = null;
    } on ApiException catch (error) {
      if (_disposed) return;
      _error = error.message;
    } catch (_) {
      if (_disposed) return;
      _error = 'We could not load your messages. Check your connection.';
    } finally {
      if (!_disposed) {
        _refreshing = false;
        _loading = false;
        _notify();
      }
    }
  }

  List<InboxItem> _combine(
    List<ServiceChatConversation> jobs,
    List<DirectChatConversation> directs,
    List<StoreChatConversation> stores,
  ) {
    final items = <InboxItem>[
      for (final job in jobs)
        if (job.bookingId.isNotEmpty)
          InboxItem(
            kind: InboxKind.job,
            routeId: job.bookingId,
            name: job.withName,
            image: job.withImage,
            contextLabel: job.serviceTitle.isEmpty
                ? 'Booking chat'
                : job.serviceTitle,
            preview: job.lastMessagePreview,
            lastMessageAt: job.lastMessageAt,
            lastSenderRole: job.lastSenderRole,
            unread: job.unread,
          ),
      for (final direct in directs)
        if (direct.id.isNotEmpty)
          InboxItem(
            kind: InboxKind.direct,
            routeId: direct.id,
            name: direct.withName,
            image: direct.withImage,
            contextLabel: 'Direct chat',
            preview: direct.lastMessagePreview,
            lastMessageAt: direct.lastMessageAt,
            lastSenderRole: direct.lastSenderRole,
            unread: direct.unread,
          ),
      for (final store in stores)
        if (store.id.isNotEmpty)
          InboxItem(
            kind: InboxKind.store,
            routeId: store.id,
            name: store.withName,
            image: store.withImage,
            contextLabel: 'About a product',
            preview: store.lastMessagePreview,
            lastMessageAt: store.lastMessageAt,
            lastSenderRole: store.lastSenderRole,
            unread: store.unread,
          ),
    ];
    items.sort((a, b) {
      final left = a.lastMessageAt;
      final right = b.lastMessageAt;
      if (left != null && right != null && left != right) {
        return right.compareTo(left);
      }
      if (left == null && right != null) return 1;
      if (left != null && right == null) return -1;
      return a.name.compareTo(b.name);
    });
    return List.unmodifiable(items);
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

final messagesProvider = Provider.autoDispose<MessagesController>((ref) {
  final controller = MessagesController(ref.watch(shopperRepositoryProvider));
  controller.loadInitial();
  ref.onDispose(controller.dispose);
  return controller;
});
