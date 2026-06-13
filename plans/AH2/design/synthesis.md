# Synthesis (routine — single variant)

Single variant "Constrained selectors" is the locked direction (8.5/10). No sibling variants to pull from — routine class.

**Strongest base:** the variant itself — it ships entirely inside the existing component budget (zero new shapes, only a free-text→`Select` swap) and satisfies all five ACs by construction.

**Build-time refinements carried into `approved.md`:**
- Use `StatusChip status="warning"` for the unavailable-harness flag, NOT a literal `●` bullet (avoids AQ-105 emoji/icon-in-chip risk seen in the mockup).
- The two new `Select`s must hit ≥16px font at ≤768px (AQ-005).

**Explicitly rejected (see rejected.md):** per-agent provider control, combined model+harness preset, removing Settings → Models, free-text+typeahead harness, modal edit. These are settled — `/architecture` and `/write-code` must not reintroduce them.
