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
| Retry (ErrorState) | full pill (`px-[18px] py-[10px]`) | smaller pill (`px-[12px] py-[7px]`), still ≥44px target via min-height |
| `role` | `status` / `alert` | unchanged |
| Alignment | `text-left` | `text-left` |

**Rejected:** a separate `EmptyStatePanel` / `InlineError` component — would re-fork the very thing we consolidate (concept rejection list). One prop, one component.

**Rejected:** dropping the icon entirely in compact with no opt-in — `ErrorState` benefits from a 16px inline warning glyph for scannability; allow an optional inline icon but never the 48px block.

**Touch-target note (AQ-015):** compact retry button keeps `min-h-[44px]` at ≤1024px even though its visual padding is `py-[7px]` (same exemption pattern as the existing button — `// hearth-internal-padding`). The visible chrome stays compact; the hit area meets 44px.

### States covered

- **EmptyState compact** — populated-empty only (no loading/error; that's Skeleton/ErrorState).
- **ErrorState compact** — error with optional `onRetry`, optional `detail` (mono block stays but at 12px in compact).

### Stories to add

`EmptyState.stories.tsx`: add `Compact` and `CompactWithAction`. `ErrorState.stories.tsx`: add `Compact` and `CompactWithRetry`.

---

## Decision 2 — `ScopePicker` anatomy

### The problem (grounded)

The scope picker renders **two different shapes** across the 4 sites today, which is itself the inconsistency:

1. **Inline pill row** — `KnowledgeList.tsx:600` (filter: All / Shared / Team / Private) and `KnowledgeCreate.tsx:220` (create radiogroup: Shared / Team / Private). Both hardcode active tint `bg-[rgba(22,118,79,0.08)]` (= `--accent-primary-dim`), border `1.5px accent`, `px-[12px] py-[4px]`, `r-pill`, 12px/500.
2. **Dialog `Select` dropdown** — `ScopeChangeDialog.tsx:162` and `KnowledgeCreateDialog.tsx` use DaisyUI `<Select>` instead of pills.

AC: "The knowledge scope picker is one implementation rendered in all four locations… all four pixel-identical in chrome." So the **pill group is the canonical anatomy**; the two dialog Selects migrate to the pill group too.

### Approved anatomy — `ScopePicker` (DS Tier-1 primitive)

A horizontal pill group. Active pill = `--accent-primary-dim` background + `1.5px --accent-primary` border + `--accent-primary` text. Inactive = transparent + `1.5px --border-default` + `--text-secondary`. Disabled = inactive + `opacity-40` + `cursor-not-allowed`. Pills: `px-[12px] py-[4px]`, `r-pill`, 12px/500, gap `6px`, `flex-wrap`.

**Two modes (one component, parameter not fork):**

- `mode="select"` (default) — `role="radiogroup"`; single active option; `aria-checked` per pill; used by KnowledgeCreate, KnowledgeCreateDialog, ScopeChangeDialog.
- `mode="filter"` — same `role="radiogroup"`; supports a null/"All" selection (All pill present, active when value is null); used by KnowledgeList.

**Props contract (design level — architecture finalizes types):**

| Prop | Purpose |
|---|---|
| `options` | `{ id, label, disabled? }[]` — fed from `SCOPE_PILL_OPTIONS` / `SCOPE_CREATE_OPTIONS`; component never restates vocabulary |
| `value` | active option id (`string \| null`; null = "All" in filter mode) |
| `onChange(id)` | selection callback |
| `mode` | `"select" \| "filter"` |
| `ariaLabel` | radiogroup label ("Scope" / "Filter by scope") |
| `disabledTitle?` | tooltip for disabled pills (e.g. "Join a team to use team-scoped knowledge") |
| `dataTestId?` | passthrough; per-pill testid derives as `scope-pill-{id}` (filter) / `scope-pill-create-{id}` (select) to keep existing E2E selectors green |

**Critical: preserve existing data-testids.** KnowledgeList tests target `scope-pill-{id}` + `knowledge-scope-pills`; KnowledgeCreate targets `scope-pill-create-{id}`. The component must emit the right prefix per call site (pass via a `testIdPrefix` prop or `dataTestId` + derived suffix) so no behavioral test breaks. Architecture pins the exact prop.

**The locked-scope case** (KnowledgeCreateDialog `lockedScopeKind`) does **not** render ScopePicker — it renders a read-only `Tag` (already the behavior). ScopePicker is only for the choosable case. Do not fold locked-display into the picker.

### Tint fix rides along

All four sites currently hardcode `rgba(22,118,79,0.08)`. ScopePicker uses `--accent-primary-dim` (the token that already names that value). The hardcoded literal disappears from every call site.

### Touch targets (AQ-015)

Current pills are `py-[4px]` → ~24px tall. At ≤1024px each pill must reach ≥44px hit area. Approved: pills keep `py-[4px]` visual but gain `min-h-[44px]` at the mobile breakpoint (or wrap hit area), same pattern as other touched controls. Architecture specifies the responsive class.

### Stories

New `ScopePicker.stories.tsx`: `FilterMode` (with All), `SelectMode`, `WithDisabledOption` (Team disabled, tooltip), `MobileTouchTarget` (≤1024px frame).

---

## Open questions for architecture

1. **Single-bar Skeleton** — `BlockRefEmbed` needs one 32px bar; DS exports only `SkeletonList`/`SkeletonCard`. Decide: export a `Skeleton` single-bar primitive (cleanest — `ArtifactThreadsSummary` header bar also wants it), or use `SkeletonList rows={1}` with a height override. Recommend exporting `Skeleton` (one shape, two existing callers).
2. **ScopePicker testid strategy** — exact prop to keep `scope-pill-{id}` vs `scope-pill-create-{id}` selectors green.
3. **Compact retry hit-area** — confirm `min-h-[44px]` on the compact retry meets AQ-015 lint without tripping off-grid padding rules.
