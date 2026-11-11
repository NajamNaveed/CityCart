import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/theme.dart';
import 'providers.dart';
import 'router.dart';

class CityCartDeliveryApp extends ConsumerStatefulWidget {
  const CityCartDeliveryApp({super.key});

  @override
  ConsumerState<CityCartDeliveryApp> createState() =>
      _CityCartDeliveryAppState();
}

class _CityCartDeliveryAppState extends ConsumerState<CityCartDeliveryApp> {
  @override
  void initState() {
    super.initState();
    // Restore in the background: the splash disappears as soon as the stored
    // session (or its absence) is known.
    Future.microtask(() {
      if (mounted) ref.read(sessionProvider).restore();
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'CityCart Delivery',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      routerConfig: ref.watch(routerProvider),
    );
  }
}
