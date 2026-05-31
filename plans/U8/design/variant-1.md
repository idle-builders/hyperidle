# U8 Design Variant 1: Hearth Restyle for Tier 2 Composites

**Classification:** Routine restyle. Existing components, known layouts, established design language.
**Date:** 2026-05-31

---

## Design Language Summary

All Tier 2 components transition from Lucid (dark-first, monochrome status, precision-instrument) to Hearth (light-first, chromatic status, warm/tactile). The Hearth aesthetic has four principles:

1. **Warmth signals trust.** Cream surfaces, warm shadows, earthy tones.
2. **Status through content.** Colored dots and badges carry meaning. Cards stay structurally uniform.
3. **Generous rounding.** 16px default radius, pill-shaped buttons, 10px for subtle rounding.
4. **Mixed hierarchy.** Shadows AND borders AND tints work together.

---

## Token Migration Map

Every Tier 2 component uses these token replacements. This is the canonical map for the builder.

### Surfaces

| Old Lucid Token | New Hearth Token | Notes |
|---|---|---|
| `--surface-0` | `--surface-page` | Page/body background |
| `--surface-1` | `--surface-container` | Chrome, sidebar, nav backgrounds |
| `--surface-2` | `--surface-elevated` | Cards, panels, elevated content |
| `--surface-3` | `--surface-container` | Grouped containers (context-dependent) |
| `--surface-4` | `--surface-elevated` | Cards, hover backgrounds |
| `--surface-5` | `--surface-elevated` with hover opacity | Hover state for elevated cards |
| `--surface-6` | `--surface-container` | Deep inset surfaces |
| `--surface-ghost` | `color-mix(in oklab, var(--text-secondary) 8%, transparent)` | Ghost/hover tint (no direct Hearth token) |

### Text

| Old Lucid Token | New Hearth Token |
|---|---|
| `--text-hi` | `--text-primary` |
| `--text-mid` | `--text-secondary` |
| `--text-lo` | `--text-tertiary` |
| `--text` (unqualified) | `--text-primary` |
| `--text-strong` | `--text-primary` (with font-weight 600) |
| `--text-on-accent` | `--text-on-accent` (unchanged) |

### Accents and Status

| Old Lucid Token | New Hearth Token |
|---|---|
| `--primary` | `--accent-primary` |
| `--primary-dim` | `--accent-primary-dim` |
| `--accent` (generic) | `--accent-primary` |
| `--accent-on` | `--text-on-accent` |
| `--danger` | `--status-error` |
| `--ok` | `--status-success` |

### Radii

| Old Lucid Token | New Hearth Token |
|---|---|
| `--r0` | `--r-none` |
| `--r1` | `--r-subtle` |
| `--r2` | `--r-default` |
| `--r3` | `--r-default` (Hearth has no intermediate step) |
| `--r-pill` | `--r-pill` (unchanged) |

### Motion

| Old Lucid Token | New Hearth Token |
|---|---|
| `--motion-fast` | `--motion-fast` (unchanged name, value 80ms -> 120ms) |
| `--motion-medium` | `--motion-default` |
| `--motion-slow` | `--motion-slow` (unchanged name, value 250ms -> 450ms) |

### Borders

| Old Lucid Token | New Hearth Token |
|---|---|
| `--border-subtle` | `--border-subtle` (unchanged) |
| `--border-default` | `--border-default` (unchanged) |
| `--border-emphasis` | `--border-strong` |

### Typography

| Old Lucid Token | New Hearth Token |
|---|---|
| `font-heading` | Remove. Headings use `--font-sans` with semibold weight. |
| `--font-mono` / `--mono` | `--font-mono` (unchanged) |
| `--float` | `--shadow-elevated` |

---

## Per-Component Hearth Treatment

### 1. BetCard

**Current state:** Uses `--surface-4`, `--r2`, `--surface-6` for progress track, `--primary` for progress fill, `--motion-medium`, `--text-mid`.

**Hearth treatment:**
- **Container:** `bg-[var(--surface-elevated)]` with `rounded-[var(--r-default)]` (16px). Add `shadow-[var(--shadow-default)]` for warm depth. Add `border border-[var(--border-subtle)]`.
- **Hover:** `hover:translate-y-[-2px] hover:shadow-[var(--shadow-elevated)]` with `transition-all duration-[var(--motion-fast)]`.
- **Progress bar track:** `bg-[var(--surface-container)]` instead of `--surface-6`.
- **Progress bar fill:** `bg-[var(--status-success)]` for healthy/active bets. For at-risk bets, `bg-[var(--status-warning)]`. The fill color is derived from bet status: active -> success (green), at_risk flag -> warning (amber).
- **Progress text:** `text-[var(--text-secondary)]`.
- **Lead avatar:** `bg-[var(--surface-container)]` circle, `text-[var(--text-primary)]`.
- **Title:** `text-[var(--text-primary)]`.
- **Team tag and StatusChip:** Already Hearth-styled from U7. No changes needed to the child components themselves.

### 2. ThreadRow

**Current state:** Uses `--surface-4`, `--r1`, `--primary`, `--danger`, `--text-mid`, `--text-lo`, `--surface-ghost`.

**Hearth treatment:**
- **Row container:** `rounded-[var(--r-subtle)]` (10px). Keep density tokens for padding.
- **Hover:** `hover:bg-[color-mix(in_oklab,var(--accent-primary)_4%,var(--surface-elevated))]` -- subtle green-tinted warm hover instead of flat surface step.
- **Selected:** `bg-[var(--surface-elevated)]` with `shadow-[var(--shadow-subtle)]`.
- **Unread dot:** Render a 6px green dot (`bg-[var(--status-success)]`) to the left of the title when `unread=true`. When read, the dot space is transparent (maintains layout).
- **Selected border:** `border-l-[var(--bw-strong)] border-[var(--accent-primary)]` (was `--primary`).
- **Blocking border:** `border-l-[var(--bw-strong)] border-[var(--status-error)]` (was `--danger`).
- **Initials chip:** `bg-[var(--surface-container)]` text `text-[var(--text-secondary)]`.
- **Snippet text:** `text-[var(--text-secondary)]`.
- **Timestamp:** `text-[var(--text-tertiary)]`.
- **Host pill:** `bg-[color-mix(in_oklab,var(--text-secondary)_8%,transparent)]` text `text-[var(--text-secondary)]`.
- **Pin icon color:** `text-[var(--text-tertiary)]`.
- **Focus ring:** `outline-[var(--accent-primary)]`.

### 3. TaskCard

**Current state:** Uses `--surface-4`, `--r2`, `--danger`, `--text-hi`.

**Hearth treatment:**
- **Container:** `bg-[var(--surface-elevated)]` with `rounded-[var(--r-default)]`, `shadow-[var(--shadow-default)]`, `border border-[var(--border-subtle)]`.
- **Hover:** `hover:translate-y-[-2px] hover:shadow-[var(--shadow-elevated)]` matching BetCard.
- **Blocked border:** `border-[var(--status-error)]` (was `--danger`).
- **Title:** `text-[var(--text-primary)]` (was `--text-hi`).
- **Owner:** `text-[var(--text-primary)]` (was `--text-hi`).
- **Status dot:** Via StatusChip (already Hearth from U7).

### 4. KnowledgeRow

**Current state:** Uses `--r1`, `--surface-4`, `--primary`, `--text-lo`, `--text-mid`, `--surface-ghost`, `--mono`, `--tracking-caps`.

**Hearth treatment:**
- **Row container:** `rounded-[var(--r-subtle)]`. No background at rest (same as current).
- **Hover:** `hover:bg-[color-mix(in_oklab,var(--accent-primary)_4%,var(--surface-elevated))]` matching ThreadRow.
- **Focus ring:** `outline-[var(--accent-primary)]` (was `--primary`).
- **Signals text:** `text-[var(--text-tertiary)]` (was `--text-lo`).
- **Signal labels:** `text-[var(--text-tertiary)]` with `tracking-[var(--tracking-caps)]`.
- **Caption:** `text-[var(--text-secondary)]` (was `--text-mid`).
- **Version pill:** `bg-[color-mix(in_oklab,var(--text-secondary)_8%,transparent)]` text `text-[var(--text-tertiary)]` (was `--surface-ghost` / `--text-lo`).
- **Factory title:** Remove `font-heading` class. Use `font-bold` with default sans font.
- **Timestamp:** `text-[var(--text-tertiary)]`.

### 5. CommentRow

**Current state:** Uses `--surface-2`, `--text-lo`, `--text-hi`, `--text-mid`, `--border-subtle`.

**Hearth treatment:**
- **Avatar circle:** `bg-[var(--surface-container)]` (was `--surface-2`), `text-[var(--text-tertiary)]` (was `--text-lo`), border stays `--border-subtle`.
- **Sender name:** `text-[var(--text-primary)]` (was `--text-hi`).
- **Sender role:** `text-[var(--text-tertiary)]` (was `--text-lo`).
- **Body text:** `text-[var(--text-secondary)]` (was `--text-mid`).
- **Verdict note:** `text-[var(--text-tertiary)]` (was `--text-lo`).
- **Redacted text:** `text-[var(--text-tertiary)]` (was `--text-lo`).
- **Inline anchor label:** `text-[var(--text-tertiary)]` with anchor highlight `text-[var(--text-secondary)]`.

### 6. Composer

**Current state:** Uses `--surface-1`, `--surface-2`, `--border-subtle`, `--accent`, `--accent-on`, `--text-mid`, `--text-lo`, `--danger`, `--r1`.

**Hearth treatment:**
- **Container:** `bg-[var(--surface-container)]` (was `--surface-1`). Border-top stays `--border-subtle`.
- **Textarea:** `bg-[var(--surface-elevated)]` (was `--surface-2`), `text-[var(--text-secondary)]` (was `--text-mid`), `placeholder:text-[var(--text-placeholder)]` (was `--text-lo`), `rounded-[var(--r-subtle)]` (was `--r1`), focus `border-[var(--accent-primary)]` with `shadow-[0_0_0_3px_var(--accent-primary-dim)]`.
- **Send button:** `bg-[var(--accent-primary)]` (forest green), `text-[var(--text-on-accent)]` (white), `rounded-[var(--r-pill)]` (pill-shaped per AC), `hover:bg-[var(--accent-primary-hover)]`.
- **"Cmd+Enter" hint:** `text-[var(--text-tertiary)]` (was `--text-lo`).
- **Error text:** `text-[var(--status-error)]` (was `--danger`).
- **Unresolved review link:** `text-[var(--accent-primary)]` (was `--accent`), focus ring `outline-[var(--accent-primary)]`.

### 7. RichMessageCard

**Current state:** Uses `--surface-0`, `--surface-2`, `--surface-3`, `--surface-4`, `--surface-ghost`, `--text-hi`, `--text-mid`, `--text-lo`, `--primary`, `--danger`, `--ok`, `--r1`, `--r2`, `--motion-medium`.

**Hearth treatment:**
- **Card container:** `bg-[var(--surface-elevated)]` (was `--surface-2`), `rounded-[var(--r-default)]` (was `--r2`), border stays `--border-default`.
- **Blocking left border:** `border-l-[var(--bw-strong)] border-l-[var(--status-error)]` (was `--danger`).
- **Agent avatar border:** For agent messages, the sender avatar/initials gets a 2px `border-[var(--accent-primary)]` ring (forest green). This is new Hearth treatment per AC.
- **Tag pill (REVIEW/QUESTION):** `bg-[var(--accent-primary-dim)]` text `text-[var(--accent-primary)]` (was `--primary` tint).
- **Title:** `text-[var(--text-primary)]` (was `--text-hi`).
- **Sender name:** `text-[var(--text-primary)]` font-medium.
- **Sender role:** `text-[var(--text-tertiary)]` (was `--text-lo`).
- **Reasoning text:** `text-[var(--text-secondary)]` (was `--text-mid`).
- **Reasoning toggle button:** `bg-[var(--surface-container)]` (was `--surface-3`), hover `bg-[var(--surface-elevated)]` (was `--surface-4`).
- **Action footer bg:** `bg-[var(--surface-elevated)]` (was `--surface-2`).
- **Primary button:** `bg-[var(--accent-primary)] text-[var(--text-on-accent)]`.
- **Danger button:** Uses `--status-error` (was `--danger`).
- **Ghost button:** `text-[var(--text-secondary)]` (was `--text-mid`), border `--border-default`, hover `bg-[color-mix(in_oklab,var(--text-secondary)_8%,transparent)]` (was `--surface-ghost`).
- **Action boxes with green tint:** Idle toolbar gets `bg-[color-mix(in_oklab,var(--accent-primary)_4%,var(--surface-elevated))]` -- very subtle green tint per AC.
- **Resolved badge:** text `text-[var(--status-success)]` (was `--ok`).
- **Resolved pill:** `bg-[color-mix(in_oklab,var(--text-secondary)_8%,transparent)]` (was `--surface-ghost`).
- **Chevron transition:** `var(--motion-default)` (was `--motion-medium`).
- **Focus ring:** `outline-[var(--accent-primary)]` (was `--primary`).
- **Card max-height:** Preserved. `--card-max-h` stays.
- **Saving/error footer:** `bg-[var(--surface-elevated)]`, error text `text-[var(--status-error)]`.

### 8. NotificationRow

**Current state:** Uses `--r1`, `--surface-4`, density tokens (already correct), `--text-lo`.

**Hearth treatment:**
- **Row container:** `rounded-[var(--r-subtle)]` (was `--r1`).
- **Hover:** `hover:bg-[color-mix(in_oklab,var(--accent-primary)_4%,var(--surface-elevated))]`.
- **Colored left border:** New addition per AC. Add `border-l-[3px]` with color derived from severity:
  - healthy/done -> `border-l-[var(--status-success)]`
  - behind -> `border-l-[var(--status-warning)]`
  - blocked/error -> `border-l-[var(--status-error)]`
  - paused -> `border-l-[var(--status-info)]`
- **Icon circles with colored tint backgrounds:** New addition per AC. Before the StatusChip, render a 24px circle with tinted background matching the severity color at 14% opacity. The StatusChip dot is already colored; the icon circle adds a larger tinted area for visual weight.
- **Timestamp:** `text-[var(--text-tertiary)]` (was `--text-lo`).

### 9. ThreadHostBanner

**Current state:** Uses `--surface-1`, `--surface-2`, `--text-hi`, `--text-lo`, `--border-subtle`.

**Hearth treatment:**
- **Container:** `bg-[var(--surface-container)]` (was `--surface-1`). Per AC: "warm surface with participant avatars."
- **Host title:** `text-[var(--text-primary)]` (was `--text-hi`).
- **Pin icon:** `text-[var(--text-tertiary)]` (was `--text-lo`).
- **Participant avatars:** `bg-[var(--surface-elevated)]` (was `--surface-2`), `text-[var(--text-tertiary)]` (was `--text-lo`), border stays `--border-subtle`.
- **Team/bet context:** Displayed via Tag component (already Hearth).

### 10. ThreadShell

**Current state:** Uses `--surface-1`, `--text-hi`, `--text-mid`, `--text-lo`, `--primary`, `--r1`, `--r-pill`.

**Hearth treatment:**
- **Shell container:** `bg-[var(--surface-elevated)]` (was `--surface-1`). Per AC: "cream/elevated main area."
- **Rich slot tag pills:** `bg-[var(--accent-primary-dim)]` text `text-[var(--accent-primary)]` (was `--primary`).
- **Rich slot titles:** `text-[var(--text-primary)]` (was `--text-hi`).
- **Rich slot reasoning text:** `text-[var(--text-secondary)]` (was `--text-mid`).
- **Rich slot labels:** `text-[var(--text-tertiary)]` (was `--text-lo`).
- **Disabled questionnaire buttons:** `rounded-[var(--r-subtle)]` (was `--r1`), `text-[var(--text-secondary)]` (was `--text-mid`).
- **Thread header badges:** Via StatusChip/Tag (already Hearth).

### 11. Block and Payloads

**Current state:** Uses `--primary`, `--surface-ghost`, `--r2`, `--surface-2`, `--surface-3`, `--text-mid`, `--text-lo`, `--text`, `--border-subtle`, `--border-emphasis`.

**Hearth treatment:**

**Block.tsx:**
- **Hover bg:** `hover:bg-[color-mix(in_oklab,var(--text-secondary)_4%,transparent)]` (was `--surface-ghost`).
- **Focus ring:** `outline-[var(--accent-primary)]` (was `--primary`).

**CodePayload.tsx:**
- **Code block bg:** `bg-[var(--surface-container)]` (was `--surface-2`), `rounded-[var(--r-default)]` (was `--r2`). This creates warm code blocks per AC.
- **Code text:** `text-[var(--text-primary)]` (was `--text`).
- **Language label:** `text-[var(--text-tertiary)]` (was `--text-lo`).
- **Expand button:** `text-[var(--text-secondary)]` (was `--text-mid`), focus ring `outline-[var(--accent-primary)]` (was `--primary`), `rounded-[var(--r-subtle)]` (was `--r1`).

**TablePayload.tsx:**
- **Table wrapper:** `rounded-[var(--r-default)]` (was `--r2`). Warm table borders per AC.
- **Header bg:** `bg-[var(--surface-container)]` (was `--surface-3`).
- **Header text:** `text-[var(--text-secondary)]` (was `--text-mid`).

**HeadingPayload.tsx:**
- **Font:** Remove `font-heading`. Use default sans with `font-semibold`.
- **Text color:** `text-[var(--text-primary)]` (was `--text-strong`).
- **Heading sizes per Hearth type scale:** h1: `text-[var(--density-text-h1)]`, h2: `text-[var(--density-text-h2)]`, h3-h6: sized per the Hearth scale (18px/16px/15px/13px).

**QuotePayload.tsx:**
- **Border:** `border-[var(--border-strong)]` (was `--border-emphasis`).
- **Text:** `text-[var(--text-secondary)]` (was `--text-mid`).

**Other payloads (Paragraph, List, Image, Divider, Html, Unknown):** Replace any `--text-mid` with `--text-secondary`, `--text-lo` with `--text-tertiary`, `--text-hi` with `--text-primary`, `--surface-*` numbered with Hearth equivalents per the token map above.

### 12. Artifact Family

All eight components share the same migration pattern:

**ArtifactCostChip:**
- Text: `text-[var(--text-secondary)]` (was `--text-mid`).
- Separator dot: `text-[var(--text-tertiary)]` (was `--text-lo`).

**ArtifactEmbed:**
- Identity bar text: `text-[var(--text-tertiary)]` (was `--text-lo`).
- Separator dots: `text-[var(--text-tertiary)]`.
- View text: `text-[var(--text-secondary)]` (was `--text-mid`).
- Arrow hover: `hover:text-[var(--text-primary)]` (was `--text-hi`).
- Focus ring: `outline-[var(--accent-primary)]` (was `--primary`).

**ArtifactGalleryCard:**
- Card bg: `bg-[var(--surface-elevated)]` (was `--surface-4`), `rounded-[var(--r-default)]` (was `--r2`). Add `shadow-[var(--shadow-default)]` and `border border-[var(--border-subtle)]`.
- Hover: `hover:translate-y-[-2px] hover:shadow-[var(--shadow-elevated)]` (was `hover:bg-[var(--surface-5)]`). This matches the card lift pattern from BetCard.
- Focus ring: `outline-[var(--accent-primary)]` (was `--primary`).
- Header text: `text-[var(--text-secondary)]` (was `--text-mid`).
- Separator dots: `text-[var(--text-tertiary)]` (was `--text-lo`).
- Title: `text-[var(--text-primary)]` (was `--text-hi`).
- Footer text: `text-[var(--text-secondary)]` (was `--text-mid`).
- Thread count pill: `bg-[color-mix(in_oklab,var(--text-secondary)_8%,transparent)]` text `text-[var(--text-secondary)]` (was `--surface-ghost` / `--text-mid`).

**ArtifactKindBadge:**
- Badge bg: `bg-[color-mix(in_oklab,var(--text-secondary)_8%,transparent)]` (was `--surface-ghost`), `rounded-[var(--r-default)]` (was `--r2`).
- Text: `text-[var(--text-secondary)]` (was `--text-mid`).

**ArtifactPreview:**
- Wrapper bg: `bg-[var(--surface-container)]` (was `--surface-3`), `rounded-[var(--r-default)]` (was `--r2`).
- Meta text: `text-[var(--text-secondary)]` (was `--text-mid`).
- Title: `text-[var(--text-primary)]` (was `--text-hi`).
- Discussion bg: `bg-[var(--surface-elevated)]` (was `--surface-2`), `rounded-[var(--r-subtle)]` (was `--r1`), text `text-[var(--text-tertiary)]` (was `--text-lo`).
- Separator dots: `text-[var(--text-tertiary)]`.
- ID text: `text-[var(--text-tertiary)]`.

**ArtifactPreviewSurface:**
- Surface bg: `bg-[var(--surface-container)]` (was `--surface-3`), `rounded-[var(--r-subtle)]` (was `--r1`).
- Text: `text-[var(--text-tertiary)]` (was `--text-lo`).

**ArtifactStackItem:**
- Row hover: `hover:bg-[color-mix(in_oklab,var(--accent-primary)_4%,var(--surface-elevated))]` (was `hover:bg-[var(--surface-4)]`). Matching row hover pattern.
- Focus ring: `outline-[var(--accent-primary)]` (was `--primary`).
- Task text: `text-[var(--text-secondary)]` (was `--text-mid`).
- Title: `text-[var(--text-primary)]` (was `--text-hi`).
- Right meta text: `text-[var(--text-secondary)]` (was `--text-mid`).
- Separator dot: `text-[var(--text-tertiary)]` (was `--text-lo`).
- Thread pill: `bg-[color-mix(in_oklab,var(--text-secondary)_8%,transparent)]` text `text-[var(--text-secondary)]` (was `--surface-ghost` / `--text-mid`).

**ArtifactTimestamp:**
- Text: `text-[var(--text-secondary)]` (was `--text-mid`).

---

## Cross-Cutting Patterns

### Card Hover Lift
All cards (BetCard, TaskCard, ArtifactGalleryCard) share the same hover treatment:
```
hover:translate-y-[-2px] hover:shadow-[var(--shadow-elevated)]
transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]
```

### Row Hover Tint
All rows (ThreadRow, KnowledgeRow, NotificationRow, ArtifactStackItem) share the same warm hover:
```
hover:bg-[color-mix(in_oklab,var(--accent-primary)_4%,var(--surface-elevated))]
transition-colors duration-[var(--motion-fast)]
```

### Ghost Surface Replacement
The Lucid `--surface-ghost` token does not exist in Hearth. All uses become:
```
color-mix(in oklab, var(--text-secondary) 8%, transparent)
```

### Focus Ring
All interactive elements use:
```
focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-primary)]
```

### Border Width Token Usage
Where borders were `border-l-2`, use `border-l-[var(--bw-strong)]` (2.5px).

---

## PitchCard Deletion

Per AC: "PitchCard is NOT restyled -- delete it from design system exports."

- Delete `PitchCard.tsx`
- Delete `PitchCard.stories.tsx`
- Delete `html/PitchCard.html`
- Remove `PitchCard` and `PitchCardProps` exports from `index.ts`
- Verify no remaining imports across the codebase

---

## "Did We Consider" Checklist

1. **Dark mode compatibility?** Yes. All tokens used (`--surface-elevated`, `--text-primary`, etc.) have dark-mode values in `tokens.css`. The `color-mix()` approach for tints/ghosts works in both modes because it mixes against semantic tokens, not hardcoded colors.

2. **Density token preservation?** Yes. Components that already use `--density-*` tokens (BetCard, ThreadRow, KnowledgeRow, NotificationRow, CommentRow) keep those tokens. The restyle only changes color/radius/shadow tokens, not spacing/density tokens.

3. **Contrast compliance?** The token system was designed with WCAG AA in mind (U3). `--text-primary` on `--surface-elevated` (white) is 15.28:1 in light mode, well above 4.5:1. `--text-secondary` on white is 6.37:1. `--text-tertiary` on white is 3.40:1 (used only for decorative/hint text, WCAG-exempt as documented in U3 lore).

4. **Card shadow vs. old surface ladder?** Correct. Hearth uses `--shadow-default` on cards at rest (not just overlays). This is a deliberate Hearth design decision documented in U0 concept and U3 tokens. The old AQ-012 restriction ("heavy shadow restricted to overlays") is relaxed for Hearth.

5. **Progress bar color derivation?** BetCard progress bar uses `--status-success` (green) for normal bets and `--status-warning` (amber) for at-risk bets. The BetCard doesn't currently have an `atRisk` prop, so the builder should check if one needs to be added or if the status-based color derivation is sufficient. Current status mapping: `active` -> `healthy` -> green, which is correct.

6. **NotificationRow new elements (colored left border, icon circles)?** These are structural additions per AC, not just token swaps. The colored left border requires mapping severity to border color. The icon circles with tinted backgrounds are a new visual element. Both are additive changes to the component.

7. **HeadingPayload density tokens?** h1 and h2 already have density tokens (`--density-text-h1`, `--density-text-h2`). The `font-heading` class removal and switch to `font-semibold` with sans is a Hearth decision.

8. **Block hover surface?** Uses `color-mix` for a transparent tint rather than a surface token, which works correctly in both light and dark modes.

---

## Scoring (Self-Assessment)

| Dimension | Score | Notes |
|---|---|---|
| Hierarchy | 8 | Clear card/row/block hierarchy maintained. Shadows add depth. |
| Spacing | 9 | All density tokens preserved. No new spacing decisions. |
| Typography | 8 | font-heading removal is clean. Type scale unchanged. |
| Color | 9 | Complete token migration. No cold grays. |
| Coherence | 9 | Consistent patterns (card lift, row tint, focus ring). |
| States | 8 | All states preserved. New NotificationRow border/icon additions. |
| Accessibility | 8 | Contrast ratios validated via U3 work. Focus rings consistent. |
| Anti-Slop | 9 | No AI aesthetic patterns. Warm tints, not gradients. |
| Premium Polish | 8 | Card lift, warm shadows, green accents create tactile feel. |
| **Average** | **8.4** | Solid routine restyle with consistent pattern application. |
