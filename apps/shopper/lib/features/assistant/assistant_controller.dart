import 'package:flutter/foundation.dart';

import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../data/repository.dart';

/// One bubble in the assistant thread: the shopper's question or its answer.
class AssistantTurn {
  const AssistantTurn({
    required this.text,
    required this.isQuestion,
    this.products = const <ProductSummary>[],
    this.degraded = false,
  });

  const AssistantTurn.question(String text)
    : this(text: text, isQuestion: true);

  final String text;
  final bool isQuestion;
  final List<ProductSummary> products;

  /// True when the model was unavailable and the server answered with a plain
  /// product search instead.
  final bool degraded;
}

/// Holds the conversation with the shopping assistant. It never builds product
/// cards itself: every card arrives in the server's answer, which in turn only
/// contains products the server's own tools found.
class AssistantController extends ChangeNotifier {
  AssistantController(this._repository, this._area);

  final ShopperRepository _repository;
  final AreaSelection? _area;

  final List<AssistantTurn> _turns = [];
  bool _sending = false;
  String? _error;
  String? _failedQuestion;

  List<AssistantTurn> get turns => List.unmodifiable(_turns);
  bool get sending => _sending;
  String? get error => _error;
  bool get hasFailed => _failedQuestion != null;

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

    final area = _area;
    try {
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
