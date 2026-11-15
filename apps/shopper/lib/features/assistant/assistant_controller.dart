import 'package:flutter/foundation.dart';

import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../data/repository.dart';

/// The two assistants share one screen (docs/29 Phase 2a and 2b) and one
/// server-provided card format each.
enum AssistantMode { shop, orders }

/// One bubble in the assistant thread: the shopper's question or its answer.
class AssistantTurn {
  const AssistantTurn({
    required this.text,
    required this.isQuestion,
    this.products = const <ProductSummary>[],
    this.orders = const <AssistantOrder>[],
    this.degraded = false,
  });

  const AssistantTurn.question(String text)
    : this(text: text, isQuestion: true);

  final String text;
  final bool isQuestion;
  final List<ProductSummary> products;
  final List<AssistantOrder> orders;

  /// True when the model was unavailable and the server answered with a plain
  /// search (or the customer's latest orders) instead.
  final bool degraded;
}

/// Holds the conversation with the assistant. It never builds cards itself:
/// every card arrives in the server's answer, which in turn only contains rows
/// the server's own tools read for this customer.
class AssistantController extends ChangeNotifier {
  AssistantController(this._repository, this._area);

  final ShopperRepository _repository;
  final AreaSelection? _area;

  final List<AssistantTurn> _turns = [];
  AssistantMode _mode = AssistantMode.shop;
  bool _sending = false;
  String? _error;
  String? _failedQuestion;

  List<AssistantTurn> get turns => List.unmodifiable(_turns);
  AssistantMode get mode => _mode;
  bool get sending => _sending;
  String? get error => _error;
  bool get hasFailed => _failedQuestion != null;

  /// Switching mode starts a new thread, so a product answer never sits under
  /// a question asked in the orders mode.
  void setMode(AssistantMode mode) {
    if (mode == _mode || _sending) return;
    _mode = mode;
    _turns.clear();
    _error = null;
    _failedQuestion = null;
    notifyListeners();
  }

  Future<void> send(String raw) async {
    final question = raw.trim();
    if (question.isEmpty || _sending) return;
    _turns.add(AssistantTurn.question(question));
    await _ask(question);
  }

  /// Re-asks the question that failed without adding it to the thread twice.
  Future<void> retry() async {
    final question = _failedQuestion;
    if (question == null || _sending) return;
    await _ask(question);
  }

  Future<void> _ask(String question) async {
    _sending = true;
    _error = null;
    _failedQuestion = null;
    notifyListeners();

    try {
      if (_mode == AssistantMode.orders) {
        final reply = await _repository.askOrderHelper(message: question);
        _turns.add(
          AssistantTurn(
            text: reply.reply ?? 'Here are your latest orders.',
            isQuestion: false,
            orders: reply.orders,
            degraded: reply.degraded,
          ),
        );
      } else {
        final area = _area;
        final reply = await _repository.askShopAssistant(
          message: question,
          cityId: area?.cityId,
          latitude: area?.latitude,
          longitude: area?.longitude,
        );
        _turns.add(
          AssistantTurn(
            text: reply.reply ?? 'Here is what I found in the shops near you.',
            isQuestion: false,
            products: reply.products,
            degraded: reply.degraded,
          ),
        );
      }
    } on ApiException catch (error) {
      _error = error.message;
      _failedQuestion = question;
    } catch (_) {
      _error = 'The assistant could not answer just now. Check the connection.';
      _failedQuestion = question;
    } finally {
      _sending = false;
      notifyListeners();
    }
  }
}
