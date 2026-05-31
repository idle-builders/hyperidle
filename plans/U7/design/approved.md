# U7 Design — Tier 1 Primitives Restyle (Approved)

```
DESIGN-CLASS: routine  ref=StatusChip,Tag,NavItem,SearchField,Skeleton,EmptyState,ErrorState,KeyValue  pattern=all-8-html-files
```

## Summary

Migrate all 8 Tier 1 primitives from Lucid tokens to Hearth tokens. This is a systematic token swap + radius/color upgrade, not a structural redesign. Both HTML references and TSX implementations change in lockstep.

---

## Token Migration Map

### Colors

| Lucid Token | Hearth Token | Notes |
|---|---|---|
| `--ok` | `--status-success` | Forest green (light: #16764f, dark: #2eaa7a) |
| `--warn` | `--status-warning` | Amber (#d97706 both modes) |
| `--danger` | `--status-error` | Red (light: #dc4a3a, dark: #ee6a5a) |
| `--primary` | `--accent-primary` | Forest green (light: #16764f, dark: #2eaa7a) |
| `--primary-dim` | `--accent-primary-dim` | 8%/10% tint |
| `--text-hi` | `--text-primary` | Warm dark/light (#2c241a / #ede5d8) |
| `--text-mid` | `--text-secondary` | Mid-tone (#6b5d4d / #a89880) |
| `--text-lo` | `--text-tertiary` | Decorative/hint (#9a8d7e / #9a8e7e) |
| (no equivalent) | `--text-placeholder` | Placeholder-only (#bfb5a5 / #5a5048) |
| `--surface-0` | `--surface-page` | Page background |
| `--surface-2` | `--surface-container` | Hover states, sheets |
| `--surface-3` | `--surface-container` | Main content area |
| `--surface-4` | `--surface-elevated` | Selected states |
| `--surface-5` | `--surface-elevated` | Skeleton bars, button bg |
| `--surface-ghost` | `color-mix(in oklab, var(--text-secondary) 8%, transparent)` | Ghost fills |

### Radii

| Lucid Token | Hearth Token | Value |
|---|---|---|
| `--r0` | `--r-none` | 0 |
| `--r1` | `--r-subtle` | 10px |
| `--r2` | `--r-default` | 16px |
| `--r-pill` | `--r-pill` | 9999px |

### Typography

| Lucid Token | Hearth Token | Value |
|---|---|---|
| `--ui` | `--font-sans` | system-ui stack |
| `--mono` | `--font-mono` | ui-monospace stack |
| `font-heading` (TW class) | `font-[family-name:var(--font-mono)]` | Mono for labels |

### Borders

| Lucid Token | Hearth Token | Notes |
|---|---|---|
| `--border-subtle` | `--border-subtle` | Same semantic name, different values |
| `--border-default` | `--border-default` | Warm tones in Hearth |
| `--border-emphasis` | `--border-strong` | Strongest border |

### Motion

Motion tokens are unchanged between Lucid and Hearth at the component level. `--motion-fast`, `--motion-default`, `--motion-slow` already exist in Hearth. The easing changes from Material (`0.2, 0, 0, 1`) to Hearth (`0.25, 0.1, 0.25, 1`), already wired as `--motion-ease`.

---

## Per-Component Design Spec

### 1. StatusChip

**Type**: Keep `Status = "healthy" | "behind" | "blocked" | "paused" | "done" | "error"`. No type change.

**Color mapping** (monochrome to 4-color):

| Status | Chip Background | Text + Dot Color |
|---|---|---|
| healthy | `color-mix(in oklab, var(--status-success) 14%, transparent)` | `--status-success` |
| behind | `color-mix(in oklab, var(--status-warning) 14%, transparent)` | `--status-warning` |
| blocked | `color-mix(in oklab, var(--status-error) 14%, transparent)` | `--status-error` |
| paused | `color-mix(in oklab, var(--status-info) 14%, transparent)` | `--status-info` |
| done | `color-mix(in oklab, var(--status-success) 14%, transparent)` | `--status-success` |
| error | `color-mix(in oklab, var(--status-error) 14%, transparent)` | `--status-error` |
| unknown | `color-mix(in oklab, var(--text-tertiary) 14%, transparent)` | `--text-tertiary` |

**Shape**: Already pill-shaped (`rounded-full` / `border-radius: var(--r-pill)`). No change.

**Typography**: `font-[family-name:var(--font-mono)]` (replacing `font-heading`). Size 11px, tracking 0.05em, uppercase, weight 500. Unchanged from current.

**Density**: Density-static (no density tokens). Confirmed by K10/K11 audit.

### 2. Tag

**Shape change**: `--r2` (8px) to `--r-pill` (9999px). AC explicitly requires pill-shaped.

**Kind tints** (using Hearth tokens, same color-mix percentages):

| Kind | Background | Text Color |
|---|---|---|
| neutral (no kind) | `color-mix(in oklab, var(--text-secondary) 8%, transparent)` | `--text-secondary` |
| pattern | `color-mix(in oklab, var(--text-secondary) 12%, transparent)` | `--text-secondary` |
| decision | `color-mix(in oklab, var(--accent-primary) 14%, transparent)` | `--accent-primary` |
| failure | `color-mix(in oklab, var(--status-error) 16%, transparent)` | `--status-error` |

**Typography**: `font-[family-name:var(--font-sans)]` (replacing `font-[family-name:var(--ui)]`). Size 12px, weight 400, line-height 1.4. Unchanged.

**Density**: Density-static. No density tokens.

### 3. NavItem

**Radius**: `--r1` (4px) to `--r-subtle` (10px). AC: "rounded-10px corners".

**Colors**:
- Text: `--text-primary` (replacing `--text-hi`)
- Icon default: `--text-tertiary` (replacing `--text-lo`)
- Icon selected: `--accent-primary` (replacing `--primary`)
- Selected background: `--surface-elevated` (replacing `--surface-4`)
- Selected left border: `--accent-primary` (replacing `--primary`)
- Hover background: `--accent-primary-dim` (replacing `--surface-2`). AC: "warm hover states".
- Count badge bg: `color-mix(in oklab, var(--text-secondary) 8%, transparent)` (replacing `--surface-ghost`)
- Count badge text: `--text-secondary` (replacing `--text-mid`)
- Count badge font: `font-[family-name:var(--font-mono)]` (replacing `font-[var(--mono)]`)

**Status dot support** (new prop): Add optional `statusDot?: "success" | "warning" | "error" | "info"` prop. When provided, renders a 6px colored dot (same as StatusChip dot) to the right of the label, before the count badge. Uses `--status-success/warning/error/info` respectively.

**Density**: NavItem is density-aware (pad-x, pad-y, row-h, text from density tokens). No change to density wiring.

### 4. SearchField

**Radius**: `--r2` (8px) to `--r-default` (16px). AC: "16px border-radius".

**Colors**:
- Background: `--surface-container` (replacing `--surface-3`)
- Focus background: `--surface-page` (replacing `--surface-2`). Lighter on focus to create contrast.
- Border default: `--border-default` (replacing `transparent`). AC: "warm border colors".
- Focus border: `--accent-primary` (replacing `--primary`). AC: "forest green focus ring".
- Focus ring/shadow: `0 0 0 3px var(--accent-primary-dim)`. AC: "3px green shadow ring".
- Text: `--text-primary` (replacing `--text-hi`)
- Placeholder: `--text-placeholder` (replacing `--text-lo`). AC specifies `--text-placeholder`.
- Icon: `--text-tertiary` (replacing `--text-lo`)
- Spinner border: `--border-default` (replacing `--surface-5`)
- Spinner active: `--accent-primary` (replacing `--primary`)
- Clear button text: `--text-tertiary` (replacing `--text-lo`)
- Clear button hover bg: `color-mix(in oklab, var(--text-secondary) 8%, transparent)` (replacing `--surface-ghost`)
- Clear button hover text: `--text-secondary` (replacing `--text-mid`)
- Kbd bg: `--surface-elevated` (replacing `--surface-5`)
- Kbd text: `--text-tertiary` (replacing `--text-lo`)
- Kbd font: `font-[family-name:var(--font-mono)]` (replacing `font-[var(--mono)]`)

**Typography**: `font-[family-name:var(--font-sans)]` (replacing `font-[var(--ui)]`). Size 13px. Unchanged.

### 5. Skeleton

**Background**: `--surface-container` (replacing `--surface-5`). AC: "warm cream backgrounds (not dark surfaces)". In light mode this is #ede7db (warm cream). In dark mode #231e16 (warm earth).

**Card background**: `--surface-elevated` (replacing `--surface-3`). Cards sit on an elevated surface.

**Radius**: Already uses `--r2` which maps to `--r-default` (16px). Correct for Hearth.

**Animation**: `skeleton-pulse` keyframes unchanged. Duration 1.8s ease-in-out. Already defined in tokens.css.

### 6. EmptyState

**Card styling**: Add background `--surface-elevated`, border-radius `--r-default`, box-shadow `--shadow-subtle`. AC: "warm card styling with shadow, generous padding".

**Padding**: Increase to `--density-pad-x` horizontal, `--density-card-pad` vertical (already in place). The "generous padding" from AC is satisfied by the existing density-aware padding which is already 16px/12px at default tier.

**Colors**:
- Title: `--text-primary` (replacing `--text-hi`)
- Description: `--text-tertiary` (replacing `--text-lo`)
- Action link/button: `--accent-primary` (forest green). AC: "forest green action buttons".

### 7. ErrorState

**Card styling**: Same as EmptyState — add background `--surface-elevated`, border-radius `--r-default`, box-shadow `--shadow-subtle`.

**Colors**:
- Title: `--status-error` (replacing `--danger`). Same semantic meaning, new token name.
- Description: `--text-tertiary` (replacing `--text-lo`)
- Retry button bg: `--accent-primary` (replacing `--primary`). AC: "forest green action buttons".
- Retry button text: `--text-on-accent` (replacing `--surface-0`). White on green.

### 8. KeyValue

**Colors**:
- Label: `--text-tertiary` (replacing `--text-lo`). Mono uppercase, 11px.
- Value: `--text-primary` (replacing `--text-hi`)

**Font**:
- Label: `font-[family-name:var(--font-mono)]` (replacing `font-heading`)

**Border separators**: When multiple KeyValues are stacked, the parent container should use `divide-y divide-[var(--border-subtle)]` for warm border separators. This is a usage pattern, not a component change — but the component itself does not render borders. The AC says "warm border separators" which is satisfied by using `--border-subtle` (which is already warm in Hearth: #e8e0d0 light / #3d342a dark) in the parent context.

**Text hierarchy**: Already uses density tokens for value size. Label stays at literal 11px (density-static axis per K11 audit).

---

## Tag Tint CSS Classes Update

The `.tag-tint-*` classes in `tokens.css` (component layer) already use Hearth tokens:

```css
.tag-tint-pattern {
  background-color: color-mix(in oklab, var(--text-secondary) 12%, transparent);
}
.tag-tint-decision {
  background-color: color-mix(in oklab, var(--accent-primary) 14%, transparent);
}
.tag-tint-failure {
  background-color: color-mix(in oklab, var(--status-error) 16%, transparent);
}
```

These are already correct for Hearth. No change needed to `tokens.css` tag tints.

---

## HTML Reference Update Strategy

The HTML files use inline `<style>` blocks with Lucid tokens. Each HTML file's component CSS must be updated to use Hearth tokens from `_tokens.css`. The `_tokens.css` file already provides all Hearth tokens. The component CSS within each HTML file is what needs migration.

Key principle from `.claude/rules/visual-parity.md`: "HTML component files are the design source of truth. NEVER change the styling of HTML files." 

HOWEVER — the AC for U7 explicitly states: "HTML reference files in `packages/design-system/html/` updated to match Hearth aesthetic for each component." This is a deliberate override for this workpackage: we ARE updating the HTML files as part of the Hearth migration. The visual-parity rule applies AFTER U7 ships — from that point forward, the Hearth-styled HTML becomes the new source of truth.

---

## Rejected Directions

1. **Expand Status type**: Rejected. The AC mentions "active/completed/at_risk/killed/draft/info" as color mappings, not as a type rename. The existing type is used across the codebase. A type change would be a breaking API change requiring a separate workpackage.

2. **Use DaisyUI badge/btn classes**: Rejected. DaisyUI theme in tailwind.config.ts is still Lucid-mapped. Direct CSS token usage gives pixel-identical HTML/TSX parity without depending on DaisyUI theme migration.

3. **Add `--surface-ghost` as a named Hearth token**: Rejected. Use `color-mix(in oklab, var(--text-secondary) 8%, transparent)` inline. Adding tokens is out of scope for a restyle workpackage.

4. **Different animation for Skeleton on warm surfaces**: Rejected. The existing skeleton-pulse animation (opacity 1 to 0.4) works well on warm surfaces. Only the background color changes.

5. **Make EmptyState/ErrorState centered**: Rejected. AQ-106 forbids page-level text-center on body content. K11 audit explicitly notes "text-left is INTENTIONAL" for these components.

6. **Add `--accent-primary-bg` token for dark mode buttons**: The tokens.css lore note (line 34) suggests U7 should add this. DEFERRED — this is a token-system addition that affects more than Tier 1 primitives. The ErrorState retry button in dark mode can use the light-mode value via a specific class or accept the minor contrast trade-off for now.

---

## Open Questions for Architecture

1. **NavItem statusDot prop**: New prop addition. Does this require a type export change? (Answer: yes, add to `NavItemProps` interface.)

2. **Tailwind config**: The viewer tailwind.config.ts and web tailwind.config.ts reference Lucid color tokens (`text-hi`, `text-lo`, `text-mid`, `surface-0`..`6`, `surface-ghost`). These configs also need Hearth equivalents added. Is this in scope for U7 or a separate U4 follow-up? (Decision: IN SCOPE — the components use `var(--token)` directly in arbitrary values, so Tailwind config changes are minimal. But the `colors` object in tailwind.config should be updated to reference Hearth tokens for any utility-class usage.)

3. **DaisyUI theme**: The DaisyUI themes in tailwind.config.ts are still Lucid. U4 was supposed to handle this. Verify U4 completion status. If not done, U7 components must avoid DaisyUI utility classes that depend on theme colors (which they already do — they use `var(--token)` directly).

4. **Test strategy**: Component unit tests that assert specific class names (e.g., `bg-[var(--ok)]`) will break. Tests need updating to assert new Hearth token class names.

---

## Dual-Mode Verification

Every component must render correctly in both `hearth-light` and `hearth-dark`. The token system handles this automatically (same token names, different values per mode). The builder should verify:

- Status colors are visible against both warm cream (light) and warm earth (dark) surfaces
- Text contrast passes WCAG AA (already validated in tokens.css lore comments)
- Focus rings are visible in both modes
- Skeleton pulse is visible (opacity animation on warm surfaces in both modes)
