import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// The CityCart shopper palette: warm paper, deep forest, and a confident clay
/// accent. The shopper app leads with photography and calm cards, so surfaces
/// are quieter than the staff app and the accent is reserved for prices and
/// one action per screen.
class AppColors {
  const AppColors._();

  static const paper = Color(0xFFFBF4EA);
  static const paperDeep = Color(0xFFF3E9DA);
  static const surface = Color(0xFFFFFDF9);
  static const surfaceMuted = Color(0xFFFAF5EC);
  static const ink = Color(0xFF241F18);
  static const inkSoft = Color(0xFF4C443A);
  static const muted = Color(0xFF7C7265);
  static const line = Color(0xFFE7DAC7);
  static const lineStrong = Color(0xFFD6C3A8);

  static const forest = Color(0xFF2F4A3C);
  static const forestDeep = Color(0xFF22382E);
  static const sage = Color(0xFFE1E9DC);
  static const sageInk = Color(0xFF3F6B52);

  static const clay = Color(0xFFD1542F);
  static const claySoft = Color(0xFFF7E0D6);

  static const gold = Color(0xFFC99A4B);
  static const goldSoft = Color(0xFFF6E8CC);
  static const goldInk = Color(0xFF7A5512);

  static const danger = Color(0xFF9B2C2C);
  static const dangerSoft = Color(0xFFF7DEDA);

  static const info = Color(0xFF2F5570);
  static const infoSoft = Color(0xFFDCE8F0);

  static const white = Color(0xFFFFFFFF);
}

class AppRadius {
  const AppRadius._();
  static const card = 22.0;
  static const field = 16.0;
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
        fontSize: 40,
        height: 1.04,
        fontWeight: FontWeight.w700,
        letterSpacing: -1.1,
        color: AppColors.ink,
      ),
      displayMedium: const TextStyle(
        fontSize: 32,
        height: 1.08,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.7,
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
        letterSpacing: 1.2,
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
          vertical: 16,
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
