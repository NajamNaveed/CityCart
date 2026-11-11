import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/theme.dart';
import 'providers.dart';
import 'router.dart';

class CityCartShopperApp extends ConsumerStatefulWidget {
  const CityCartShopperApp({super.key});

  @override
  ConsumerState<CityCartShopperApp> createState() => _CityCartShopperAppState();
}

class _CityCartShopperAppState extends ConsumerState<CityCartShopperApp> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      if (mounted) ref.read(sessionProvider).restore();
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'CityCart',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      routerConfig: ref.watch(routerProvider),
    );
  }
}
