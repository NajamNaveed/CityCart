import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models.dart';
import '../../providers.dart';

final orderDetailProvider = FutureProvider.autoDispose
    .family<OrderDetail, String>((ref, orderId) {
      return ref.watch(shopperRepositoryProvider).order(orderId);
    });

/// Fetching the code is itself the check: the server refuses it before the
/// order is on its way, so the screen only asks when the status allows it.
final deliveryCodeProvider = FutureProvider.autoDispose.family<String, String>((
  ref,
  deliveryId,
) {
  return ref.watch(shopperRepositoryProvider).deliveryCode(deliveryId);
});

final receiptProvider = FutureProvider.autoDispose.family<OrderReceipt, String>(
  (ref, orderId) {
    return ref.watch(shopperRepositoryProvider).receiptForOrder(orderId);
  },
);

/// This shopper's reviews, optionally only those written for one order.
final myReviewsProvider = FutureProvider.autoDispose
    .family<List<MyReview>, String?>((ref, orderId) {
      return ref.watch(shopperRepositoryProvider).myReviews(orderId: orderId);
    });
