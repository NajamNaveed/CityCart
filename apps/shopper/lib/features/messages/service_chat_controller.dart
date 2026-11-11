import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../data/repository.dart';
import '../../providers.dart';

enum ServiceChatKind { job, direct }

/// One service conversation. Job chats are addressed by booking id and direct
/// chats by conversation id, so the two endpoints stay separate while the
/// screen and message handling stay the same.
class ServiceChatController extends ChangeNotifier {
  ServiceChatController(this._repository, this.kind, this.id);

  final ShopperRepository _repository;
  final ServiceChatKind kind;
  final String id;

  final List<ChatMessage> _messages = [];
  bool _loading = true;
  bool _loadingOlder = false;
  bool _sending = false;
  bool _hasMore = false;
  String? _error;
  bool _disposed = false;

  List<ChatMessage> get messages => List.unmodifiable(_messages);
  bool get loading => _loading;
  bool get loadingOlder => _loadingOlder;
  bool get sending => _sending;
  bool get hasMore => _hasMore;
  String? get error => _error;

  Future<ChatMessagePage> _fetch({String? before}) {
    if (kind == ServiceChatKind.job) {
      return _repository.bookingChatMessages(id, before: before);
    }
    return _repository.directChatMessages(id, before: before);
  }

  Future<void> _markRead() async {
    try {
      if (kind == ServiceChatKind.job) {
        await _repository.markBookingChatRead(id);
      } else {
        await _repository.markDirectChatRead(id);
      }
    } catch (_) {
      // Reading is retried by the next poll or refresh.
    }
  }

  Future<void> loadInitial() async {
    _loading = true;
    _error = null;
    _notify();
    try {
      final page = await _fetch();
      _messages
        ..clear()
        ..addAll(page.messages);
      _hasMore = page.hasMore;
      _error = null;
      unawaited(_markRead());
    } on ApiException catch (error) {
      _error = error.message;
    } catch (_) {
      _error = 'We could not open this conversation.';
    } finally {
      _loading = false;
      _notify();
    }
  }

  Future<void> refreshLatest({bool silent = false}) async {
    if (_loading) return;
    try {
      final page = await _fetch();
      if (_disposed) return;
      _merge(page.messages);
      _hasMore = _hasMore || page.hasMore;
      _error = null;
      unawaited(_markRead());
      _notify();
    } catch (_) {
      if (!silent) {
        _error = 'We could not refresh the messages.';
        _notify();
      }
    }
  }

  Future<void> loadOlder() async {
    if (_loadingOlder || !_hasMore || _messages.isEmpty) return;
    _loadingOlder = true;
    _notify();
    try {
      final page = await _fetch(before: _messages.first.id);
      if (_disposed) return;
      _messages.insertAll(0, page.messages);
      _hasMore = page.hasMore;
    } on ApiException catch (error) {
      _error = error.message;
    } catch (_) {
      _error = 'We could not load earlier messages.';
    } finally {
      _loadingOlder = false;
      _notify();
    }
  }

  /// Returns an error message for the composer, or null when the message went.
  Future<String?> send(String body) async {
    final text = body.trim();
    if (text.isEmpty || _sending || text.length > 1000) return null;
    _sending = true;
    _notify();
    try {
      final message = kind == ServiceChatKind.job
          ? await _repository.sendBookingChatMessage(id, text)
          : await _repository.sendDirectChatMessage(id, text);
      if (_disposed) return null;
      _merge([message]);
      _error = null;
      return null;
    } on ApiException catch (error) {
      return error.message;
    } catch (_) {
      return 'The message did not send. Try again.';
    } finally {
      _sending = false;
      _notify();
    }
  }

  void _merge(List<ChatMessage> incoming) {
    final byId = <String, ChatMessage>{
      for (final message in _messages)
        if (message.id.isNotEmpty) message.id: message,
    };
    for (final message in incoming) {
      if (message.id.isNotEmpty) byId[message.id] = message;
    }
    final merged = byId.values.toList()
      ..sort((a, b) {
        final left = a.createdAt;
        final right = b.createdAt;
        if (left != null && right != null && left != right) {
          return left.compareTo(right);
        }
        return a.id.compareTo(b.id);
      });
    _messages
      ..clear()
      ..addAll(merged);
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

final bookingChatProvider = Provider.autoDispose
    .family<ServiceChatController, String>((ref, bookingId) {
      final controller = ServiceChatController(
        ref.watch(shopperRepositoryProvider),
        ServiceChatKind.job,
        bookingId,
      );
      controller.loadInitial();
      ref.onDispose(controller.dispose);
      return controller;
    });

final directChatProvider = Provider.autoDispose
    .family<ServiceChatController, String>((ref, conversationId) {
      final controller = ServiceChatController(
        ref.watch(shopperRepositoryProvider),
        ServiceChatKind.direct,
        conversationId,
      );
      controller.loadInitial();
      ref.onDispose(controller.dispose);
      return controller;
    });
