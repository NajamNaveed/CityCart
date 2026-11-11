import 'package:flutter/material.dart';

/// The business palette. Deep ink for words, warm paper for the page, forest
/// for the one thing to do next, and a small set of calm tints for status. It
/// is deliberately different from the shopper app: this is a work tool, not a
/// shop window.
class AppColors {
  const AppColors._();

  static const ink = Color(0xFF17202D);
  static const inkSoft = Color(0xFF4A5567);
  static const muted = Color(0xFF7C8697);
  static const paper = Color(0xFFF4F1EA);
  static const surface = Color(0xFFFFFDF8);
  static const line = Color(0xFFE5DFD2);

  static const forest = Color(0xFF115E52);
  static const forestInk = Color(0xFF0A413A);
  static const mint = Color(0xFFDCEDE7);

  static const amber = Color(0xFF94641C);
  static const amberWash = Color(0xFFF7EAD2);

  static const clay = Color(0xFFA9432D);
  static const clayWash = Color(0xFFF8E2DB);

  static const blue = Color(0xFF31597F);
  static const blueWash = Color(0xFFE2EAF3);

  static const white = Colors.white;
}

class AppRadius {
  const AppRadius._();

  static const sm = 10.0;
  static const md = 14.0;
  static const lg = 20.0;
  static const xl = 26.0;
  static const pill = 999.0;
}

class AppSpacing {
  const AppSpacing._();

  static const page = 20.0;
  static const gap = 14.0;
}

class AppTheme {
  const AppTheme._();

  static ThemeData get light {
    const scheme = ColorScheme(
      brightness: Brightness.light,
      primary: AppColors.forest,
      onPrimary: AppColors.white,
      primaryContainer: AppColors.mint,
      onPrimaryContainer: AppColors.forestInk,
      secondary: AppColors.amber,
      onSecondary: AppColors.white,
      secondaryContainer: AppColors.amberWash,
      onSecondaryContainer: AppColors.ink,
      tertiary: AppColors.blue,
      onTertiary: AppColors.white,
      error: AppColors.clay,
      onError: AppColors.white,
      errorContainer: AppColors.clayWash,
      onErrorContainer: AppColors.ink,
      surface: AppColors.surface,
      onSurface: AppColors.ink,
      surfaceContainerHighest: AppColors.paper,
      onSurfaceVariant: AppColors.inkSoft,
      outline: AppColors.line,
      outlineVariant: AppColors.line,
      shadow: Color(0x1A17202D),
      scrim: Color(0x6617202D),
      inverseSurface: AppColors.ink,
      onInverseSurface: AppColors.surface,
      inversePrimary: AppColors.mint,
    );

    final base = ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: AppColors.paper,
      splashFactory: InkRipple.splashFactory,
      visualDensity: VisualDensity.standard,
    );

    final text = base.textTheme
        .apply(bodyColor: AppColors.ink, displayColor: AppColors.ink)
        .copyWith(
          displaySmall: const TextStyle(
            fontSize: 31,
            height: 1.15,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.8,
            color: AppColors.ink,
          ),
          headlineMedium: const TextStyle(
            fontSize: 25,
            height: 1.2,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.4,
            color: AppColors.ink,
          ),
          headlineSmall: const TextStyle(
            fontSize: 21,
            height: 1.25,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.2,
            color: AppColors.ink,
          ),
          titleLarge: const TextStyle(
            fontSize: 19,
            height: 1.25,
            fontWeight: FontWeight.w700,
            color: AppColors.ink,
          ),
          titleMedium: const TextStyle(
            fontSize: 16,
            height: 1.3,
            fontWeight: FontWeight.w700,
            color: AppColors.ink,
          ),
          titleSmall: const TextStyle(
            fontSize: 14.5,
            height: 1.3,
            fontWeight: FontWeight.w700,
            color: AppColors.ink,
          ),
          bodyLarge: const TextStyle(
            fontSize: 15.5,
            height: 1.45,
            color: AppColors.ink,
          ),
          bodyMedium: const TextStyle(
            fontSize: 14.5,
            height: 1.45,
            color: AppColors.inkSoft,
          ),
          bodySmall: const TextStyle(
            fontSize: 13,
            height: 1.4,
            color: AppColors.inkSoft,
          ),
          labelLarge: const TextStyle(
            fontSize: 15,
            height: 1.2,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.1,
          ),
          labelMedium: const TextStyle(
            fontSize: 12.5,
            height: 1.2,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.3,
            color: AppColors.inkSoft,
          ),
          labelSmall: const TextStyle(
            fontSize: 11.5,
            height: 1.2,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.5,
            color: AppColors.muted,
          ),
        );

    const fieldBorder = OutlineInputBorder(
      borderRadius: BorderRadius.all(Radius.circular(AppRadius.md)),
      borderSide: BorderSide(color: AppColors.line),
    );

    return base.copyWith(
      textTheme: text,
      primaryTextTheme: text,
      dividerTheme: const DividerThemeData(
        color: AppColors.line,
        thickness: 1,
        space: 1,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        foregroundColor: AppColors.ink,
        titleTextStyle: TextStyle(
          fontSize: 18,
          fontWeight: FontWeight.w700,
          color: AppColors.ink,
        ),
      ),
      cardTheme: const CardThemeData(
        color: AppColors.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(AppRadius.lg)),
          side: BorderSide(color: AppColors.line),
        ),
      ),
      inputDecorationTheme: const InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surface,
        border: fieldBorder,
        enabledBorder: fieldBorder,
        disabledBorder: fieldBorder,
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.all(Radius.circular(AppRadius.md)),
          borderSide: BorderSide(color: AppColors.forest, width: 1.6),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.all(Radius.circular(AppRadius.md)),
          borderSide: BorderSide(color: AppColors.clay),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.all(Radius.circular(AppRadius.md)),
          borderSide: BorderSide(color: AppColors.clay, width: 1.6),
        ),
        contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 15),
        labelStyle: TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w600,
          color: AppColors.inkSoft,
        ),
        hintStyle: TextStyle(fontSize: 14.5, color: AppColors.muted),
        errorStyle: TextStyle(fontSize: 12.5, color: AppColors.clay),
        errorMaxLines: 3,
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.forest,
          foregroundColor: AppColors.white,
          disabledBackgroundColor: AppColors.line,
          disabledForegroundColor: AppColors.muted,
          elevation: 0,
          minimumSize: const Size(0, 52),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.md),
          ),
          textStyle: const TextStyle(
            fontSize: 15.5,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.1,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.ink,
          minimumSize: const Size(0, 50),
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
          side: const BorderSide(color: AppColors.line, width: 1.2),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.md),
          ),
          textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: AppColors.forest,
          minimumSize: const Size(44, 44),
          padding: const EdgeInsets.symmetric(horizontal: 10),
          textStyle: const TextStyle(
            fontSize: 14.5,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
      iconTheme: const IconThemeData(color: AppColors.inkSoft, size: 22),
      navigationBarTheme: NavigationBarThemeData(
        height: 70,
        backgroundColor: AppColors.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        indicatorColor: AppColors.mint,
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        iconTheme: WidgetStateProperty.resolveWith(
          (states) => IconThemeData(
            size: 23,
            color: states.contains(WidgetState.selected)
                ? AppColors.forest
                : AppColors.muted,
          ),
        ),
        labelTextStyle: WidgetStateProperty.resolveWith(
          (states) => TextStyle(
            fontSize: 11.5,
            fontWeight: states.contains(WidgetState.selected)
                ? FontWeight.w800
                : FontWeight.w600,
            color: states.contains(WidgetState.selected)
                ? AppColors.forest
                : AppColors.muted,
          ),
        ),
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: AppColors.surface,
        surfaceTintColor: Colors.transparent,
        showDragHandle: true,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(
            top: Radius.circular(AppRadius.xl),
          ),
        ),
      ),
      dialogTheme: const DialogThemeData(
        backgroundColor: AppColors.surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(AppRadius.lg)),
        ),
      ),
      snackBarTheme: const SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: AppColors.ink,
        contentTextStyle: TextStyle(
          color: AppColors.white,
          fontSize: 14,
          height: 1.35,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(AppRadius.md)),
        ),
        insetPadding: EdgeInsets.fromLTRB(16, 0, 16, 18),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: AppColors.surface,
        selectedColor: AppColors.mint,
        side: const BorderSide(color: AppColors.line),
        labelStyle: const TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w600,
          color: AppColors.ink,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.pill),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: AppColors.forest,
        linearTrackColor: AppColors.line,
        circularTrackColor: AppColors.line,
      ),
    );
  }
}
