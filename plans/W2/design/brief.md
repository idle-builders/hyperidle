# W2 Design Brief

DESIGN-CLASS: routine  ref=all-existing-components  pattern=all-html-refs-from-W1

## Classification Rationale

Both axes match strongly. Every component has an existing HTML reference file that defines the exact target pixel output. The TSX implementations either exist (Tier 1-3 components) or will be created to match existing HTML (Tier 0 primitives). This is not exploratory design -- the design is done. W1 produced the HTML. W2 produces the TSX that matches it.

The "variant" in this workpackage is the implementation *strategy*, not the visual outcome. The visual outcome is fixed: match the HTML.

## Interrogation (Phase 0)

Three probes, all settled by the spec and existing codebase:

**1. What is the density removal scope?**

The density system spans five packages: tokens.css (3 `[data-density]` blocks), web hooks (useDensity, useAutoDensity), web tests (density-toggle.spec.ts, responsive-density.spec.ts, auto-density.test.tsx, useDensity.test.ts), design-system test (density-tier.test.ts), eslint-plugin-design (density-allowlist.json, use-density-tokens.ts, no-density-tokens.ts rules), SettingsAppearance (density select UI), and ~40 `var(--density-*)` references in TSX components across design-system and web packages. AESTHETICS.md AQ-003 now says "There is no density system" -- confirming the removal is an explicit design decision, not just cleanup.

**2. What replaces density tokens in TSX components?**

The HTML files use literal values from the Hearth 6px grid (`--space-*` tokens). `_tokens.css` defines single "default tier" density tokens with values that differ from `tokens.css`'s default tier (e.g., `_tokens.css` has `--density-pad-x: 18px` vs `tokens.css`'s `16px`; `--density-avatar-size: 30px` vs `32px`). The _tokens.css values are the Hearth-intended sizes from 03-hearth.html. After density removal, components either use `--space-*` tokens directly or use the literal Hearth sizes from the HTML references.

**3. What is the token sync direction?**

`_tokens.css` (HTML side) is the source of truth for Hearth-intended values. `tokens.css` (TSX side) must be synced TO match `_tokens.css` for all shared tokens (radii, motion, typography, spacing, colors). The density blocks in `tokens.css` get removed entirely. The `--tracking-caps` value differs (`_tokens.css` has 0.02em; `tokens.css` has 0.08em). `tokens.css` also has `--tracking-caps-sm: 0.06em` which `_tokens.css` lacks. The HTML files actually use 0.08em inline in components (03-hearth.html). The `_tokens.css` 0.02em is stale -- `tokens.css` is correct here. Token sync is bidirectional where _tokens.css is stale: _tokens.css gets updated to match the tracking-caps values.

Additionally, `_tokens.css` lacks the `--easing-expressive` token mentioned in DESIGN.md (the toggle thumb easing `cubic-bezier(0.34, 1.56, 0.64, 1)`). Neither file has it as a named token -- it's used inline in Toggle.html. W2 should add it as a named token to both files.

## What This Design Covers

1. **Density strip** -- complete removal of the 3-tier density system infrastructure
2. **Token sync** -- `_tokens.css` and `tokens.css` converge to zero drift
3. **10 new Tier 0 TSX primitives** -- Avatar, AvatarGroup, Button, Input, Select, Toast, TabBar, Toggle, Checkbox, Progress (Tooltip deferred -- it's positioning-heavy and not consumed by other components in W2)
4. **Existing TSX updates** -- all Tier 1-3 components updated to match W1 HTML
5. **Page-level assembly** -- pages match W1 screen mockups
6. **ds:sync wiring** -- the `sync-check` script gets wired as a npm script

## What This Design Does NOT Cover

- New domain concepts (none introduced)
- New interaction patterns (all exist in HTML already)
- New pages or routes (all screens exist in the current app architecture)
- Tooltip TSX (positioning logic is a separate concern; Tooltip HTML exists but it's not consumed by other W2 components)
