import 'package:flutter/material.dart';

import '../../core/theme.dart';

/// A small product picture. A quiet placeholder keeps the row aligned when the
/// catalogue item has no image or the image cannot load.
class ProductThumb extends StatelessWidget {
  const ProductThumb({super.key, this.image, this.size = 56});

  final String? image;
  final double size;

  @override
  Widget build(BuildContext context) {
    final source = image;
    return Container(
      width: size,
      height: size,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: AppColors.paper,
        borderRadius: BorderRadius.circular(AppRadius.sm),
      ),
      child: source == null
          ? Icon(
              Icons.inventory_2_outlined,
              size: size * 0.4,
              color: AppColors.muted,
            )
          : Image.network(
              source,
              fit: BoxFit.cover,
              errorBuilder: (context, error, stackTrace) => Icon(
                Icons.inventory_2_outlined,
                size: size * 0.4,
                color: AppColors.muted,
              ),
            ),
    );
  }
}
