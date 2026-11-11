import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/api_exception.dart';
import '../../data/models.dart';
import 'delivery_rules.dart';

/// How the customer paid at the door. Cash is one tap; anything else needs the
/// transaction reference and a photo of the confirmation, which goes straight
/// to the job's private folder.
class PaymentCapture extends StatefulWidget {
  const PaymentCapture({
    super.key,
    required this.options,
    required this.value,
    required this.onChanged,
    required this.uploadProof,
    this.enabled = true,
  });

  final List<PaymentMethodOption> options;
  final DoorPayment value;
  final ValueChanged<DoorPayment> onChanged;
  final Future<UploadedPhoto> Function(Uint8List bytes, String filename)
  uploadProof;
  final bool enabled;

  @override
  State<PaymentCapture> createState() => _PaymentCaptureState();
}

class _PaymentCaptureState extends State<PaymentCapture> {
  final _reference = TextEditingController();
  Uint8List? _preview;
  Uint8List? _pendingBytes;
  String? _pendingName;
  String? _photoError;

  bool get _cameraAvailable =>
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.android ||
          defaultTargetPlatform == TargetPlatform.iOS);

  @override
  void initState() {
    super.initState();
    _reference.text = widget.value.reference;
  }

  @override
  void didUpdateWidget(covariant PaymentCapture oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.value.reference != oldWidget.value.reference &&
        _reference.text != widget.value.reference) {
      _reference.text = widget.value.reference;
    }
  }

  @override
  void dispose() {
    _reference.dispose();
    super.dispose();
  }

  void _selectMethod(String method) {
    if (!widget.enabled) return;
    widget.onChanged(widget.value.copyWith(method: method));
  }

  Future<void> _pickAndUpload() async {
    if (!widget.enabled || widget.value.busy) return;
    setState(() => _photoError = null);

    final picker = ImagePicker();
    XFile? file;
    try {
      file = await picker.pickImage(
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

    setState(() {
      _preview = bytes;
      _pendingBytes = bytes;
      _pendingName = file!.name.isEmpty ? 'receipt.jpg' : file.name;
    });
    await _uploadPending();
  }

  Future<void> _uploadPending() async {
    final bytes = _pendingBytes;
    if (bytes == null) return;
    widget.onChanged(widget.value.copyWith(busy: true));
    try {
      final uploaded = await widget.uploadProof(
        bytes,
        _pendingName ?? 'receipt.jpg',
      );
      widget.onChanged(
        widget.value.copyWith(
          proof: uploaded,
          clearProofPath: true,
          busy: false,
        ),
      );
      if (mounted) setState(() => _photoError = null);
    } on ApiException catch (error) {
      widget.onChanged(widget.value.copyWith(busy: false));
      if (mounted) setState(() => _photoError = error.message);
    } catch (_) {
      widget.onChanged(widget.value.copyWith(busy: false));
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
      _pendingBytes = null;
      _pendingName = null;
      _photoError = null;
    });
    widget.onChanged(
      widget.value.copyWith(clearProof: true, clearProofPath: true),
    );
  }

  @override
  Widget build(BuildContext context) {
    final payment = widget.value;
    final methods = widget.options.isEmpty
        ? paymentMethods.take(1).toList()
        : widget.options;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        LayoutBuilder(
          builder: (context, constraints) {
            const gap = 8.0;
            final width = (constraints.maxWidth - gap) / 2;
            return Wrap(
              spacing: gap,
              runSpacing: gap,
              children: [
                for (final method in methods)
                  SizedBox(
                    width: width,
                    child: _MethodTile(
                      option: method,
                      selected: payment.method == method.value,
                      enabled: widget.enabled && !payment.busy,
                      onTap: () => _selectMethod(method.value),
                    ),
                  ),
              ],
            );
          },
        ),
        if (!payment.isCash) ...[
          const SizedBox(height: 20),
          if (payment.method == 'WALLET') ...[
            const SectionLabel('Which wallet?'),
            const SizedBox(height: 9),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: wallets.entries
                  .map(
                    (entry) => _Choice(
                      label: entry.value,
                      selected: payment.wallet == entry.key,
                      onTap: widget.enabled && !payment.busy
                          ? () => widget.onChanged(
                              payment.copyWith(wallet: entry.key),
                            )
                          : null,
                    ),
                  )
                  .toList(growable: false),
            ),
            const SizedBox(height: 18),
          ],
          TextField(
            controller: _reference,
            enabled: widget.enabled && !payment.busy,
            textCapitalization: TextCapitalization.characters,
            autocorrect: false,
            maxLength: 100,
            onChanged: (value) =>
                widget.onChanged(payment.copyWith(reference: value)),
            decoration: const InputDecoration(
              labelText: 'Transaction or approval code',
              hintText: 'For example: JC-778812',
              counterText: '',
              prefixIcon: Icon(Icons.tag_rounded, size: 20),
            ),
          ),
          const SizedBox(height: 16),
          const SectionLabel('Photo of the confirmation'),
          const SizedBox(height: 6),
          Text(
            'Photograph the receipt or the screen. Never photograph the card itself.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              if (_preview != null)
                ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: Image.memory(
                    _preview!,
                    width: 84,
                    height: 84,
                    fit: BoxFit.cover,
                    errorBuilder: (context, error, stack) => Container(
                      width: 84,
                      height: 84,
                      color: AppColors.paperDeep,
                      child: const Icon(
                        Icons.image_not_supported_outlined,
                        color: AppColors.muted,
                      ),
                    ),
                  ),
                ),
              if (_preview != null) const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    AppButton(
                      label: payment.proof != null
                          ? 'Photo added'
                          : payment.busy
                          ? 'Uploading photo…'
                          : _preview != null
                          ? 'Try upload again'
                          : (_cameraAvailable ? 'Take photo' : 'Choose photo'),
                      variant: AppButtonVariant.outline,
                      height: 46,
                      loading: payment.busy,
                      icon: payment.proof != null
                          ? Icons.check_rounded
                          : Icons.photo_camera_outlined,
                      onPressed: !widget.enabled || payment.busy
                          ? null
                          : (_preview != null && payment.proof == null
                                ? _uploadPending
                                : _pickAndUpload),
                    ),
                    if (_preview != null && payment.proof != null)
                      Align(
                        alignment: Alignment.centerLeft,
                        child: TextButton(
                          onPressed: widget.enabled && !payment.busy
                              ? _removePhoto
                              : null,
                          child: const Text('Remove photo'),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
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
    );
  }
}

class _MethodTile extends StatelessWidget {
  const _MethodTile({
    required this.option,
    required this.selected,
    required this.enabled,
    required this.onTap,
  });

  final PaymentMethodOption option;
  final bool selected;
  final bool enabled;
  final VoidCallback onTap;

  IconData get _icon => switch (option.value) {
    'CASH' => Icons.payments_outlined,
    'BANK_TRANSFER' => Icons.account_balance_outlined,
    'WALLET' => Icons.smartphone_outlined,
    'CARD_MACHINE' => Icons.credit_card_outlined,
    _ => Icons.paid_outlined,
  };

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: enabled ? onTap : null,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        height: 82,
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
        decoration: BoxDecoration(
          color: selected ? AppColors.sage : AppColors.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: selected ? AppColors.forest : AppColors.line,
            width: selected ? 1.6 : 1.2,
          ),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              _icon,
              size: 22,
              color: selected ? AppColors.forest : AppColors.inkSoft,
            ),
            const SizedBox(height: 6),
            Text(
              option.label,
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 11.5,
                height: 1.2,
                fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                color: selected ? AppColors.forest : AppColors.inkSoft,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Choice extends StatelessWidget {
  const _Choice({
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
        duration: const Duration(milliseconds: 160),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: selected ? AppColors.forest : AppColors.surface,
          borderRadius: BorderRadius.circular(AppRadius.pill),
          border: Border.all(
            color: selected ? AppColors.forest : AppColors.lineStrong,
            width: 1.2,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: selected ? AppColors.white : AppColors.inkSoft,
          ),
        ),
      ),
    );
  }
}
