import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/theme.dart';
import 'providers.dart';
import 'router.dart';

class CityCartStaffApp extends ConsumerStatefulWidget {
  const CityCartStaffApp({super.key});

  @override
  ConsumerState<CityCartStaffApp> createState() => _CityCartStaffAppState();
}

class _CityCartStaffAppState extends ConsumerState<CityCartStaffApp> {
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
      title: 'CityCart Staff',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      routerConfig: ref.watch(routerProvider),
    );
  }
}
