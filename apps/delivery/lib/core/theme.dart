import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// The CityCart palette: warm paper, deep forest, and one confident clay accent.
/// It is deliberately calmer than a dashboard: the rider is outdoors, often in
/// bright light, and needs one thing to stand out at a time.
class AppColors {
  const AppColors._();

  static const paper = Color(0xFFF5F0E6);
  static const paperDeep = Color(0xFFEDE4D4);
  static const surface = Color(0xFFFFFDF8);
  static const ink = Color(0xFF201C17);
  static const inkSoft = Color(0xFF4B443B);
  static const muted = Color(0xFF7A7064);
  static const line = Color(0xFFE4D8C5);
  static const lineStrong = Color(0xFFD3C2A9);

  static const forest = Color(0xFF1E3A2F);
  static const forestDeep = Color(0xFF152A22);
  static const sage = Color(0xFFDCE7D5);
  static const sageInk = Color(0xFF3E6A51);

  static const clay = Color(0xFFB6472A);
  static const claySoft = Color(0xFFF4DFD6);

  static const amber = Color(0xFFF6E6C3);
  static const amberInk = Color(0xFF7A5512);

  static const danger = Color(0xFF9B2C2C);
  static const dangerSoft = Color(0xFFF6DEDB);
  static const white = Color(0xFFFFFFFF);
}

class AppRadius {
  const AppRadius._();
  static const card = 20.0;
  static const field = 14.0;
  static const button = 16.0;
  static const pill = 999.0;
}

class AppTheme {
  const AppTheme._();

  static ThemeData get light {
    const scheme = ColorScheme(
      brightness: Brightness.light,
      primary: AppColors.forest,
      onPrimary: AppColors.white,
      secondary: AppColors.clay,
      onSecondary: AppColors.white,
      error: AppColors.danger,
      onError: AppColors.white,
      surface: AppColors.surface,
      onSurface: AppColors.ink,
    );

    final base = ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: AppColors.paper,
      splashFactory: InkSparkle.splashFactory,
    );

    final text = base.textTheme.copyWith(
      displayLarge: const TextStyle(
        fontSize: 44,
        height: 1.02,
        fontWeight: FontWeight.w700,
        letterSpacing: -1.4,
        color: AppColors.ink,
      ),
      displayMedium: const TextStyle(
        fontSize: 34,
        height: 1.05,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.9,
        color: AppColors.ink,
      ),
      headlineMedium: const TextStyle(
        fontSize: 26,
        height: 1.15,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.5,
        color: AppColors.ink,
      ),
      headlineSmall: const TextStyle(
        fontSize: 21,
        height: 1.2,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.3,
        color: AppColors.ink,
      ),
      titleLarge: const TextStyle(
        fontSize: 18,
        height: 1.25,
        fontWeight: FontWeight.w600,
        color: AppColors.ink,
      ),
      titleMedium: const TextStyle(
        fontSize: 16,
        height: 1.3,
        fontWeight: FontWeight.w600,
        color: AppColors.ink,
      ),
      bodyLarge: const TextStyle(
        fontSize: 16,
        height: 1.45,
        fontWeight: FontWeight.w400,
        color: AppColors.inkSoft,
      ),
      bodyMedium: const TextStyle(
        fontSize: 14.5,
        height: 1.45,
        fontWeight: FontWeight.w400,
        color: AppColors.inkSoft,
      ),
      bodySmall: const TextStyle(
        fontSize: 13,
        height: 1.4,
        fontWeight: FontWeight.w400,
        color: AppColors.muted,
      ),
      labelLarge: const TextStyle(
        fontSize: 15,
        height: 1.2,
        fontWeight: FontWeight.w600,
        color: AppColors.ink,
      ),
      labelSmall: const TextStyle(
        fontSize: 11,
        height: 1.2,
        fontWeight: FontWeight.w700,
        letterSpacing: 1.3,
        color: AppColors.muted,
      ),
    );

    return base.copyWith(
      textTheme: text,
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.paper,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        foregroundColor: AppColors.ink,
        systemOverlayStyle: SystemUiOverlayStyle.dark,
        titleTextStyle: TextStyle(
          fontSize: 17,
          fontWeight: FontWeight.w600,
          color: AppColors.ink,
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.forest,
          foregroundColor: AppColors.white,
          disabledBackgroundColor: AppColors.lineStrong,
          disabledForegroundColor: AppColors.surface,
          minimumSize: const Size(64, 54),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.button),
          ),
          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: AppColors.forest,
          textStyle: const TextStyle(fontWeight: FontWeight.w600),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surface,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 17,
        ),
        labelStyle: const TextStyle(color: AppColors.muted, fontSize: 14.5),
        hintStyle: const TextStyle(color: AppColors.muted, fontSize: 15),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.field),
          borderSide: const BorderSide(color: AppColors.line, width: 1.2),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.field),
          borderSide: const BorderSide(color: AppColors.line, width: 1.2),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.field),
          borderSide: const BorderSide(color: AppColors.forest, width: 1.6),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.field),
          borderSide: const BorderSide(color: AppColors.danger, width: 1.2),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.field),
          borderSide: const BorderSide(color: AppColors.danger, width: 1.6),
        ),
      ),
      dividerTheme: const DividerThemeData(
        color: AppColors.line,
        thickness: 1,
        space: 1,
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: AppColors.forestDeep,
        contentTextStyle: const TextStyle(
          color: AppColors.white,
          fontSize: 14.5,
        ),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        insetPadding: const EdgeInsets.all(16),
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: AppColors.surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(26)),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: AppColors.surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
        titleTextStyle: const TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.w700,
          color: AppColors.ink,
        ),
        contentTextStyle: const TextStyle(
          fontSize: 15,
          height: 1.45,
          color: AppColors.inkSoft,
        ),
      ),
    );
  }
}
