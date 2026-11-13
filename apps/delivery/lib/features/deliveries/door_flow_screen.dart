import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/format.dart';
import '../../core/status.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../providers.dart';
import 'delivery_rules.dart';
import 'payment_capture.dart';

/// One calm path through the hardest moment of the job: the door.
///
/// Code first, then the items (nothing comes back unless the rider changes it),
/// then money only when there is money to take, then one review. Every value
/// the server checks is repeated here only to explain it, never to decide it.
class DoorFlowScreen extends ConsumerStatefulWidget {
  const DoorFlowScreen({super.key, required this.deliveryId});

  final String deliveryId;

  @override
  ConsumerState<DoorFlowScreen> createState() => _DoorFlowScreenState();
}

enum _Step { code, items, payment, review }

class _DoorFlowScreenState extends ConsumerState<DoorFlowScreen> {
  RiderDelivery? _delivery;
  bool _loading = true;
  String? _loadError;

  int _index = 0;
  final _code = TextEditingController();
  List<DoorLine> _lines = const [];
  DoorPayment _payment = const DoorPayment();

  bool _busy = false;
  bool _codeLocked = false;
  String? _error;
  int? _attemptsRemaining;

  bool _finished = false;
  bool _paymentHeld = false;
  double _finalAmount = 0;
  Timer? _pollTimer;

  bool get _waitingForStore =>
      _paymentHeld || _delivery?.paymentPending == true;

  @override
  void initState() {
    super.initState();
    _load();
    // The store confirms while the rider waits. Polling keeps the held screen
    // current without a realtime connection (docs/10 §31.3).
    _pollTimer = Timer.periodic(const Duration(seconds: 5), (_) {
      if (_waitingForStore && !_busy) _refreshStatus();
    });
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _code.dispose();
    super.dispose();
  }

  Future<void> _refreshStatus() async {
    try {
      final updated = await ref
          .read(deliveryRepositoryProvider)
          .get(widget.deliveryId);
      if (!mounted) return;
      setState(() {
        _delivery = updated;
        if (updated.paymentPending) return;
        _paymentHeld = false;
        // A timeout keeps the job open so the rider can collect again.
        if (updated.paymentRejected) _finished = false;
      });
    } catch (_) {
      // Keep the current screen; the next tick tries again.
    }
  }

  Future<void> _load() async {
    setState(() {
      _loading = _delivery == null;
      _loadError = null;
    });
    try {
      final delivery = await ref
          .read(deliveryRepositoryProvider)
          .get(widget.deliveryId);
      if (!mounted) return;
      setState(() {
        _delivery = delivery;
        if (_lines.isEmpty) _lines = doorLinesFrom(delivery);
        _loading = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _loadError = error.message;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loadError = 'This job could not be loaded. Check your connection and try again.';
        _loading = false;
      });
    }
  }

  bool get _needsPayment {
    final delivery = _delivery;
    if (delivery == null) return false;
    return estimateCompletion(_lines, delivery).netTotal > 0;
  }

  List<_Step> get _steps => [
    _Step.code,
    if (_lines.isNotEmpty) _Step.items,
    if (_needsPayment) _Step.payment,
    _Step.review,
  ];

  _Step get _step {
    final steps = _steps;
    return steps[_index.clamp(0, steps.length - 1)];
  }

  bool get _isLastStep => _index >= _steps.length - 1;

  bool get _canContinue => switch (_step) {
    _Step.code => _code.text.length == 6 && !_codeLocked,
    _Step.items => doorLinesReady(_lines),
    _Step.payment => paymentReady(_payment) && !_payment.busy,
    _Step.review => !_busy,
  };

  void _next() {
    if (!_canContinue) return;
    FocusScope.of(context).unfocus();
    if (_isLastStep) {
      _finish();
      return;
    }
    setState(() {
      _index += 1;
      _error = null;
    });
  }

  void _back() {
    if (_busy) return;
    FocusScope.of(context).unfocus();
    if (_index == 0) {
      Navigator.of(context).maybePop();
      return;
    }
    setState(() {
      _index -= 1;
      _error = null;
    });
  }

  void _replaceLine(DoorLine updated) {
    setState(() {
      _lines = _lines
          .map((line) => line.itemId == updated.itemId ? updated : line)
          .toList(growable: false);
    });
  }

  Future<void> _finish() async {
    final delivery = _delivery;
    if (delivery == null || _busy) return;
    FocusScope.of(context).unfocus();

    setState(() {
      _busy = true;
      _error = null;
    });

    // Captured before completing: once the payment is held the server stops
    // reporting the amount to collect.
    final amount = _needsPayment
        ? estimateCompletion(_lines, delivery).netTotal
        : 0.0;

    try {
      final updated = await ref
          .read(deliveryRepositoryProvider)
          .complete(
            id: delivery.id,
            code: _code.text.trim(),
            collection: _needsPayment ? collectionPayload(_payment) : null,
            lines: anyRejected(_lines) ? linesPayload(_lines) : null,
          );
      if (!mounted) return;
      setState(() {
        _delivery = updated;
        _finished = true;
        _paymentHeld = updated.paymentPending;
        _finalAmount = amount;
        _busy = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
        _attemptsRemaining = error.attemptsRemaining;
        _busy = false;
        if (error.code == 'CODE_LOCKED') _codeLocked = true;
        if (error.code == 'INVALID_CODE' || error.code == 'CODE_LOCKED') {
          _index = 0;
        }
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'The delivery was not finished. Check your connection and try again.';
        _busy = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final delivery = _delivery;

    if (_loading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator(color: AppColors.forest)),
      );
    }
    if (delivery == null) {
      return Scaffold(
        body: SafeArea(
          child: Column(
            children: [
              ScreenTopBar(
                title: 'Complete delivery',
                onBack: () => Navigator.of(context).maybePop(),
              ),
              Expanded(
                child: EmptyState(
                  icon: Icons.cloud_off_rounded,
                  title: 'Could not load this job',
                  message: _loadError ?? 'Check your connection and try again.',
                  action: AppButton(
                    label: 'Try again',
                    variant: AppButtonVariant.outline,
                    expand: false,
                    height: 48,
                    onPressed: _load,
                  ),
                ),
              ),
            ],
          ),
        ),
      );
    }
    if (_finished) {
      return _SuccessView(
        delivery: _delivery!,
        amount: _finalAmount,
        held: _paymentHeld,
        secondsLeft: _delivery!.paymentSecondsLeft,
        onDone: () => context.go('/today'),
      );
    }
    if (delivery.paymentPending) {
      return _BlockedView(
        title: 'Payment with the store',
        message:
            'The store is checking the payment you sent. It must confirm within 5 minutes. '
            'This screen updates by itself and the job closes when they approve it.',
        secondsLeft: delivery.paymentSecondsLeft,
        onBack: () => Navigator.of(context).maybePop(),
      );
    }
    if (delivery.paymentRejected) {
      return _BlockedView(
        title: delivery.paymentExpired
            ? 'Confirmation timed out'
            : 'Collect the payment again',
        message: delivery.paymentExpired
            ? 'The store did not confirm the payment in time. Go back and tap '
                  '"Collect payment again", or take cash from the customer.'
            : 'The store could not verify the last payment. Open the job and tap '
                  '"Collect payment again" before finishing it.',
        onBack: () => Navigator.of(context).maybePop(),
      );
    }
    if (delivery.status != 'OUT_FOR_DELIVERY') {
      return _BlockedView(
        title: friendlyStatus(delivery.status),
        message:
            'This job already moved on, so there is nothing to complete here. '
            'Open the job to see the next step.',
        onBack: () => Navigator.of(context).maybePop(),
      );
    }

    final step = _step;
    return PopScope(
      canPop: _index == 0,
      onPopInvokedWithResult: (didPop, result) {
        if (didPop) return;
        _back();
      },
      child: Scaffold(
        body: SafeArea(
          bottom: false,
          child: Column(
            children: [
              ScreenTopBar(
                title: delivery.orderNumber ?? 'Complete delivery',
                subtitle:
                    'Step ${_index + 1} of ${_steps.length} · ${_stepName(step)}',
                onBack: _back,
              ),
              _StepProgress(index: _index, count: _steps.length),
              Expanded(
                child: AnimatedSwitcher(
                  duration: const Duration(milliseconds: 220),
                  switchInCurve: Curves.easeOutCubic,
                  switchOutCurve: Curves.easeInCubic,
                  layoutBuilder: (currentChild, previousChildren) => Stack(
                    alignment: Alignment.topCenter,
                    children: [...previousChildren, ?currentChild],
                  ),
                  child: KeyedSubtree(
                    key: ValueKey(step),
                    child: SingleChildScrollView(
                      physics: const BouncingScrollPhysics(),
                      padding: const EdgeInsets.fromLTRB(20, 14, 20, 28),
                      child: switch (step) {
                        _Step.code => _CodeStep(
                          controller: _code,
                          error: _error,
                          attemptsRemaining: _attemptsRemaining,
                          codeLocked: _codeLocked,
                          onChanged: (value) => setState(() {
                            _error = null;
                            _attemptsRemaining = null;
                          }),
                          onSubmitted: _next,
                        ),
                        _Step.items => _ItemsStep(
                          delivery: delivery,
                          lines: _lines,
                          onChanged: _replaceLine,
                          uploadPhoto: (bytes, filename) => ref
                              .read(deliveryRepositoryProvider)
                              .uploadReturnPhoto(
                                deliveryId: delivery.id,
                                bytes: bytes,
                                filename: filename,
                              ),
                        ),
                        _Step.payment => _PaymentStep(
                          delivery: delivery,
                          amount: estimateCompletion(_lines, delivery).netTotal,
                          payment: _payment,
                          busy: _busy,
                          onChanged: (value) => setState(() {
                            _payment = value;
                            _error = null;
                          }),
                          uploadProof: (bytes, filename) => ref
                              .read(deliveryRepositoryProvider)
                              .uploadProofPhoto(
                                deliveryId: delivery.id,
                                bytes: bytes,
                                filename: filename,
                              ),
                        ),
                        _Step.review => _ReviewStep(
                          delivery: delivery,
                          code: _code.text,
                          lines: _lines,
                          payment: _payment,
                          needsPayment: _needsPayment,
                          error: _error,
                        ),
                      },
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        bottomNavigationBar: _Footer(
          label: _footerLabel(step),
          helper: _footerHelper(step),
          busy: _busy,
          enabled: _canContinue && !_busy,
          onPressed: _next,
        ),
      ),
    );
  }

  String _stepName(_Step step) => switch (step) {
    _Step.code => 'Customer code',
    _Step.items => 'The items',
    _Step.payment => 'Payment',
    _Step.review => 'Finish',
  };

  String _footerLabel(_Step step) => switch (step) {
    _Step.code => 'Continue',
    _Step.items => 'Continue',
    _Step.payment => 'Continue',
    _Step.review =>
      _needsPayment && !_payment.isCash
          ? 'Send payment and finish'
          : 'Finish delivery',
  };

  String? _footerHelper(_Step step) => switch (step) {
    _Step.code =>
      _codeLocked
          ? null
          : 'The customer sees this code in their CityCart account.',
    _Step.items =>
      doorLinesReady(_lines)
          ? 'Only the units you change here go back to the store.'
          : 'Choose a reason for every item that is coming back.',
    _Step.payment =>
      _payment.isCash
          ? 'Cash finishes this delivery right away.'
          : 'The store must confirm within 5 minutes.',
    _Step.review =>
      _needsPayment && !_payment.isCash
          ? 'The job stays open until the store confirms within 5 minutes.'
          : 'This marks the job delivered.',
  };
}

class _StepProgress extends StatelessWidget {
  const _StepProgress({required this.index, required this.count});

  final int index;
  final int count;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 4),
      child: Row(
        children: [
          for (var i = 0; i < count; i++)
            Expanded(
              child: Padding(
                padding: EdgeInsets.only(right: i == count - 1 ? 0 : 6),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 220),
                  height: 5,
                  decoration: BoxDecoration(
                    color: i <= index ? AppColors.forest : AppColors.lineStrong,
                    borderRadius: BorderRadius.circular(3),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _StepHeading extends StatelessWidget {
  const _StepHeading({required this.title, required this.message});

  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: Theme.of(context).textTheme.headlineMedium),
        const SizedBox(height: 8),
        Text(message, style: Theme.of(context).textTheme.bodyMedium),
      ],
    );
  }
}

class _CodeStep extends StatelessWidget {
  const _CodeStep({
    required this.controller,
    required this.error,
    required this.attemptsRemaining,
    required this.codeLocked,
    required this.onChanged,
    required this.onSubmitted,
  });

  final TextEditingController controller;
  final String? error;
  final int? attemptsRemaining;
  final bool codeLocked;
  final ValueChanged<String> onChanged;
  final VoidCallback onSubmitted;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _StepHeading(
          title: 'Ask the customer for their code',
          message:
              'The code has 6 digits. It is shown in the customer\'s CityCart account and proves '
              'the order reached the right person.',
        ),
        const SizedBox(height: 24),
        SurfaceCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SectionLabel('Delivery code'),
              const SizedBox(height: 12),
              TextField(
                controller: controller,
                autofocus: false,
                enabled: !codeLocked,
                keyboardType: TextInputType.number,
                textAlign: TextAlign.center,
                textInputAction: TextInputAction.done,
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(6),
                ],
                onChanged: onChanged,
                onSubmitted: (_) => onSubmitted(),
                style: const TextStyle(
                  fontSize: 32,
                  height: 1.1,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 10,
                  color: AppColors.ink,
                ),
                decoration: const InputDecoration(
                  hintText: '000000',
                  hintStyle: TextStyle(
                    fontSize: 32,
                    height: 1.1,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 10,
                    color: AppColors.lineStrong,
                  ),
                  contentPadding: EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 18,
                  ),
                ),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  const Icon(
                    Icons.lock_outline_rounded,
                    size: 15,
                    color: AppColors.muted,
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      'Never share this code with anyone else.',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        if (error != null) ...[
          const SizedBox(height: 14),
          ErrorNotice(message: error!),
        ] else if (attemptsRemaining != null) ...[
          const SizedBox(height: 14),
          Text(
            '${attemptsRemaining == 1 ? '1 try' : '$attemptsRemaining tries'} left before the store has to complete this job.',
            style: const TextStyle(
              fontSize: 12.5,
              height: 1.4,
              color: AppColors.clay,
            ),
          ),
        ],
        if (codeLocked) ...[
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.claySoft,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(
                  Icons.lock_clock_outlined,
                  size: 19,
                  color: AppColors.clay,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Too many wrong codes. Ask your store to complete this delivery from their dashboard. '
                    'The customer is still waiting, so let the store know now.',
                    style: const TextStyle(
                      fontSize: 13.5,
                      height: 1.45,
                      color: AppColors.clay,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
        const SizedBox(height: 18),
        Text(
          'No code? Go back and choose "Could not deliver this order" so the store knows what happened.',
          style: Theme.of(context).textTheme.bodySmall,
        ),
      ],
    );
  }
}

class _ItemsStep extends StatelessWidget {
  const _ItemsStep({
    required this.delivery,
    required this.lines,
    required this.onChanged,
    required this.uploadPhoto,
  });

  final RiderDelivery delivery;
  final List<DoorLine> lines;
  final ValueChanged<DoorLine> onChanged;
  final Future<UploadedPhoto> Function(Uint8List bytes, String filename)
  uploadPhoto;

  @override
  Widget build(BuildContext context) {
    final estimate = estimateCompletion(lines, delivery);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _StepHeading(
          title: 'Check the order at the door',
          message:
              'Everything is kept unless you change it. Only lower a count when the customer is '
              'refusing some or all of that item.',
        ),
        const SizedBox(height: 16),
        for (final line in lines) ...[
          _LineEditor(
            key: ValueKey(line.itemId),
            line: line,
            enabled: !line.photoBusy,
            onChanged: onChanged,
            uploadPhoto: uploadPhoto,
          ),
          const SizedBox(height: 10),
        ],
        const SizedBox(height: 6),
        _EstimateCard(delivery: delivery, estimate: estimate),
      ],
    );
  }
}

class _LineEditor extends StatefulWidget {
  const _LineEditor({
    super.key,
    required this.line,
    required this.enabled,
    required this.onChanged,
    required this.uploadPhoto,
  });

  final DoorLine line;
  final bool enabled;
  final ValueChanged<DoorLine> onChanged;
  final Future<UploadedPhoto> Function(Uint8List bytes, String filename)
  uploadPhoto;

  @override
  State<_LineEditor> createState() => _LineEditorState();
}

class _LineEditorState extends State<_LineEditor> {
  Uint8List? _preview;
  String? _photoError;

  bool get _cameraAvailable =>
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.android ||
          defaultTargetPlatform == TargetPlatform.iOS);

  @override
  void didUpdateWidget(covariant _LineEditor oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Keeping every unit clears the return, so the old preview must go too.
    if (oldWidget.line.rejected > 0 && widget.line.rejected == 0) {
      _preview = null;
      _photoError = null;
    }
  }

  Future<void> _pickAndUpload() async {
    if (!widget.enabled || widget.line.photoBusy) return;
    setState(() => _photoError = null);

    XFile? file;
    try {
      file = await ImagePicker().pickImage(
        source: _cameraAvailable ? ImageSource.camera : ImageSource.gallery,
        imageQuality: 40,
        maxWidth: 1600,
        requestFullMetadata: false,
      );
    } catch (_) {
      setState(() => _photoError = 'The camera could not open. Try again.');
      return;
    }
    if (file == null) return;

    final bytes = await file.readAsBytes();
    if (bytes.isEmpty) {
      setState(() => _photoError = 'That photo could not be read. Try again.');
      return;
    }
    final name = file.name.isEmpty ? 'return.jpg' : file.name;
    setState(() => _preview = bytes);
    widget.onChanged(widget.line.copyWith(photoBusy: true));
    try {
      final uploaded = await widget.uploadPhoto(bytes, name);
      widget.onChanged(
        widget.line.copyWith(
          photo: uploaded,
          clearPhotoPath: true,
          photoBusy: false,
        ),
      );
      if (mounted) setState(() => _photoError = null);
    } on ApiException catch (error) {
      widget.onChanged(widget.line.copyWith(photoBusy: false));
      if (mounted) setState(() => _photoError = error.message);
    } catch (_) {
      widget.onChanged(widget.line.copyWith(photoBusy: false));
      if (mounted) {
        setState(
          () => _photoError = 'The photo could not be uploaded. Try again.',
        );
      }
    }
  }

  void _removePhoto() {
    setState(() {
      _preview = null;
      _photoError = null;
    });
    widget.onChanged(
      widget.line.copyWith(
        clearPhoto: true,
        clearPhotoPath: true,
        photoBusy: false,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final line = widget.line;
    final returning = line.rejected > 0;

    return SurfaceCard(
      padding: const EdgeInsets.fromLTRB(16, 15, 16, 15),
      borderColor: returning
          ? AppColors.clay.withValues(alpha: 0.3)
          : AppColors.line,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  line.productName,
                  style: const TextStyle(
                    fontSize: 15.5,
                    height: 1.3,
                    fontWeight: FontWeight.w600,
                    color: AppColors.ink,
                  ),
                ),
              ),
              if (line.lineTotal > 0) ...[
                const SizedBox(width: 10),
                Text(
                  formatMoney(line.lineTotal),
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: Text(
                  returning
                      ? '${line.kept} of ${line.quantity} kept'
                      : 'All ${line.quantity} kept',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: returning ? AppColors.clay : AppColors.forest,
                  ),
                ),
              ),
              _CountButton(
                icon: Icons.remove_rounded,
                onPressed: widget.enabled && line.kept > 0
                    ? () => widget.onChanged(withKept(line, line.kept - 1))
                    : null,
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14),
                child: Text(
                  '${line.kept}',
                  style: const TextStyle(
                    fontSize: 21,
                    fontWeight: FontWeight.w700,
                    color: AppColors.ink,
                    fontFeatures: [FontFeature.tabularFigures()],
                  ),
                ),
              ),
              _CountButton(
                icon: Icons.add_rounded,
                onPressed: widget.enabled && line.kept < line.quantity
                    ? () => widget.onChanged(withKept(line, line.kept + 1))
                    : null,
              ),
            ],
          ),
          if (returning) ...[
            const SizedBox(height: 14),
            const SectionLabel('Why is it coming back?'),
            const SizedBox(height: 9),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: returnReasons
                  .map(
                    (reason) => _ReasonChip(
                      label: reason.label,
                      selected: line.reason == reason.value,
                      onTap: widget.enabled
                          ? () => widget.onChanged(
                              line.copyWith(reason: reason.value),
                            )
                          : null,
                    ),
                  )
                  .toList(growable: false),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                if (_preview != null) ...[
                  ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: Image.memory(
                      _preview!,
                      width: 46,
                      height: 46,
                      fit: BoxFit.cover,
                      errorBuilder: (context, error, stack) => Container(
                        width: 46,
                        height: 46,
                        color: AppColors.paperDeep,
                        child: const Icon(
                          Icons.image_not_supported_outlined,
                          size: 18,
                          color: AppColors.muted,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                ],
                Expanded(
                  child: AppButton(
                    label: line.photo != null
                        ? 'Photo added'
                        : line.photoBusy
                        ? 'Uploading…'
                        : (_preview != null && line.photo == null
                              ? 'Choose photo again'
                              : 'Add a photo (optional)'),
                    variant: AppButtonVariant.outline,
                    height: 44,
                    loading: line.photoBusy,
                    icon: line.photo != null
                        ? Icons.check_rounded
                        : Icons.photo_camera_outlined,
                    onPressed: !widget.enabled || line.photoBusy
                        ? null
                        : _pickAndUpload,
                  ),
                ),
                if (line.photo != null)
                  IconButton(
                    onPressed: widget.enabled && !line.photoBusy
                        ? _removePhoto
                        : null,
                    icon: const Icon(Icons.close_rounded, size: 19),
                    tooltip: 'Remove photo',
                    color: AppColors.muted,
                  ),
              ],
            ),
            if (line.reason == null) ...[
              const SizedBox(height: 8),
              Text(
                'Choose a reason to continue.',
                style: TextStyle(
                  fontSize: 12.5,
                  color: AppColors.clay.withValues(alpha: 0.9),
                ),
              ),
            ],
            if (_photoError != null) ...[
              const SizedBox(height: 8),
              Text(
                _photoError!,
                style: const TextStyle(
                  fontSize: 12.5,
                  color: AppColors.danger,
                  height: 1.35,
                ),
              ),
            ],
          ],
        ],
      ),
    );
  }
}

class _CountButton extends StatelessWidget {
  const _CountButton({required this.icon, required this.onPressed});

  final IconData icon;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null;
    return Material(
      color: enabled ? AppColors.paper : AppColors.paperDeep,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(12),
        child: SizedBox(
          width: 44,
          height: 44,
          child: Icon(
            icon,
            size: 20,
            color: enabled ? AppColors.ink : AppColors.muted,
          ),
        ),
      ),
    );
  }
}

class _ReasonChip extends StatelessWidget {
  const _ReasonChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 9),
        decoration: BoxDecoration(
          color: selected ? AppColors.clay : AppColors.surface,
          borderRadius: BorderRadius.circular(AppRadius.pill),
          border: Border.all(
            color: selected ? AppColors.clay : AppColors.lineStrong,
            width: 1.2,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12.5,
            fontWeight: FontWeight.w600,
            color: selected ? AppColors.white : AppColors.inkSoft,
          ),
        ),
      ),
    );
  }
}

class _EstimateCard extends StatelessWidget {
  const _EstimateCard({required this.delivery, required this.estimate});

  final RiderDelivery delivery;
  final CompletionEstimate estimate;

  @override
  Widget build(BuildContext context) {
    return SurfaceCard(
      color: AppColors.paperDeep,
      borderColor: AppColors.paperDeep,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SectionLabel('What happens to the payment'),
          const SizedBox(height: 12),
          _MoneyRow(
            label: 'Accepted items',
            value: formatMoney(
              estimate.acceptedTotal,
              currency: delivery.currency,
            ),
          ),
          if (estimate.fee > 0) ...[
            const SizedBox(height: 7),
            _MoneyRow(label: 'Delivery fee', value: 'Included'),
          ],
          if (estimate.hasRejected) ...[
            const SizedBox(height: 7),
            _MoneyRow(
              label: 'Coming back to the store',
              value:
                  '− ${formatMoney(estimate.returnedTotal, currency: delivery.currency)}',
              color: AppColors.clay,
            ),
          ],
          if (estimate.feeRefunded) ...[
            const SizedBox(height: 7),
            _MoneyRow(
              label: 'Delivery fee refunded',
              value:
                  '− ${formatMoney(estimate.fee, currency: delivery.currency)}',
              color: AppColors.clay,
            ),
          ],
          const SizedBox(height: 11),
          const Divider(),
          const SizedBox(height: 11),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: Text(
                  'Collect at the door',
                  style: TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w600,
                    color: AppColors.inkSoft,
                  ),
                ),
              ),
              Text(
                formatMoney(estimate.netTotal, currency: delivery.currency),
                style: const TextStyle(
                  fontSize: 22,
                  height: 1.1,
                  fontWeight: FontWeight.w700,
                  color: AppColors.forest,
                  fontFeatures: [FontFeature.tabularFigures()],
                ),
              ),
            ],
          ),
          if (estimate.everythingRejected) ...[
            const SizedBox(height: 9),
            Text(
              estimate.feeRefunded
                  ? 'Everything is going back, so there is nothing to collect and the delivery fee is refunded.'
                  : 'Everything is going back, so there is nothing to collect.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ],
      ),
    );
  }
}

class _MoneyRow extends StatelessWidget {
  const _MoneyRow({required this.label, required this.value, this.color});

  final String label;
  final String value;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(label, style: Theme.of(context).textTheme.bodySmall),
        ),
        Text(
          value,
          style: TextStyle(
            fontSize: 13.5,
            fontWeight: FontWeight.w600,
            color: color ?? AppColors.inkSoft,
            fontFeatures: const [FontFeature.tabularFigures()],
          ),
        ),
      ],
    );
  }
}

class _PaymentStep extends StatelessWidget {
  const _PaymentStep({
    required this.delivery,
    required this.amount,
    required this.payment,
    required this.busy,
    required this.onChanged,
    required this.uploadProof,
  });

  final RiderDelivery delivery;
  final double amount;
  final DoorPayment payment;
  final bool busy;
  final ValueChanged<DoorPayment> onChanged;
  final Future<UploadedPhoto> Function(Uint8List bytes, String filename)
  uploadProof;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _StepHeading(
          title: 'Take the payment',
          message:
              'Ask for the amount below. Cash is one tap; any other method needs the transaction '
              'code and a photo of the confirmation.',
        ),
        const SizedBox(height: 20),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: AppColors.forest,
            borderRadius: BorderRadius.circular(20),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'COLLECT FROM THE CUSTOMER',
                style: TextStyle(
                  fontSize: 10.5,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.2,
                  color: AppColors.surface.withValues(alpha: 0.62),
                ),
              ),
              const SizedBox(height: 6),
              Text(
                formatMoney(amount, currency: delivery.currency),
                style: const TextStyle(
                  fontSize: 38,
                  height: 1.05,
                  fontWeight: FontWeight.w700,
                  letterSpacing: -0.9,
                  color: AppColors.surface,
                  fontFeatures: [FontFeature.tabularFigures()],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),
        const SectionLabel('How is the customer paying?'),
        const SizedBox(height: 10),
        PaymentCapture(
          options: methodsFor(delivery),
          value: payment,
          enabled: !busy,
          onChanged: onChanged,
          uploadProof: uploadProof,
        ),
        if (!payment.isCash) ...[
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.all(13),
            decoration: BoxDecoration(
              color: AppColors.amber,
              borderRadius: BorderRadius.circular(13),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(
                  Icons.hourglass_top_rounded,
                  size: 17,
                  color: AppColors.amberInk,
                ),
                const SizedBox(width: 9),
                Expanded(
                  child: Text(
                    'A photo payment goes to the store to confirm. They have 5 minutes; when they approve, the job closes and this screen updates by itself.',
                    style: const TextStyle(
                      fontSize: 12.5,
                      height: 1.4,
                      color: AppColors.amberInk,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _ReviewStep extends StatelessWidget {
  const _ReviewStep({
    required this.delivery,
    required this.code,
    required this.lines,
    required this.payment,
    required this.needsPayment,
    required this.error,
  });

  final RiderDelivery delivery;
  final String code;
  final List<DoorLine> lines;
  final DoorPayment payment;
  final bool needsPayment;
  final String? error;

  @override
  Widget build(BuildContext context) {
    final estimate = estimateCompletion(lines, delivery);
    final kept = lines.fold<int>(0, (sum, line) => sum + line.kept);
    final total = lines.fold<int>(0, (sum, line) => sum + line.quantity);
    final returnedItems = lines.where((line) => line.rejected > 0).length;
    final customer = delivery.address?.name ?? 'Customer';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _StepHeading(
          title: 'One last look',
          message: 'Check these details. Finishing now records the code, the items and the payment on the order.',
        ),
        const SizedBox(height: 20),
        SurfaceCard(
          child: Column(
            children: [
              _ReviewRow(label: 'Customer', value: customer),
              const Divider(height: 22),
              _ReviewRow(label: 'Delivery code', value: spacedCode(code)),
              const Divider(height: 22),
              _ReviewRow(
                label: 'Items kept',
                value: returnedItems == 0
                    ? 'All $total kept'
                    : '$kept of $total kept',
              ),
              if (returnedItems > 0) ...[
                const Divider(height: 22),
                _ReviewRow(
                  label: 'Going back',
                  value:
                      '$returnedItems ${returnedItems == 1 ? 'item' : 'items'}',
                  color: AppColors.clay,
                ),
              ],
              const Divider(height: 22),
              _ReviewRow(
                label: 'Payment',
                value: needsPayment
                    ? (payment.isCash
                          ? 'Cash'
                          : paymentMethodLabel(payment.method))
                    : 'Nothing to collect',
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        if (needsPayment)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: AppColors.forest,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(
                  child: Text(
                    payment.isCash ? 'Collecting in cash' : 'Payment to record',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: AppColors.surface.withValues(alpha: 0.7),
                    ),
                  ),
                ),
                Text(
                  formatMoney(estimate.netTotal, currency: delivery.currency),
                  style: const TextStyle(
                    fontSize: 30,
                    height: 1.05,
                    fontWeight: FontWeight.w700,
                    color: AppColors.surface,
                    fontFeatures: [FontFeature.tabularFigures()],
                  ),
                ),
              ],
            ),
          )
        else
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.paperDeep,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Row(
              children: [
                const Icon(
                  Icons.inventory_2_outlined,
                  size: 18,
                  color: AppColors.muted,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'No money is due at the door.',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ),
              ],
            ),
          ),
        if (error != null) ...[
          const SizedBox(height: 14),
          ErrorNotice(message: error!),
        ],
      ],
    );
  }
}

class _ReviewRow extends StatelessWidget {
  const _ReviewRow({required this.label, required this.value, this.color});

  final String label;
  final String value;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            value,
            textAlign: TextAlign.right,
            style: TextStyle(
              fontSize: 14.5,
              height: 1.35,
              fontWeight: FontWeight.w600,
              color: color ?? AppColors.ink,
            ),
          ),
        ),
      ],
    );
  }
}

class _Footer extends StatelessWidget {
  const _Footer({
    required this.label,
    required this.helper,
    required this.busy,
    required this.enabled,
    required this.onPressed,
  });

  final String label;
  final String? helper;
  final bool busy;
  final bool enabled;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.surface,
        border: Border(top: BorderSide(color: AppColors.line)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              AppButton(
                label: label,
                loading: busy,
                onPressed: enabled ? onPressed : null,
              ),
              if (helper != null) ...[
                const SizedBox(height: 7),
                Text(
                  helper!,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _BlockedView extends StatelessWidget {
  const _BlockedView({
    required this.title,
    required this.message,
    required this.onBack,
    this.secondsLeft,
  });

  final String title;
  final String message;
  final VoidCallback onBack;
  final int? secondsLeft;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            ScreenTopBar(title: 'Complete delivery', onBack: onBack),
            Expanded(
              child: EmptyState(
                icon: Icons.info_outline_rounded,
                title: title,
                message: message,
                action: AppButton(
                  label: 'Back to the job',
                  variant: AppButtonVariant.outline,
                  expand: false,
                  height: 48,
                  onPressed: onBack,
                ),
              ),
            ),
            if (secondsLeft != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 28),
                child: CountdownLine(
                  secondsLeft: secondsLeft,
                  color: AppColors.amberInk,
                  zeroText: 'Waiting for the store to finish checking…',
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _SuccessView extends StatelessWidget {
  const _SuccessView({
    required this.delivery,
    required this.amount,
    required this.held,
    required this.onDone,
    this.secondsLeft,
  });

  final RiderDelivery delivery;
  final double amount;
  final bool held;
  final VoidCallback onDone;
  final int? secondsLeft;

  @override
  Widget build(BuildContext context) {
    final currency = delivery.currency;
    final confirmedByStore = !held && delivery.proofStatus == 'VERIFIED';
    final (title, message, icon, tone) = held
        ? (
            'Payment sent for checking',
            'The store has 5 minutes to check the ${formatMoney(amount, currency: currency)} payment. '
                'This screen updates by itself and the job closes as soon as they approve it.',
            Icons.hourglass_top_rounded,
            AppColors.amber,
          )
        : confirmedByStore
        ? (
            'Payment confirmed',
            'The store confirmed the ${formatMoney(amount, currency: currency)} payment. '
                'This delivery is complete.',
            Icons.verified_rounded,
            AppColors.sage,
          )
        : amount > 0
        ? (
            'Delivery finished',
            '${formatMoney(amount, currency: currency)} is now in your cash balance. '
                'Hand it to the store at the end of your shift.',
            Icons.check_rounded,
            AppColors.sage,
          )
        : (
            'Delivery finished',
            'Nothing was collected at the door. The goods going back are recorded on the order.',
            Icons.check_rounded,
            AppColors.sage,
          );

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const BrandMark(size: 40),
                  const Spacer(),
                  Text(
                    delivery.orderNumber ?? 'Delivery',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
              const Spacer(),
              Center(
                child: Column(
                  children: [
                    Container(
                      width: 92,
                      height: 92,
                      decoration: BoxDecoration(
                        color: tone,
                        shape: BoxShape.circle,
                      ),
                      child: Icon(icon, size: 44, color: AppColors.forest),
                    ),
                    const SizedBox(height: 24),
                    Text(
                      title,
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.headlineMedium,
                    ),
                    const SizedBox(height: 10),
                    Text(
                      message,
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                    if (held) ...[
                      const SizedBox(height: 16),
                      const Pill(
                        text: 'Waiting for the store',
                        background: AppColors.amber,
                        foreground: AppColors.amberInk,
                        icon: Icons.schedule_rounded,
                      ),
                      const SizedBox(height: 10),
                      CountdownLine(
                        secondsLeft: secondsLeft,
                        color: AppColors.amberInk,
                        zeroText: 'Waiting for the store to finish checking…',
                      ),
                    ],
                  ],
                ),
              ),
              const Spacer(),
              AppButton(
                label: 'Back to today',
                icon: Icons.route_rounded,
                onPressed: onDone,
              ),
              const SizedBox(height: 10),
              SizedBox(
                width: double.infinity,
                child: Text(
                  'You can find this job under Past deliveries.',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
