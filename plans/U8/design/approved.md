# U8 Design Approved

**Variant:** 1 (routine restyle, single variant)
**Score:** 8.4 / 10
**Date:** 2026-05-31

Variant 1 is approved for implementation. The token migration map is complete, cross-cutting patterns are well-defined, and all components have explicit Hearth treatments specified.

## Advisory notes for the builder

1. HeadingPayload h3-h6: consider mapping to type-scale tokens (`--text-lg`, `--text-base`, `--text-sm`, `--text-xs`) instead of hardcoded pixel values, unless the specified values (18px/16px/15px/13px) are deliberate Hearth overrides.

2. Composer send button: verify that the disabled state gets a Hearth-consistent treatment.

3. NotificationRow: implement all three status signals per AC (left border, icon circle, StatusChip dot). If the visual result is too dense, flag for follow-up refinement.
