# Concept Verification: U3 — Hearth Token System (Light + Dark)

**Workpackage:** U3
**Status:** Verified (inherits from U0)
**Date:** 2026-05-29

---

## Verification

U3 introduces no new nouns. It implements **Noun 4: Hearth Theme** as locked in `plans/U0/concept.md` (status: Locked, date: 2026-05-29).

The Hearth Theme concept defines:

- **4 surface tokens** (page, container, elevated, overlay) replacing Lucid's 7-stop surface ladder (surface-0..6)
- **5 text tokens** (primary, secondary, tertiary, placeholder, on-accent) replacing Lucid's 3-tier text (hi, mid, lo)
- **2 accent tokens** (primary=#16764f, secondary=#d97706) replacing Lucid's single primary
- **4 status tokens** (success, warning, error, info) — chromatic, replacing Lucid's monochrome status
- **3 border color tokens** (subtle, default, strong) — solid warm colors, replacing Lucid's alpha-based borders
- **3 shadow tokens** (subtle, default, elevated) — warm-tinted, active on cards
- **4 radius tokens** (none, subtle=10px, default=16px, pill=9999px) — generous, replacing Lucid's 5-stop scale
- **8 spacing tokens** on 6px grid (3/6/9/12/18/24/36/48px) — replacing 4px grid
- **Typography** — system-ui stack, 4 weights (400/500/600/700), 7 sizes (12/13/15/17/20/24/30px)
- **Motion** — gentler (120/240/450ms), new easing curve
- **3 border width tokens** (thin=1px, default=1.5px, strong=2.5px) — new category
- **Density presets** — rebuilt on 6px grid

All token names, values, and contracts are defined in U0 Noun 4. No concept work needed for U3.

### Constraints carried forward

- No cool grays in any token value (hard rule)
- Shadows active on cards at rest (hard rule)
- Status uses 4 distinct colors (hard rule)
- Token names are a closed set (contract)
- This is a breaking change — all consumers must update (contract)

### What U3 does NOT do

- Does not map tokens to DaisyUI variables (U4)
- Does not restyle components (U7-U9)
- Does not update Tailwind config (U4)
- Does not introduce new domain concepts
