# AI5 — Design (approved)

```
DESIGN-CLASS: routine  ref=EmptyState,ErrorState,Skeleton,scope-pill-row  pattern=EmptyState.html,ErrorState.html
```

Single-variant ratification. The primitives' look is locked; this decides only the **extension shapes**. No 3-variant exploration (both pieces extend named components with embodied patterns already in tree). Grounded in the verified bypass sites.

## Reuse inventory

| Need | Existing component | Action |
|---|---|---|
| Panel loading bar | `SkeletonList` / `SkeletonCard` (DS) | adopt; add single-bar affordance (see Skeleton note) |
| Panel empty moment | `EmptyState` (DS) | **extend** — add `compact` |
| Panel error moment | `ErrorState` (DS) | **extend** — add `compact` |
| Scope pill group | hand-rolled in 4 files | **NEW** `ScopePicker` (consolidation — see concept) |
| Initials | `.slice(0,2)` ×5 inline | **NEW** `deriveInitials` util |
| Identity chip | `Avatar` (DS) | adopt everywhere |

`ScopePicker` and `deriveInitials` are `NEW` only because no DS export renders them today — both are pure consolidations of existing copy-paste, not invented shapes. Their justification is in `concept.md`.

---

## Decision 1 — Compact `EmptyState` / `ErrorState`

### The problem (grounded)

The full primitives are page-scale: `EmptyState` is `p-[36px] max-w-[420px]` with a 48×48 icon container and 20px/600 title + 15px description; `ErrorState` adds `shadow-default` + `surface-elevated`. Panel contexts can't carry that mass. Today they hand-roll one-liners instead:

- `ArtifactThreadsSummary.tsx:83` → `No artifact discussions yet.` (plain text, `px-3 py-2`).
- `SessionActivityPanel.tsx:269` → `No activity yet` (plain).
- `BlockRefEmbed.tsx` → bare error/missing rows, `px-3 py-2` bordered.

The hand-rolled versions have no icon, no shadow, single line, 13px. The compact variant **embodies exactly that** so the holdouts have a primitive to reach for.

### Approved anatomy — `compact` boolean prop on both components

A single `compact?: boolean` (default `false`). When `true`:

| Dimension | Full (default) | Compact |
|---|---|---|
| Padding | `p-[36px]` | `p-[18px]` (`--space-6`) |
| Max width | `max-w-[420px]` / `440px` | none (fills panel) |
| Surface (EmptyState) | `surface-page` | `surface-page` (unchanged) |
| Surface + shadow (ErrorState) | `surface-elevated` + `shadow-default` | `surface-page`, **no shadow** (inline, not floating) |
| Icon container | 48×48 tinted | **omitted** (compact never renders the 48px block; a small inline 16px icon may sit before the title if `icon` passed) |
| Title | 20px/600 | 15px/600 |
| Description | 15px, `mb-[18px]` | 13px, `mb-[12px]` |
| Action (EmptyState) | pill button | unchanged, but `mb` tightened |
| Retry (ErrorState) | full pill (`px-[18px] py-[10px]`) | smaller pill (`px-[12px] py-[7px]`), `min-h-[44px] xl:min-h-[30px]` (44px touch floor ≤1024px, dense inline ≥1280px — see touch note) |
| `role` | `status` / `alert` | unchanged |
| Alignment | `text-left` | `text-left` |

**Rejected:** a separate `EmptyStatePanel` / `InlineError` component — would re-fork the very thing we consolidate (concept rejection list). One prop, one component.

**Rejected:** dropping the icon entirely in compact with no opt-in — `ErrorState` benefits from a 16px inline warning glyph for scannability; allow an optional inline icon but never the 48px block.

**Touch-target note (AQ-015) — same mechanism as ScopePicker:** the compact retry button uses `min-h-[44px] xl:min-h-[30px]` (not a bare `min-h-[44px]`). At ≤1024px the 44px floor satisfies the K8 gate; at `xl:` (≥1280px) it returns to its natural ~30px compact height so it reads as an *inline* control inside the 18px-padded panel, not a floating slab. Visual padding stays `py-[7px]` (`// hearth-internal-padding`). This mirrors `Select.tsx:44` `@lore AG5 fix-1` — chosen over a `::after` overlay because the K8 gate measures the live bounding box at a fine-pointer 1024px viewport.

### States covered

- **EmptyState compact** — populated-empty only (no loading/error; that's Skeleton/ErrorState).
- **ErrorState compact** — error with optional `onRetry`, optional `detail` (mono block stays but at 12px in compact).

### Stories to add

`EmptyState.stories.tsx`: add `Compact` and `CompactWithAction`. `ErrorState.stories.tsx`: add `Compact` and `CompactWithRetry`.

---

## Decision 2 — `ScopePicker` anatomy

### The problem (grounded)

The scope picker renders **two different shapes** across the 4 sites today, which is itself the inconsistency. **Re-verified against the tree (CC-007 correction): the split is 3 pill rows + 1 Select, NOT 2 + 2.**

1. **Inline pill row (3 sites)** — `KnowledgeList:599` (filter: All / Shared / Team / Private), `KnowledgeCreate:220` (create: Shared / Team / Private), and **`KnowledgeCreateDialog:192` (create: Shared / Team / Private) — already a hand-rolled pill `radiogroup`, NOT a Select**. All three hardcode active tint `bg-[rgba(22,118,79,0.08)]` (= `--accent-primary-dim`), border `1.5px accent`, `px-[12px] py-[4px]`, `r-pill`, 12px/500, and carry `data-active` + `aria-checked`.
2. **Dialog `Select` dropdown (1 site)** — only `ScopeChangeDialog:162` uses DaisyUI `<Select>`.

AC: "The knowledge scope picker is one implementation rendered in all four locations… all four pixel-identical in chrome." So the **pill group is the canonical anatomy**: the 3 hand-rolled pill rows consolidate into ScopePicker (also killing 3 tint literals), and the 1 Select migrates to the pill group too.

### Approved anatomy — `ScopePicker` (DS Tier-1 primitive)

A horizontal pill group. States (now complete — **focus added**):

| State | Treatment |
|---|---|
| Active | `--accent-primary-dim` bg + `1.5px --accent-primary` border + `--accent-primary` text |
| Inactive | transparent bg + `1.5px --border-default` border + `--text-secondary` text |
| Disabled | inactive + `opacity-40` + `cursor-not-allowed` + `aria-disabled` |
| **Focus** | `focus-visible` 2px outset ring on `--accent-primary`, `outline-offset-[2px]` (Button/`clickable.ts` convention). The hand-rolled pills ship no focus ring today — migration MUST add it (fixes a latent a11y defect; do NOT carry `outline:none` forward). |

Pills: `px-[12px] py-[4px]`, `r-pill`, 12px/500, gap `6px`, `flex-wrap`.

**Two modes (one component, parameter not fork):**

- `mode="select"` (default) — `role="radiogroup"`; single active option; `aria-checked` per pill; used by KnowledgeCreate, KnowledgeCreateDialog, ScopeChangeDialog (3 of 4 sites).
- `mode="filter"` — same `role="radiogroup"`; supports a null/"All" selection (All pill present, active when value is null); used by KnowledgeList (1 site).

**Props contract (design level — architecture finalizes types):**

| Prop | Purpose |
|---|---|
| `options` | `{ id, label, disabled? }[]` — fed from `SCOPE_PILL_OPTIONS` / `SCOPE_CREATE_OPTIONS`; component never restates vocabulary |
| `value` | active option id (`string \| null`; null = "All" in filter mode) |
| `onChange(id)` | selection callback |
| `mode` | `"select" \| "filter"` |
| `ariaLabel` | radiogroup label ("Scope" / "Filter by scope") |
| `disabledTitle?` | tooltip for disabled pills (single string — closure: only "team" is ever disabled, one reason; a future per-option-reason caller would need a richer prop, noted so no one assumes per-option today) |
| `testIdPrefix` (required) | per-pill testid = `${testIdPrefix}-${id}`; one of the 4 mapped prefixes below |
| `dataTestId?` | container testid passthrough (e.g. `knowledge-scope-pills`) |

**Critical: preserve existing data-testids — all 4 prefixes (re-verified in tree).** The earlier draft enumerated only 2 prefixes; the tree has 3 existing + 1 site with none:

| Call site | `testIdPrefix` | tests asserting it |
|---|---|---|
| `KnowledgeList:599` (filter) | `scope-pill` | `U9-knowledge-scope-pills`, `AD6-knowledge-simplification`, `W3-knowledge` |
| `KnowledgeCreate:220` | `scope-pill-create` | `KnowledgeCreate.af13`, `AD6-knowledge-simplification` |
| `KnowledgeCreateDialog:192` | `scope-pill-dialog` | `AD3-KnowledgeCreateDialog-scope` |
| `ScopeChangeDialog:162` (was Select) | `scope-pill-change` (NEW) | none today; red-phase adds one |

ScopePicker MUST also emit `data-active={isActive}` per pill — `AD6-knowledge-simplification` asserts it. Architecture pins the exact prop + the per-site mapping.

**The locked-scope case** (KnowledgeCreateDialog `lockedScopeKind`) does **not** render ScopePicker — it renders a read-only `Tag` (already the behavior). ScopePicker is only for the choosable case. Do not fold locked-display into the picker.

### Tint fix rides along

All four sites currently hardcode `rgba(22,118,79,0.08)`. ScopePicker uses `--accent-primary-dim` (the token that already names that value). The hardcoded literal disappears from every call site.

### Touch targets (AQ-015) — mechanism SHOWN, not just asserted

Current pills are `py-[4px]` → ~24px tall. The design critique correctly flagged that a bare `min-h-[44px]` would make a 44px-tall lozenge at all widths — breaking the dense row AND AC4's "all four pixel-identical in chrome" (desktop would diverge from mobile).

**Approved mechanism (verified against the canonical Hearth pattern, `Select.tsx:44` `@lore AG5 fix-1`):** `min-h-[44px] xl:min-h-[24px]`.
- The 44px floor holds at every viewport **up to and including 1024px** — which is exactly where the AQ-015 K8 e2e gate (`packages/web/e2e/touch-targets.spec.ts`) measures `getBoundingClientRect()`. (Tailwind `lg:` = `min-width:1024px` applies AT 1024 and would prematurely shrink the pill, so the override uses `xl:` = 1280px+.)
- At `xl:` (desktop ≥1280px) the pill returns to its dense 24px height → the filter row (KnowledgeList, in a `pt-[12px]` header) and the create rows render identically dense, and all four ScopePicker sites are pixel-identical at the same breakpoint.

**Why not `[@media(pointer:coarse)]` or a `::before` overlay:** the K8 gate runs at viewport 1024px with a *fine* pointer (Playwright Chromium default), so a coarse-pointer query would not satisfy it; a pseudo-element overlay is harder to prove via `getBoundingClientRect()`. The viewport `xl:` override is the proven, gate-passing approach already shipped by `Select`/`Composer`/`BlockHandle`.

### Stories

New `ScopePicker.stories.tsx`: `FilterMode` (with All), `SelectMode`, `WithDisabledOption` (Team disabled, tooltip), `Focused` (focus ring visible — regression-checks the new focus state), `MobileTouchTarget` (1024px frame, 44px verified; render an xl frame too to show the dense desktop height).

---

## Open questions for architecture — RESOLVED (round 1)

1. **Single-bar Skeleton** — RESOLVED: export a `Skeleton` single-bar primitive (cleanest — `ArtifactThreadsSummary` + `BlockRefEmbed` both want it). Architecture E1.
2. **ScopePicker testid strategy** — RESOLVED: required `testIdPrefix` prop; 4-site mapping pinned (`scope-pill` / `scope-pill-create` / `scope-pill-dialog` / `scope-pill-change`) + `data-active` preserved. See §props table + architecture E4.
3. **Compact retry hit-area** — RESOLVED: `min-h-[44px] xl:min-h-[30px]` (viewport-scoped, not bare min-h; not a pseudo-overlay). Same mechanism as ScopePicker pills. `py-[7px]` is `// hearth-internal-padding` exempt, so no off-grid lint trip. See touch-target note.
