import 'package:flutter/material.dart';

import 'format.dart';
import 'status.dart';
import 'theme.dart';

class SurfaceCard extends StatelessWidget {
  const SurfaceCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(18),
    this.color,
    this.borderColor,
    this.onTap,
    this.radius = AppRadius.card,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final Color? color;
  final Color? borderColor;
  final VoidCallback? onTap;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final decoration = BoxDecoration(
      color: color ?? AppColors.surface,
      borderRadius: BorderRadius.circular(radius),
      border: Border.all(color: borderColor ?? AppColors.line, width: 1),
      boxShadow: const [
        BoxShadow(
          color: Color(0x0A2B2114),
          blurRadius: 20,
          offset: Offset(0, 7),
        ),
      ],
    );

    if (onTap == null) {
      return Container(decoration: decoration, padding: padding, child: child);
    }
    return Material(
      color: Colors.transparent,
      child: Ink(
        decoration: decoration,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(radius),
          child: Padding(padding: padding, child: child),
        ),
      ),
    );
  }
}

class SectionLabel extends StatelessWidget {
  const SectionLabel(this.text, {super.key, this.color});

  final String text;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Text(
      text.toUpperCase(),
      style: Theme.of(context).textTheme.labelSmall
          ?.copyWith(color: color ?? AppColors.muted),
    );
  }
}

class SectionHeader extends StatelessWidget {
  const SectionHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.action,
  });

  final String title;
  final String? subtitle;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: Theme.of(context).textTheme.headlineSmall),
              if (subtitle != null) ...[
                const SizedBox(height: 3),
                Text(subtitle!, style: Theme.of(context).textTheme.bodySmall),
              ],
            ],
          ),
        ),
        if (action != null) ...[const SizedBox(width: 10), action!],
      ],
    );
  }
}

enum AppButtonVariant { primary, cream, outline, danger, text }

class AppButton extends StatelessWidget {
  const AppButton({
    super.key,
    required this.label,
    this.onPressed,
    this.variant = AppButtonVariant.primary,
    this.icon,
    this.loading = false,
    this.expand = true,
    this.height = 54,
    this.helper,
  });

  final String label;
  final VoidCallback? onPressed;
  final AppButtonVariant variant;
  final IconData? icon;
  final bool loading;
  final bool expand;
  final double height;
  final String? helper;

  @override
  Widget build(BuildContext context) {
    final disabled = onPressed == null || loading;
    final content = loading
        ? SizedBox(
            width: 22,
            height: 22,
            child: CircularProgressIndicator(
              strokeWidth: 2.4,
              color:
                  variant == AppButtonVariant.cream ||
                      variant == AppButtonVariant.outline ||
                      variant == AppButtonVariant.text
                  ? AppColors.forest
                  : AppColors.white,
            ),
          )
        : Row(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (icon != null) ...[
                Icon(icon, size: 20),
                const SizedBox(width: 9),
              ],
              Flexible(
                child: Text(
                  label,
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          );

    final button = switch (variant) {
      AppButtonVariant.primary => FilledButton(
        onPressed: disabled ? null : onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.forest,
          foregroundColor: AppColors.white,
          disabledBackgroundColor: AppColors.lineStrong,
          disabledForegroundColor: AppColors.surface,
          minimumSize: Size(64, height),
          padding: const EdgeInsets.symmetric(horizontal: 18),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.button),
          ),
          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
        child: content,
      ),
      AppButtonVariant.cream => FilledButton(
        onPressed: disabled ? null : onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.surface,
          foregroundColor: AppColors.forest,
          disabledBackgroundColor: AppColors.surface.withValues(alpha: 0.4),
          disabledForegroundColor: AppColors.forest.withValues(alpha: 0.5),
          minimumSize: Size(64, height),
          padding: const EdgeInsets.symmetric(horizontal: 18),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.button),
          ),
          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
        child: content,
      ),
      AppButtonVariant.outline => OutlinedButton(
        onPressed: disabled ? null : onPressed,
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.ink,
          minimumSize: Size(64, height),
          padding: const EdgeInsets.symmetric(horizontal: 16),
          side: const BorderSide(color: AppColors.lineStrong, width: 1.2),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.button),
          ),
          textStyle: const TextStyle(
            fontSize: 15.5,
            fontWeight: FontWeight.w600,
          ),
        ),
        child: content,
      ),
      AppButtonVariant.danger => FilledButton(
        onPressed: disabled ? null : onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.danger,
          foregroundColor: AppColors.white,
          disabledBackgroundColor: AppColors.dangerSoft,
          disabledForegroundColor: AppColors.danger,
          minimumSize: Size(64, height),
          padding: const EdgeInsets.symmetric(horizontal: 18),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.button),
          ),
          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
        child: content,
      ),
      AppButtonVariant.text => TextButton(
        onPressed: disabled ? null : onPressed,
        style: TextButton.styleFrom(
          minimumSize: Size(64, height),
          foregroundColor: AppColors.inkSoft,
          textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
        ),
        child: content,
      ),
    };

    // A minimum, not a fixed height: at large text sizes the label may need a
    // second line, and the button grows instead of clipping it.
    final wrapped = ConstrainedBox(
      constraints: BoxConstraints(
        minHeight: height,
        minWidth: expand ? double.infinity : 0,
      ),
      child: button,
    );
    if (helper == null) return wrapped;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        wrapped,
        const SizedBox(height: 7),
        Text(helper!, style: Theme.of(context).textTheme.bodySmall),
      ],
    );
  }
}

class Pill extends StatelessWidget {
  const Pill({
    super.key,
    required this.text,
    required this.background,
    required this.foreground,
    this.icon,
  });

  final String text;
  final Color background;
  final Color foreground;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(AppRadius.pill),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 13, color: foreground),
            const SizedBox(width: 5),
          ],
          Flexible(
            child: Text(
              text,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 11.5,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.1,
                color: foreground,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class StatusPill extends StatelessWidget {
  const StatusPill({
    super.key,
    required this.text,
    required this.tone,
    this.compact = false,
  });

  /// The friendly label, already translated by the caller.
  final String text;
  final StatusTone tone;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final (background, foreground) = switch (tone) {
      StatusTone.clay => (AppColors.claySoft, AppColors.clay),
      StatusTone.sage => (AppColors.sage, AppColors.sageInk),
      StatusTone.forest => (AppColors.forest, AppColors.white),
      StatusTone.amber => (AppColors.goldSoft, AppColors.goldInk),
      StatusTone.danger => (AppColors.dangerSoft, AppColors.danger),
      StatusTone.info => (AppColors.infoSoft, AppColors.info),
      StatusTone.muted => (AppColors.paperDeep, AppColors.muted),
    };
    return Pill(
      text: text,
      background: background,
      foreground: foreground,
      icon: compact ? null : Icons.circle,
    );
  }
}

class ErrorNotice extends StatelessWidget {
  const ErrorNotice({
    super.key,
    required this.message,
    this.onRetry,
    this.onDismiss,
  });

  final String message;
  final VoidCallback? onRetry;
  final VoidCallback? onDismiss;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.dangerSoft,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.danger.withValues(alpha: 0.18)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(
            Icons.error_outline_rounded,
            size: 20,
            color: AppColors.danger,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  message,
                  style: const TextStyle(
                    fontSize: 13.5,
                    height: 1.4,
                    color: AppColors.danger,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                if (onRetry != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: GestureDetector(
                      onTap: onRetry,
                      child: const Text(
                        'Try again',
                        style: TextStyle(
                          fontSize: 13.5,
                          fontWeight: FontWeight.w700,
                          color: AppColors.danger,
                          decoration: TextDecoration.underline,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          if (onDismiss != null)
            GestureDetector(
              onTap: onDismiss,
              child: const Padding(
                padding: EdgeInsets.only(left: 6),
                child: Icon(
                  Icons.close_rounded,
                  size: 18,
                  color: AppColors.danger,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class NoticeCard extends StatelessWidget {
  const NoticeCard({
    super.key,
    required this.title,
    required this.message,
    required this.icon,
    this.tone = StatusTone.amber,
    this.action,
  });

  final String title;
  final String message;
  final IconData icon;
  final StatusTone tone;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final (background, foreground) = switch (tone) {
      StatusTone.sage => (AppColors.sage, AppColors.sageInk),
      StatusTone.clay => (AppColors.claySoft, AppColors.clay),
      StatusTone.danger => (AppColors.dangerSoft, AppColors.danger),
      StatusTone.info => (AppColors.infoSoft, AppColors.info),
      StatusTone.forest => (AppColors.forest, AppColors.white),
      _ => (AppColors.goldSoft, AppColors.goldInk),
    };
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(AppRadius.card),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 22, color: foreground),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    height: 1.3,
                    color: foreground,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  message,
                  style: TextStyle(
                    fontSize: 13.5,
                    height: 1.45,
                    color: foreground.withValues(alpha: 0.9),
                  ),
                ),
                if (action != null) ...[const SizedBox(height: 10), action!],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.icon,
    required this.title,
    required this.message,
    this.action,
  });

  final IconData icon;
  final String title;
  final String message;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 36),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 72,
              height: 72,
              decoration: const BoxDecoration(
                color: AppColors.sage,
                shape: BoxShape.circle,
              ),
              child: Icon(icon, size: 31, color: AppColors.sageInk),
            ),
            const SizedBox(height: 16),
            Text(
              title,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 8),
            Text(
              message,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            if (action != null) ...[const SizedBox(height: 18), action!],
          ],
        ),
      ),
    );
  }
}

/// A store mark: the brand's image when it has one, otherwise its initial.
class BrandLogo extends StatelessWidget {
  const BrandLogo({
    super.key,
    required this.name,
    this.url,
    this.size = 48,
    this.radius,
  });

  final String name;
  final String? url;
  final double size;
  final double? radius;

  @override
  Widget build(BuildContext context) {
    final corner = radius ?? size * 0.3;
    final fallback = Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: AppColors.sage,
        borderRadius: BorderRadius.circular(corner),
      ),
      child: Text(
        initialsOf(name).substring(0, 1),
        style: TextStyle(
          fontSize: size * 0.4,
          fontWeight: FontWeight.w700,
          color: AppColors.sageInk,
        ),
      ),
    );
    if (url == null || url!.isEmpty) return fallback;
    return ClipRRect(
      borderRadius: BorderRadius.circular(corner),
      child: Image.network(
        url!,
        width: size,
        height: size,
        fit: BoxFit.cover,
        errorBuilder: (context, error, stack) => fallback,
        loadingBuilder: (context, child, progress) =>
            progress == null ? child : fallback,
      ),
    );
  }
}

class ProductThumb extends StatelessWidget {
  const ProductThumb({
    super.key,
    this.url,
    this.size = 52,
    this.radius = 12,
    this.icon = Icons.shopping_bag_outlined,
  });

  final String? url;
  final double size;
  final double radius;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final placeholder = Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: AppColors.paperDeep,
        borderRadius: BorderRadius.circular(radius),
      ),
      child: Icon(icon, size: size * 0.38, color: AppColors.muted),
    );
    if (url == null || url!.isEmpty) return placeholder;
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: Image.network(
        url!,
        width: size,
        height: size,
        fit: BoxFit.cover,
        errorBuilder: (context, error, stack) => placeholder,
        loadingBuilder: (context, child, progress) =>
            progress == null ? child : placeholder,
      ),
    );
  }
}

class ScreenTopBar extends StatelessWidget {
  const ScreenTopBar({
    super.key,
    this.title,
    this.subtitle,
    this.trailing,
    this.back = true,
    this.onBack,
  });

  final String? title;
  final String? subtitle;
  final Widget? trailing;
  final bool back;
  final VoidCallback? onBack;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 6, 16, 10),
      child: Row(
        children: [
          if (back)
            IconButton(
              onPressed: onBack ?? () => Navigator.of(context).maybePop(),
              icon: const Icon(Icons.arrow_back_rounded),
              tooltip: 'Back',
              style: IconButton.styleFrom(
                backgroundColor: AppColors.surface,
                side: const BorderSide(color: AppColors.line),
                minimumSize: const Size(44, 44),
              ),
            ),
          if (back) const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (title != null)
                  Text(
                    title!,
                    style: Theme.of(context).textTheme.titleLarge,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                if (subtitle != null)
                  Text(
                    subtitle!,
                    style: Theme.of(context).textTheme.bodySmall,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
              ],
            ),
          ),
          ?trailing,
        ],
      ),
    );
  }
}

/// "Gulberg, Faisalabad" with a pin, used wherever the chosen area is shown.
class LocationPill extends StatelessWidget {
  const LocationPill({super.key, required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.pill),
        side: const BorderSide(color: AppColors.line),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(AppRadius.pill),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 10, 8),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.place_rounded, size: 17, color: AppColors.clay),
              const SizedBox(width: 6),
              Flexible(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w600,
                    color: AppColors.ink,
                  ),
                ),
              ),
              const SizedBox(width: 4),
              const Icon(
                Icons.keyboard_arrow_down_rounded,
                size: 19,
                color: AppColors.muted,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class PageHeader extends StatelessWidget {
  const PageHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.eyebrow,
    this.trailing,
  });

  final String title;
  final String? subtitle;
  final String? eyebrow;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 14, 20, 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (eyebrow != null) ...[
                  SectionLabel(eyebrow!),
                  const SizedBox(height: 5),
                ],
                Text(title, style: Theme.of(context).textTheme.headlineMedium),
                if (subtitle != null) ...[
                  const SizedBox(height: 4),
                  Text(subtitle!, style: Theme.of(context).textTheme.bodySmall),
                ],
              ],
            ),
          ),
          if (trailing != null) ...[const SizedBox(width: 12), trailing!],
        ],
      ),
    );
  }
}

class Avatar extends StatelessWidget {
  const Avatar({super.key, required this.name, this.size = 44});

  final String name;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: AppColors.sage,
        borderRadius: BorderRadius.circular(size * 0.32),
        border: Border.all(color: AppColors.surface, width: 2),
      ),
      child: Text(
        initialsOf(name),
        style: TextStyle(
          fontSize: size * 0.31,
          fontWeight: FontWeight.w700,
          color: AppColors.sageInk,
        ),
      ),
    );
  }
}

class SegmentedControl<T> extends StatelessWidget {
  const SegmentedControl({
    super.key,
    required this.values,
    required this.labelOf,
    required this.value,
    required this.onChanged,
  });

  final List<T> values;
  final String Function(T value) labelOf;
  final T value;
  final ValueChanged<T> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: AppColors.paperDeep,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          for (final option in values)
            Expanded(
              child: _Segment(
                label: labelOf(option),
                active: option == value,
                onTap: () => onChanged(option),
              ),
            ),
        ],
      ),
    );
  }
}

class _Segment extends StatelessWidget {
  const _Segment({
    required this.label,
    required this.active,
    required this.onTap,
  });

  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
        decoration: BoxDecoration(
          color: active ? AppColors.surface : Colors.transparent,
          borderRadius: BorderRadius.circular(11),
          boxShadow: active
              ? const [
                  BoxShadow(
                    color: Color(0x0D2B2114),
                    blurRadius: 8,
                    offset: Offset(0, 2),
                  ),
                ]
              : null,
        ),
        child: Center(
          child: FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(
              label,
              maxLines: 1,
              style: TextStyle(
                fontSize: 13.5,
                fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                color: active ? AppColors.ink : AppColors.muted,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class FilterChips<T> extends StatelessWidget {
  const FilterChips({
    super.key,
    required this.values,
    required this.labelOf,
    required this.value,
    required this.onChanged,
    this.countOf,
  });

  final List<T> values;
  final String Function(T value) labelOf;
  final T value;
  final ValueChanged<T> onChanged;
  final int? Function(T value)? countOf;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 38,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 20),
        itemCount: values.length,
        separatorBuilder: (context, index) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final option = values[index];
          final active = option == value;
          final count = countOf?.call(option);
          return GestureDetector(
            onTap: () => onChanged(option),
            behavior: HitTestBehavior.opaque,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: active ? AppColors.forest : AppColors.surface,
                borderRadius: BorderRadius.circular(AppRadius.pill),
                border: Border.all(
                  color: active ? AppColors.forest : AppColors.line,
                ),
              ),
              child: Text(
                count == null || count == 0
                    ? labelOf(option)
                    : '${labelOf(option)}  $count',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: active ? AppColors.white : AppColors.inkSoft,
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class InfoRow extends StatelessWidget {
  const InfoRow({
    super.key,
    required this.label,
    required this.value,
    this.valueColor,
    this.strong = false,
  });

  final String label;
  final String value;
  final Color? valueColor;
  final bool strong;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            flex: 2,
            child: Text(
              label,
              style: Theme.of(context).textTheme.bodyMedium
                  ?.copyWith(color: AppColors.muted),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            flex: 3,
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: valueColor ?? AppColors.ink,
                fontWeight: strong ? FontWeight.w700 : FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class MoneyText extends StatelessWidget {
  const MoneyText(
    this.text, {
    super.key,
    this.size = 15,
    this.color = AppColors.ink,
    this.weight = FontWeight.w700,
    this.align = TextAlign.right,
  });

  final String text;
  final double size;
  final Color color;
  final FontWeight weight;
  final TextAlign align;

  @override
  Widget build(BuildContext context) {
    return FittedBox(
      fit: BoxFit.scaleDown,
      alignment: align == TextAlign.left
          ? Alignment.centerLeft
          : Alignment.centerRight,
      child: Text(
        text,
        maxLines: 1,
        style: TextStyle(
          fontSize: size,
          fontWeight: weight,
          color: color,
          fontFeatures: const [FontFeature.tabularFigures()],
        ),
      ),
    );
  }
}

/// Five stars filled to the nearest half. Used for product and service ratings.
class StarRating extends StatelessWidget {
  const StarRating({
    super.key,
    required this.rating,
    this.size = 16,
    this.color = AppColors.gold,
  });

  final double rating;
  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var star = 1; star <= 5; star++)
          Icon(
            rating >= star
                ? Icons.star_rounded
                : rating >= star - 0.5
                ? Icons.star_half_rounded
                : Icons.star_outline_rounded,
            size: size,
            color: color,
          ),
      ],
    );
  }
}

class SkeletonBox extends StatelessWidget {
  const SkeletonBox({
    super.key,
    required this.height,
    this.width,
    this.radius = 16,
  });

  final double height;
  final double? width;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: height,
      width: width,
      decoration: BoxDecoration(
        color: AppColors.paperDeep,
        borderRadius: BorderRadius.circular(radius),
      ),
    );
  }
}

class LoadingList extends StatelessWidget {
  const LoadingList({super.key, this.count = 3});

  final int count;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SkeletonBox(height: 14, width: 90),
          const SizedBox(height: 12),
          for (var i = 0; i < count; i++) ...[
            const SkeletonBox(height: 196, radius: 22),
            const SizedBox(height: 12),
          ],
        ],
      ),
    );
  }
}

class AppSearchField extends StatelessWidget {
  const AppSearchField({
    super.key,
    required this.controller,
    this.hint = 'Search',
    this.onChanged,
    this.onSubmitted,
    this.onClear,
    this.autofocus = false,
  });

  final TextEditingController controller;
  final String hint;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final VoidCallback? onClear;
  final bool autofocus;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      autofocus: autofocus,
      textInputAction: TextInputAction.search,
      onChanged: onChanged,
      onSubmitted: onSubmitted,
      decoration: InputDecoration(
        hintText: hint,
        prefixIcon: const Icon(Icons.search_rounded, size: 20),
        suffixIcon: ValueListenableBuilder<TextEditingValue>(
          valueListenable: controller,
          builder: (context, value, child) {
            if (value.text.isEmpty) return const SizedBox.shrink();
            return IconButton(
              icon: const Icon(Icons.close_rounded, size: 18),
              tooltip: 'Clear',
              onPressed: () {
                controller.clear();
                onClear?.call();
              },
            );
          },
        ),
        contentPadding: const EdgeInsets.symmetric(vertical: 13),
      ),
    );
  }
}

class BottomActionBar extends StatelessWidget {
  const BottomActionBar({super.key, required this.child, this.padding});

  final Widget child;
  final EdgeInsetsGeometry? padding;

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
          padding: padding ?? const EdgeInsets.fromLTRB(20, 12, 20, 14),
          child: child,
        ),
      ),
    );
  }
}

void showAppSnack(
  BuildContext context,
  String message, {
  bool error = false,
  String? actionLabel,
  VoidCallback? onAction,
}) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Row(
          children: [
            Icon(
              error
                  ? Icons.error_outline_rounded
                  : Icons.check_circle_outline_rounded,
              size: 20,
              color: error ? const Color(0xFFFFC9C2) : AppColors.sage,
            ),
            const SizedBox(width: 10),
            Expanded(child: Text(message)),
          ],
        ),
        action: actionLabel == null
            ? null
            : SnackBarAction(
                label: actionLabel,
                textColor: AppColors.sage,
                onPressed: onAction ?? () {},
              ),
      ),
    );
}

Future<bool> confirmAction(
  BuildContext context, {
  required String title,
  required String message,
  required String confirmLabel,
  bool destructive = false,
}) async {
  final result = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(title),
      content: Text(message),
      actionsPadding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context, false),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(context, true),
          style: FilledButton.styleFrom(
            backgroundColor: destructive ? AppColors.danger : AppColors.forest,
            minimumSize: const Size(96, 48),
          ),
          child: Text(confirmLabel),
        ),
      ],
    ),
  );
  return result ?? false;
}

Future<T?> showAppSheet<T>(
  BuildContext context, {
  required String title,
  String? subtitle,
  required Widget child,
}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (context) {
      final bottom = MediaQuery.viewInsetsOf(context).bottom;
      return Padding(
        padding: EdgeInsets.only(bottom: bottom),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 10, 20, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Center(
                child: Container(
                  width: 42,
                  height: 4,
                  decoration: BoxDecoration(
                    color: AppColors.lineStrong,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 18),
              Text(title, style: Theme.of(context).textTheme.headlineSmall),
              if (subtitle != null) ...[
                const SizedBox(height: 4),
                Text(subtitle, style: Theme.of(context).textTheme.bodySmall),
              ],
              const SizedBox(height: 16),
              child,
            ],
          ),
        ),
      );
    },
  );
}

/// Minus / count / plus in one pill. The buttons stay at a comfortable touch
/// size even though the whole control is compact.
class QuantityStepper extends StatelessWidget {
  const QuantityStepper({
    super.key,
    required this.value,
    required this.onChanged,
    this.min = 1,
    this.max = 99,
    this.busy = false,
    this.label = 'Quantity',
  });

  final int value;
  final ValueChanged<int> onChanged;
  final int min;
  final int max;
  final bool busy;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: label,
      value: '$value',
      child: Container(
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(AppRadius.pill),
          border: Border.all(color: AppColors.line),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            _StepButton(
              icon: Icons.remove_rounded,
              tooltip: 'One less',
              onTap: busy || value <= min ? null : () => onChanged(value - 1),
            ),
            SizedBox(
              width: 34,
              child: busy
                  ? const Center(
                      child: SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: AppColors.forest,
                        ),
                      ),
                    )
                  : FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Text(
                        '$value',
                        maxLines: 1,
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: AppColors.ink,
                        ),
                      ),
                    ),
            ),
            _StepButton(
              icon: Icons.add_rounded,
              tooltip: 'One more',
              onTap: busy || value >= max ? null : () => onChanged(value + 1),
            ),
          ],
        ),
      ),
    );
  }
}

class _StepButton extends StatelessWidget {
  const _StepButton({
    required this.icon,
    required this.tooltip,
    required this.onTap,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final enabled = onTap != null;
    return Tooltip(
      message: tooltip,
      child: InkResponse(
        onTap: onTap,
        radius: 22,
        containedInkWell: false,
        child: SizedBox(
          width: 42,
          height: 42,
          child: Icon(
            icon,
            size: 19,
            color: enabled ? AppColors.forest : AppColors.lineStrong,
          ),
        ),
      ),
    );
  }
}
