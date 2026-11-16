import 'package:flutter/material.dart';

import '../../core/format.dart';
import '../../core/status.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/models.dart';

/// The money record as the brand sees it, including a door collection that is
/// still waiting for a proof check. A non-cash attempt keeps its payment
/// PENDING and its delivery on hold until someone decides, so the state (and
/// the photo) must be reachable from the order and delivery screens too, not
/// only from the money queue.
class DoorPaymentDetails extends StatelessWidget {
  const DoorPaymentDetails({
    super.key,
    required this.payment,
    this.onReviewProof,
    this.paymentsManage = false,
    this.showAmount = true,
    this.heading = 'Payment',
  });

  final PaymentRecord payment;
  final VoidCallback? onReviewProof;
  final bool paymentsManage;
  final bool showAmount;
  final String heading;

  bool get _held => payment.awaitingCheck;

  bool get _windowClosed => payment.confirmationWindowClosed;

  int? get _secondsLeft {
    final deadline = payment.collectionConfirmBy;
    if (deadline == null) return null;
    return deadline.difference(DateTime.now()).inSeconds;
  }

  String get _methodLabel {
    if (payment.isCashCollection) return 'Cash at the door';
    if (payment.collectionWallet != null) {
      return friendlyWallet(payment.collectionWallet);
    }
    final method = payment.collectionMethod ?? payment.method;
    if (method == null) return '';
    return friendlyCollectionMethod(method);
  }

  String get _stateLabel {
    if (payment.awaitingCheck) return 'Waiting for a check';
    if (payment.checkVerified) return 'Checked';
    if (payment.checkRejected) return 'Rejected';
    if (payment.status == 'PAID') {
      return payment.isCashCollection ? 'Paid in cash' : 'Paid';
    }
    if (payment.status == 'PENDING' && !payment.hasCollection) {
      return 'Not collected';
    }
    return friendlyPayment(payment.status);
  }

  StatusTone get _stateTone {
    if (payment.verification != null) {
      return toneForVerification(payment.verification!);
    }
    return toneForPayment(payment.status);
  }

  String? get _hint {
    if (_held && _windowClosed) {
      return 'The five-minute check window closed, so the rider will be asked '
          'to collect again.';
    }
    if (_held) {
      return 'Verifying marks the order paid and completes the delivery. '
          'Leaving it means the rider collects again.';
    }
    if (payment.checkVerified) {
      return 'This check marked the order paid and completed the delivery.';
    }
    if (payment.checkRejected) {
      return payment.collectionExpiredAt != null
          ? 'No one checked this in time, so the rider was asked to collect '
                'again.'
          : 'A teammate rejected this proof, so the rider was asked to collect '
                'again.';
    }
    if (payment.status == 'PAID' && payment.isCashCollection) {
      return 'Cash given at the door stays with the rider until it is handed '
          'over.';
    }
    if (payment.status == 'PENDING' && !payment.hasCollection) {
      return 'The customer pays when the parcel arrives.';
    }
    return null;
  }

  Color get _hintBackground {
    if (_held && !_windowClosed) return AppColors.amber;
    if (payment.checkVerified) return AppColors.sage;
    if (_held || payment.checkRejected) return AppColors.claySoft;
    return AppColors.surfaceMuted;
  }

  Color get _hintForeground {
    if (_held && !_windowClosed) return AppColors.amberInk;
    if (payment.checkVerified) return AppColors.sageInk;
    if (_held || payment.checkRejected) return AppColors.clay;
    return AppColors.muted;
  }

  @override
  Widget build(BuildContext context) {
    final hint = _hint;
    final secondsLeft = _secondsLeft;
    final canReview =
        _held && !_windowClosed && paymentsManage && onReviewProof != null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(child: SectionLabel(heading)),
            const SizedBox(width: 8),
            Flexible(
              child: StatusPill(
                text: _stateLabel,
                tone: _stateTone,
                compact: true,
              ),
            ),
          ],
        ),
        if (showAmount) ...[
          const SizedBox(height: 8),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: MoneyText(
              formatMoney(payment.amount, currency: payment.currency),
              size: 22,
              align: TextAlign.left,
            ),
          ),
        ],
        const SizedBox(height: 9),
        Wrap(
          spacing: 7,
          runSpacing: 7,
          children: [
            if (_methodLabel.isNotEmpty)
              Pill(
                text: _methodLabel,
                background: AppColors.surfaceMuted,
                foreground: AppColors.inkSoft,
                icon: Icons.account_balance_wallet_outlined,
              ),
            if (payment.collectionReference != null)
              Pill(
                text: payment.collectionReference!,
                background: AppColors.surfaceMuted,
                foreground: AppColors.inkSoft,
                icon: Icons.tag_rounded,
              ),
            if (_held && !_windowClosed)
              const Pill(
                text: 'Delivery held',
                background: AppColors.claySoft,
                foreground: AppColors.clay,
                icon: Icons.pause_circle_outline_rounded,
              ),
            if (_held && _windowClosed)
              const Pill(
                text: 'Window closed',
                background: AppColors.claySoft,
                foreground: AppColors.clay,
                icon: Icons.timer_off_outlined,
              ),
            if (payment.collectionSubmittedAt != null)
              Pill(
                text: 'Sent ${formatAge(payment.collectionSubmittedAt)}',
                background: AppColors.paperDeep,
                foreground: AppColors.muted,
              ),
            if (payment.collectionVerifiedAt != null)
              Pill(
                text: 'Checked ${formatAge(payment.collectionVerifiedAt)}',
                background: AppColors.sage,
                foreground: AppColors.sageInk,
                icon: Icons.fact_check_outlined,
              ),
            if (payment.collectionExpiredAt != null)
              Pill(
                text: 'Timed out ${formatAge(payment.collectionExpiredAt)}',
                background: AppColors.claySoft,
                foreground: AppColors.clay,
                icon: Icons.timer_off_outlined,
              ),
            if (payment.isCashCollection && payment.paidAt != null)
              Pill(
                text: 'Collected ${formatAge(payment.paidAt)}',
                background: AppColors.sage,
                foreground: AppColors.sageInk,
              ),
          ],
        ),
        if (_held && !_windowClosed && secondsLeft != null) ...[
          const SizedBox(height: 10),
          CountdownLine(
            secondsLeft: secondsLeft,
            color: AppColors.amberInk,
            prefix: 'Confirm within ',
            zeroText: 'The check window has closed',
          ),
        ],
        if (hint != null) ...[
          const SizedBox(height: 10),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
            decoration: BoxDecoration(
              color: _hintBackground,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              hint,
              style: TextStyle(
                fontSize: 12.5,
                height: 1.35,
                fontWeight: FontWeight.w600,
                color: _hintForeground,
              ),
            ),
          ),
        ],
        if (payment.collectionNote != null &&
            payment.collectionNote!.trim().isNotEmpty) ...[
          const SizedBox(height: 8),
          Text(
            'Note: ${payment.collectionNote!.trim()}',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
        if (canReview) ...[
          const SizedBox(height: 12),
          AppButton(
            label: 'Review proof',
            icon: Icons.fact_check_outlined,
            height: 48,
            onPressed: onReviewProof,
          ),
        ],
        if (_held && !_windowClosed && !paymentsManage) ...[
          const SizedBox(height: 8),
          Text(
            'Checking a payment needs payment management access.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ],
    );
  }
}
