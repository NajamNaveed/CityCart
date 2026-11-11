import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../data/repository.dart';
import '../../providers.dart';

/// One product-chat thread. Messages are kept oldest-first for rendering, and
/// a poll merges the newest page without losing anything already loaded.
class ChatThreadController extends ChangeNotifier {
  ChatThreadController(this._repository, this.conversationId);

  final ShopperRepository _repository;
  final String conversationId;

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

  Future<void> loadInitial() async {
    _loading = true;
    _error = null;
    _notify();
    try {
      final page = await _repository.chatMessages(conversationId);
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
      final page = await _repository.chatMessages(conversationId);
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
      final page = await _repository.chatMessages(
        conversationId,
        before: _messages.first.id,
      );
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
    if (text.isEmpty || _sending) return null;
    _sending = true;
    _notify();
    try {
      final message = await _repository.sendChatMessage(conversationId, text);
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

  Future<void> _markRead() async {
    try {
      await _repository.markChatRead(conversationId);
    } catch (_) {
      // The next refresh retries; reading is not worth an error banner.
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

final chatThreadProvider = Provider.autoDispose
    .family<ChatThreadController, String>((ref, conversationId) {
      final controller = ChatThreadController(
        ref.watch(shopperRepositoryProvider),
        conversationId,
      );
      controller.loadInitial();
      ref.onDispose(controller.dispose);
      return controller;
    });
