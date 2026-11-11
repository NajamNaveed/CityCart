import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../data/api_exception.dart';
import '../../data/models.dart';
import '../../providers.dart';

/// Monday-first, the way a working week is read here. The server numbers days
/// from Sunday, so both orders are kept explicit.
const _displayOrder = <int>[1, 2, 3, 4, 5, 6, 0];
const _maxWindows = 21;
const _maxBlackoutDates = 60;

String _errorSentence(Object? error) {
  if (error is ApiException) return error.message;
  return 'We could not load your working hours. Check the connection and try again.';
}

DateTime? _blackoutDate(String key) {
  final parsed = DateTime.tryParse('${key}T00:00:00');
  return parsed;
}

String _blackoutKey(DateTime date) {
  final month = date.month.toString().padLeft(2, '0');
  final day = date.day.toString().padLeft(2, '0');
  return '${date.year}-$month-$day';
}

class AvailabilityScreen extends ConsumerWidget {
  const AvailabilityScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncAvailability = ref.watch(providerAvailabilityProvider);
    final availability = asyncAvailability.asData?.value;

    return Scaffold(
      appBar: AppBar(title: const Text('Working hours')),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(providerAvailabilityProvider),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.only(bottom: 30),
          children: [
            const PageHeader(
              eyebrow: 'Availability',
              title: 'When you can work',
              subtitle:
                  'Customers can only book inside these hours. Leave them '
                  'empty to take requests for any time and agree the details '
                  'in chat.',
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.page,
                20,
                AppSpacing.page,
                0,
              ),
              child: asyncAvailability.isLoading && availability == null
                  ? const LoadingView(label: 'Loading working hours')
                  : asyncAvailability.hasError && availability == null
                  ? ErrorPanel(
                      message: _errorSentence(asyncAvailability.error),
                      onRetry: () =>
                          ref.invalidate(providerAvailabilityProvider),
                    )
                  : _AvailabilityEditor(initial: availability!),
            ),
          ],
        ),
      ),
    );
  }
}

class _AvailabilityEditor extends ConsumerStatefulWidget {
  const _AvailabilityEditor({required this.initial});

  final ServiceAvailability initial;

  @override
  ConsumerState<_AvailabilityEditor> createState() =>
      _AvailabilityEditorState();
}

class _AvailabilityEditorState extends ConsumerState<_AvailabilityEditor> {
  late List<AvailabilityWindow> _windows;
  late List<String> _blackouts;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _windows = [...widget.initial.windows];
    _blackouts = [...widget.initial.blackoutDates]..sort();
  }

  bool get _dirty {
    final initialWindows = widget.initial.windows;
    if (_windows.length != initialWindows.length) return true;
    for (var i = 0; i < _windows.length; i++) {
      final a = _windows[i];
      final b = initialWindows[i];
      if (a.weekday != b.weekday ||
          a.startMinute != b.startMinute ||
          a.endMinute != b.endMinute ||
          a.slotMinutes != b.slotMinutes) {
        return true;
      }
    }
    if (_blackouts.length != widget.initial.blackoutDates.length) return true;
    for (var i = 0; i < _blackouts.length; i++) {
      if (_blackouts[i] != widget.initial.blackoutDates[i]) return true;
    }
    return false;
  }

  void _sortWindows() {
    _windows.sort(
      (a, b) => a.weekday - b.weekday == 0
          ? a.startMinute - b.startMinute
          : a.weekday - b.weekday,
    );
  }

  Future<void> _addWindow() async {
    if (_windows.length >= _maxWindows) return;
    final window = await showFormSheet<AvailabilityWindow>(
      context,
      title: 'Add working hours',
      subtitle: 'A weekly window customers can book inside.',
      child: _WindowSheet(existing: _windows),
    );
    if (window == null || !mounted) return;
    setState(() {
      _windows = [..._windows, window];
      _sortWindows();
    });
  }

  void _removeWindow(AvailabilityWindow window) {
    setState(() {
      _windows = _windows
          .where(
            (item) =>
                !(item.weekday == window.weekday &&
                    item.startMinute == window.startMinute &&
                    item.endMinute == window.endMinute),
          )
          .toList(growable: false);
    });
  }

  Future<void> _addBlackout() async {
    if (_blackouts.length >= _maxBlackoutDates) return;
    final now = DateTime.now();
    final chosen = await showDatePicker(
      context: context,
      initialDate: now.add(const Duration(days: 1)),
      firstDate: now,
      lastDate: now.add(const Duration(days: 60)),
      helpText: 'Choose a day off',
      confirmText: 'Add day off',
    );
    if (chosen == null || !mounted) return;
    final key = _blackoutKey(chosen);
    if (_blackouts.contains(key)) {
      showAppSnack(context, 'That day is already a day off.');
      return;
    }
    setState(() {
      _blackouts = [..._blackouts, key]..sort();
    });
  }

  void _removeBlackout(String key) {
    setState(() {
      _blackouts = _blackouts
          .where((item) => item != key)
          .toList(growable: false);
    });
  }

  Future<void> _save() async {
    if (_saving) return;
    setState(() => _saving = true);
    try {
      final saved = await ref
          .read(businessRepositoryProvider)
          .saveProviderAvailability(
            windows: _windows,
            blackoutDates: _blackouts,
          );
      if (!mounted) return;
      setState(() {
        _windows = [...saved.windows];
        _blackouts = [...saved.blackoutDates]..sort();
        _saving = false;
      });
      ref.invalidate(providerAvailabilityProvider);
      showAppSnack(context, 'Working hours saved.');
    } catch (error) {
      if (!mounted) return;
      setState(() => _saving = false);
      showAppSnack(context, _errorSentence(error), error: true);
    }
  }

  Future<void> _confirmLeave() async {
    final leave = await confirmAction(
      context,
      title: 'Leave without saving?',
      message: 'Your changes to working hours will be lost.',
      confirmLabel: 'Leave',
      destructive: true,
    );
    if (leave && mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final dirty = _dirty;

    return PopScope(
      canPop: !dirty,
      onPopInvokedWithResult: (didPop, result) {
        if (!didPop) _confirmLeave();
      },
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (!widget.initial.hasHours) ...[
            const NoticeBanner(
              icon: Icons.schedule_rounded,
              tone: AppTone.blue,
              message:
                  'You have not set hours yet. Customers can send a request '
                  'for any time and you agree the details in chat.',
            ),
            const SizedBox(height: 20),
          ],
          SectionTitle(
            'Weekly hours',
            trailing: _windows.isEmpty
                ? null
                : StatusTag(
                    label: '${_windows.length} of $_maxWindows',
                    tone: AppTone.neutral,
                  ),
          ),
          if (_windows.isEmpty)
            EmptyPanel(
              icon: Icons.calendar_month_outlined,
              title: 'No working hours',
              message:
                  'Add the days and times you usually work. Customers will '
                  'only see times inside them.',
              action: AppButton(
                key: const Key('availability_add_empty'),
                label: 'Add working hours',
                icon: Icons.add_rounded,
                expand: false,
                onPressed: _addWindow,
              ),
            )
          else
            for (final weekday in _displayOrder)
              if (_windows.any((window) => window.weekday == weekday)) ...[
                _DayCard(
                  weekday: weekday,
                  windows: _windows
                      .where((window) => window.weekday == weekday)
                      .toList(growable: false),
                  onRemove: _removeWindow,
                ),
                const SizedBox(height: 12),
              ],
          if (_windows.isNotEmpty) ...[
            AppButton(
              key: const Key('availability_add'),
              label: _windows.length >= _maxWindows
                  ? 'All working hours added'
                  : 'Add working hours',
              icon: Icons.add_rounded,
              variant: AppButtonVariant.outline,
              onPressed: _windows.length >= _maxWindows ? null : _addWindow,
            ),
            const SizedBox(height: 24),
          ],
          SectionTitle(
            'Days off',
            trailing: _blackouts.isEmpty
                ? null
                : StatusTag(label: '${_blackouts.length}', tone: AppTone.amber),
          ),
          Text(
            'Customers cannot book you on these dates. Use them for holidays '
            'and personal days.',
            style: text.bodySmall,
          ),
          const SizedBox(height: 12),
          if (_blackouts.isEmpty)
            SurfacePanel(
              color: AppColors.paper,
              borderColor: AppColors.paper,
              child: Text('No days off planned.', style: text.bodyMedium),
            )
          else
            SurfacePanel(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Column(
                children: [
                  for (var i = 0; i < _blackouts.length; i++) ...[
                    if (i > 0) const Divider(indent: 16, endIndent: 16),
                    _BlackoutRow(
                      dateKey: _blackouts[i],
                      onRemove: () => _removeBlackout(_blackouts[i]),
                    ),
                  ],
                ],
              ),
            ),
          const SizedBox(height: 12),
          AppButton(
            key: const Key('availability_add_blackout'),
            label: _blackouts.length >= _maxBlackoutDates
                ? 'All days off added'
                : 'Add a day off',
            icon: Icons.event_busy_outlined,
            variant: AppButtonVariant.outline,
            onPressed: _blackouts.length >= _maxBlackoutDates
                ? null
                : _addBlackout,
          ),
          const SizedBox(height: 24),
          AppButton(
            key: const Key('availability_save'),
            label: 'Save working hours',
            icon: Icons.check_rounded,
            loading: _saving,
            onPressed: _saving || !dirty ? null : _save,
          ),
          if (!dirty) ...[
            const SizedBox(height: 10),
            Text(
              'Your working hours are up to date.',
              textAlign: TextAlign.center,
              style: text.bodySmall,
            ),
          ],
        ],
      ),
    );
  }
}

class _DayCard extends StatelessWidget {
  const _DayCard({
    required this.weekday,
    required this.windows,
    required this.onRemove,
  });

  final int weekday;
  final List<AvailabilityWindow> windows;
  final ValueChanged<AvailabilityWindow> onRemove;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return SurfacePanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(weekdayName(weekday), style: text.titleSmall),
          const SizedBox(height: 8),
          for (final window in windows)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      '${minuteLabel(window.startMinute)} – '
                      '${minuteLabel(window.endMinute)}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: text.bodyMedium?.copyWith(color: AppColors.ink),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    '${durationLabel(window.slotMinutes)} slots',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: text.bodySmall,
                  ),
                  const SizedBox(width: 2),
                  IconButton(
                    key: Key(
                      'availability_remove_${window.weekday}_'
                      '${window.startMinute}',
                    ),
                    tooltip: 'Remove these hours',
                    visualDensity: VisualDensity.compact,
                    onPressed: () => onRemove(window),
                    icon: const Icon(
                      Icons.close_rounded,
                      size: 19,
                      color: AppColors.muted,
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _BlackoutRow extends StatelessWidget {
  const _BlackoutRow({required this.dateKey, required this.onRemove});

  final String dateKey;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final date = _blackoutDate(dateKey);
    return InfoRow(
      key: Key('availability_blackout_$dateKey'),
      icon: Icons.event_busy_outlined,
      label: 'Day off',
      value: date == null ? dateKey : fullDay(date),
      trailing: IconButton(
        key: Key('availability_remove_blackout_$dateKey'),
        tooltip: 'Remove this day off',
        visualDensity: VisualDensity.compact,
        onPressed: onRemove,
        icon: const Icon(Icons.close_rounded, size: 19, color: AppColors.muted),
      ),
    );
  }
}

class _WindowSheet extends StatefulWidget {
  const _WindowSheet({required this.existing});

  final List<AvailabilityWindow> existing;

  @override
  State<_WindowSheet> createState() => _WindowSheetState();
}

class _WindowSheetState extends State<_WindowSheet> {
  late int _weekday;
  TimeOfDay _start = const TimeOfDay(hour: 9, minute: 0);
  TimeOfDay _end = const TimeOfDay(hour: 17, minute: 0);
  int _slot = 60;
  String? _error;

  @override
  void initState() {
    super.initState();
    _weekday = _displayOrder.firstWhere(
      (day) => widget.existing.every((window) => window.weekday != day),
      orElse: () => 1,
    );
  }

  int get _startMinute => _start.hour * 60 + _start.minute;
  int get _endMinute => _end.hour * 60 + _end.minute;

  Future<void> _pickTime({required bool start}) async {
    final picked = await showTimePicker(
      context: context,
      initialTime: start ? _start : _end,
      helpText: start ? 'When do you start?' : 'When do you finish?',
    );
    if (picked == null || !mounted) return;
    setState(() {
      if (start) {
        _start = picked;
      } else {
        _end = picked;
      }
      _error = null;
    });
  }

  String _timeLabel(TimeOfDay time) {
    return MaterialLocalizations.of(context)
        .formatTimeOfDay(time, alwaysUse24HourFormat: false);
  }

  void _submit() {
    if (_endMinute <= _startMinute) {
      setState(() => _error = 'The finish time must be after the start time.');
      return;
    }
    final overlaps = widget.existing.any(
      (window) =>
          window.weekday == _weekday &&
          _startMinute < window.endMinute &&
          _endMinute > window.startMinute,
    );
    if (overlaps) {
      setState(
        () => _error =
            'These hours overlap hours you already added on '
            '${weekdayName(_weekday)}.',
      );
      return;
    }
    Navigator.of(context).pop(
      AvailabilityWindow(
        weekday: _weekday,
        startMinute: _startMinute,
        endMinute: _endMinute,
        slotMinutes: _slot,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_error != null) ...[
          ErrorPanel(message: _error!),
          const SizedBox(height: 14),
        ],
        Text('Day', style: text.labelMedium),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final day in _displayOrder)
              ChoiceChip(
                key: Key('availability_day_$day'),
                label: Text(weekdayName(day).substring(0, 3)),
                selected: _weekday == day,
                onSelected: (_) => setState(() {
                  _weekday = day;
                  _error = null;
                }),
              ),
          ],
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: _TimeButton(
                key: const Key('availability_start_time'),
                label: 'Starts',
                value: _timeLabel(_start),
                onTap: () => _pickTime(start: true),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _TimeButton(
                key: const Key('availability_end_time'),
                label: 'Finishes',
                value: _timeLabel(_end),
                onTap: () => _pickTime(start: false),
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        Text('Length of each booking', style: text.labelMedium),
        const SizedBox(height: 8),
        DropdownButtonFormField<int>(
          key: const Key('availability_slot'),
          initialValue: _slot,
          isExpanded: true,
          decoration: const InputDecoration(contentPadding: EdgeInsets.all(14)),
          items: const [15, 30, 45, 60, 90, 120]
              .map(
                (minutes) => DropdownMenuItem(
                  value: minutes,
                  child: Text(durationLabel(minutes)),
                ),
              )
              .toList(growable: false),
          onChanged: (value) => setState(() => _slot = value ?? 60),
        ),
        const SizedBox(height: 20),
        AppButton(
          key: const Key('availability_add_submit'),
          label: 'Add these hours',
          icon: Icons.check_rounded,
          onPressed: _submit,
        ),
      ],
    );
  }
}

class _TimeButton extends StatelessWidget {
  const _TimeButton({
    super.key,
    required this.label,
    required this.value,
    required this.onTap,
  });

  final String label;
  final String value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: Theme.of(context).textTheme.labelMedium),
        const SizedBox(height: 7),
        OutlinedButton.icon(
          onPressed: onTap,
          icon: const Icon(Icons.schedule_rounded, size: 18),
          label: Text(value, maxLines: 1, overflow: TextOverflow.ellipsis),
          style: OutlinedButton.styleFrom(
            minimumSize: const Size(0, 48),
            alignment: Alignment.centerLeft,
          ),
        ),
      ],
    );
  }
}
