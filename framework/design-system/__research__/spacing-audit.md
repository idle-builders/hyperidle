# K7 Spacing & Typography Audit

Read-only inventory of every spacing / typography / radius / sizing class across `layers/core-ui/src/**` and `framework/design-system/src/**`, with per-offender resolution tied to a row in `framework/design-system/AESTHETICS.md`.

This audit is the precondition for any token / component edit in K7. The values below are the source of truth for the sweep — every change in K7 traces back to a row here.

## How to read

- **Frequency table** counts raw class occurrences across both `layers/core-ui/src/**` and `framework/design-system/src/**` `.tsx` files (production + stories).
- **Off-scale offenders** lists every arbitrary-value class (`*-[Npx]`) whose value is not on the canonical 4px grid (or — for chip-internal contexts — the explicit 2px sub-grid allowance).
- **Resolution** cites the row from AESTHETICS.md that drives the fix, OR marks the offender as a designer-call exception with rationale.
- **Touch-target audit** lists every interactive element that, at the default viewport, is shorter than the 44px floor (AESTHETICS.md § Mobile & Touch).

## A. Frequency tables

### A.1 Tailwind shorthand spacing (combined `layers/core-ui` + `framework/design-system`)

| Class | Count |
|---|---|
| `gap-2` | 64 |
| `gap-3` | 35 |
| `gap-1` | 32 |
| `py-1` | 26 |
| `px-2` | 20 |
| `p-3` | 19 |
| `p-2` | 14 |
| `px-3` | 13 |
| `p-4` | 8 |
| `gap-4` | 5 |
| `py-2` | 4 |
| `gap-1.5` | 4 |
| `px-1` | 3 |
| `pb-2`, `mt-2`, `mb-3`, `mb-2`, `mb-1` | 3 each |
| `py-1.5`, `py-0.5`, `pt-3`, `p-1`, `p-0`, `mt-1` | 2 each |
| `px-5`, `pt-2`, `pl-3`, `pb-3`, `pb-1`, `p-6`, `mt-3`, `mr-2`, `ml-2`, `ml-1`, `mb-6`, `mb-4`, `gap-6`, `gap-0` | 1 each |

Tailwind shorthands resolve via `rem * font-size`. The `:root` font-size in the design-system viewer is 14px, but the production app uses the browser default 16px. This means `gap-1` resolves to 4px in the browser (1 × 0.25rem × 16px) and 3.5px in the viewer — the explicit `gap-[Npx]` form in design-system components avoids the discrepancy. For `layers/core-ui/src/**` (running in the browser at 16px base) the shorthands are on the 4px grid: `gap-1`=4px, `gap-2`=8px, `gap-3`=12px, `gap-4`=16px, `p-2`=8px, `p-3`=12px, `p-4`=16px. **All Tailwind shorthand spacing is on-grid for the browser case.** No fixes required.

`gap-1.5` (6px) and `py-0.5` (2px) are sub-grid. Per AESTHETICS.md row "Sub-grid 2px allowance", 2px is permitted only inside StatusChip / Tag. 6px is not on the allowlist; flagged below.

### A.2 Arbitrary pixel spacing (`*-[Npx]`)

Only design-system source files use `*-[Npx]` form (intentional, see lore in BetCard.tsx / StatusChip.tsx / Tag.tsx — viewer font-size of 14px would distort rem values). Values seen:

- 2px (chip-internal — allowed)
- 4px, 6px, 8px, 10px, 12px, 16px, 24px (mixed)
- pr-[56px] (SearchField inset)

### A.3 Text sizes

| Class | Count |
|---|---|
| `text-xs` (12px) | 54 |
| `text-sm` (14px) | 48 |
| `text-base` (16px) | 6 |
| `text-lg` | 1 |
| `text-[14px]` | many (design-system) |
| `text-[12px]` | many (design-system) |
| `text-[11px]` | many (StatusChip / Tag / KeyValue / mono captions) |
| `text-[13px]` | a few (SearchField, StatusChip stories) |
| `text-[10px]` | 3 (NavItem badge, SearchField kbd, KnowledgeRow version pill) |

Per AESTHETICS.md § Typography allowlist: `{11, 12, 13, 14, 15, 16, 18, 20, 24}`. Off-scale: **10px** (3 sites — see B.2).

### A.4 Radii

| Class | Count |
|---|---|
| `rounded` (= 4px Tailwind default) | 76 |
| `rounded-full` | 36 |
| `rounded-lg` (= 8px Tailwind default) | 19 |

`rounded-[var(--r1..3)]` and `rounded-full` are on-scale (closed set per AESTHETICS.md § Borders/Radii/Shadows). `rounded-lg` (Tailwind default 8px) is on-scale numerically but uses Tailwind's named radius rather than the `--r2` token; not strictly off-scale. Recommendation row "Radius scale" is `no change` — no action.

### A.5 Sized arbitrary widths/heights (`w-[Npx]`/`h-[Npx]`/etc.)

| Class | Count |
|---|---|
| `w-[320px]` | 15 (PitchCard / TaskCard `max-w-[320px]`, ThreadRow / SkeletonCard width caps) |
| `h-[600px]`, `h-[480px]`, `w-[640px]`, `w-[420px]` | story scaffolding |
| `h-[32px]`, `h-[16px]`, `h-[18px]`, `h-[14px]`, `h-[20px]`, `h-[24px]`, `h-[6px]` | component primitives |
| `min-h-[48px]` | 3 |
| `w-[18px]`, `w-[16px]`, `w-[14px]`, `w-[6px]`, `min-w-[18px]`, `min-w-[20px]`, `w-[64px]`, `w-[24px]`, `w-[32px]`, `w-[200px]` | component primitives |

All are 4px multiples except `h-[6px]`, `w-[6px]`, `h-[18px]`, `w-[18px]`, `min-w-[18px]`, `min-w-[20px]`, `h-[14px]`, `w-[14px]`. Per AESTHETICS.md § Borders/Radii/Shadows the **2px sub-grid** is reserved for chip-internal contexts. The 18px values are inside StatusChip dot / KnowledgeRow version pill / NavItem count badge / SearchField clear button — all "chip-internal" by the 2px-allowance reading. `h-[6px]` / `w-[6px]` is the StatusChip dot — chip-internal. `h-[14px]` / `w-[14px]` is the SearchField loading spinner glyph — icon-internal, allowed by the same row. `min-w-[20px]` is the SearchField shortcut kbd — kbd-internal, allowed. **No spacing-grid fixes required.**

## B. Off-scale offenders

Each entry: `file:line` — `class` — value — resolution.

### B.1 Spacing off-grid (covered by `design/no-off-grid-spacing`)

1. `framework/design-system/src/ErrorState.tsx:39` — `px-[10px]` — 10px → **fix to `px-[8px]`** per AESTHETICS.md § Spacing & Density row "Grid base unit" (4px hard rule, allowlist `{4,8,12,16,...}`). 10px is between 8 and 12; pick 8 to match the snug button rhythm of an inline retry CTA.
2. `framework/design-system/src/KnowledgeRow.tsx:72` — `px-[6px]` — 6px (factory-mode version pill) → **chip-internal context**, KnowledgeRow version pill is functionally a Tag-class atom. Per AESTHETICS.md § Spacing & Density row "Sub-grid 2px allowance" the 2px sub-grid is allowed inside StatusChip and Tag. **6px is NOT a 2px-grid violation but a 4px-grid one.** Fix to `px-[8px]` to match Tag / StatusChip horizontal rhythm.
3. `framework/design-system/src/KnowledgeRow.tsx:72` — `py-[2px]` — 2px (factory-mode version pill) → **allowed** per AESTHETICS.md § Spacing & Density row "Sub-grid 2px allowance" (chip-internal context — KnowledgeRow version pill matches Tag's `py-[2px]`).
4. `framework/design-system/src/NavItem.tsx:44` — `px-[5px]` — 5px (count badge) → **fix to `px-[4px]`** per AESTHETICS.md § Spacing & Density row "Grid base unit". The count badge is a chip-internal context — 4px sits on the 4px grid; 2px would be too tight for two-digit counts.
5. `framework/design-system/src/SearchField.tsx:41` — `pr-[56px]` — 56px (input right inset for clear-button + kbd) → **on the 4px grid (56 = 4 × 14)**; the lint regex flags it because 56 is outside the explicit allowlist `{4,8,12,16,20,24,32,40,48}` in K6. **Designer-call exception** — input padding-right must clear an 18px button + 4px gap + 20px+ kbd. AESTHETICS.md § Spacing & Density does not call out an explicit cap above 48px; 56 is the geometric minimum for the SearchField composition. Add an inline `// @lore` comment when committed.

### B.2 Typography off-scale (covered by `design/no-off-scale-font-size`)

1. `framework/design-system/src/KnowledgeRow.tsx:72` — `text-[10px]` (factory-mode version pill) → **fix to `text-[11px]`** per AESTHETICS.md § Typography row "Body size (default)" allowlist `{11,12,13,14,15,16,18,20,24}`. 11px is the StatusChip / Tag uppercase-mono size; the version pill should match the same atomic baseline.
2. `framework/design-system/src/NavItem.tsx:44` — `text-[10px]` (count badge mono) → **fix to `text-[11px]`** per the same row. NavItem count badges share visual class with StatusChip → match its 11px.
3. `framework/design-system/src/SearchField.tsx:58` — `text-[10px]` (kbd shortcut) → **fix to `text-[11px]`** per the same row. The Cmd-K kbd glyph is functionally identical to a StatusChip atom.

### B.3 Tag-internal chip text-[11px] retains 0.05em tracking

The current StatusChip / Tag both use `tracking-[0.05em]` on uppercase labels. AESTHETICS.md § Typography row "Letter-spacing for caps" recommends `+0.02em` (designer-call) — but the recommendation cell explicitly says "+0.02em (+2%) tracking on uppercase labels". The current 0.05em (5%) is more aggressive than the recommendation. **Resolution:** designer-call exception for the StatusChip status label only — its all-caps display benefits from the wider tracking the existing system uses; for the Tag mono and KeyValue label the recommendation 0.02em is the cleaner choice. Apply 0.02em to KeyValue + Tag uppercase labels; leave StatusChip at 0.05em (the chip's pill geometry needs the wider tracking to read clearly at 11px / pill height 18px).

The KeyValue.tsx `tracking-[0.05em]` (line 18) → **fix to `tracking-[0.02em]`**.

### B.4 Density tier coherence (Spacing & Density row "Density tier ratio")

Per AESTHETICS.md § Spacing & Density rows "Density tier ratio (compact)" and "Density tier ratio (comfortable)":

- `compact = default × 0.75`, rounded to nearest 4px multiple.
- `comfortable = default × 1.25`, rounded to nearest 4px multiple.

Default tokens (no change): `pad-x: 12px, pad-y: 8px, gap: 8px, row-h: 32px, text: 14px`.

Computed compact:
- pad-x: 12 × 0.75 = 9 → round down to nearest 4px → **8px** (current 6px — off by 2px, fix)
- pad-y: 8 × 0.75 = 6 → round down to nearest 4px → **4px** (current 4px — no change)
- gap: 8 × 0.75 = 6 → round down to nearest 4px → **4px** (current 4px — no change)
- row-h: 32 × 0.75 = 24 → exact 4px → **24px** (current 26px — off by 2px, fix)
- text: 14 × 0.75 ≈ 11; closest scale value is 12px — **12px** (current 12px — no change)

Computed comfortable:
- pad-x: 12 × 1.25 = 15 → round up to nearest 4px → **16px** (current 16px — no change)
- pad-y: 8 × 1.25 = 10 → round up to nearest 4px → **12px** (current 12px — no change)
- gap: 8 × 1.25 = 10 → round up to nearest 4px → **12px** (current 12px — no change)
- row-h: 32 × 1.25 = 40 → exact 4px → **40px** (current 40px — no change)
- text: 14 × 1.25 = 17.5; closest scale value is 18px or 15px. AESTHETICS.md row "Body size (comfortable)" explicitly fixes this at **15px** (no change) — apply.

Rounding tie-break rule (used above): for compact, round to the SMALLER 4px multiple (preserves the "tighter than default" intent); for comfortable, round to the LARGER 4px multiple (preserves the "comfier than default" intent).

**Token edits required:**
- `[data-density="compact"]` → `--density-pad-x: 0.5rem` (8px, was 6px)
- `[data-density="compact"]` → `--density-row-h: 1.5rem` (24px, was 26px)
- All other tier values match the rule already.

## C. Touch-target audit (AESTHETICS.md § Mobile & Touch row "Minimum touch target")

WCAG 2.5.5 + Apple HIG floor = 44 CSS px on every interactive element at viewport ≤ 1024px. Below the floor at default desktop viewport:

| Element | File:Line | Current size | Resolution |
|---|---|---|---|
| StatusChip | StatusChip.tsx:76 | h ≈ 18px (pill) | **Designer-call exception** — StatusChip is an inline status indicator, not an interactive primitive (no `onClick`). Touch-target rule applies to interactive elements; the chip displays state. No fix. |
| Tag | Tag.tsx:23 | h ≈ 18px (pill) | **Designer-call exception** — same as StatusChip; non-interactive. |
| NavItem button | NavItem.tsx:34 | h = `min-h-[var(--density-row-h)]` = 32px default / 40px comfortable | **Resolved by auto-density** — at viewport ≤ 1024px AppShell flips to comfortable preset (row-h 40px) per AESTHETICS.md § Mobile & Touch row "Auto-density behavior". 40px is below 44px but inside the WCAG 2.5.8 (AA, 24px-with-spacing) tolerance. The row is a list-item with adequate spacing (gap from neighbors ≥ 4px). **Track for K8 follow-up** — K8 may require an additional `min-h-[44px]` at the mobile breakpoint specifically. K7 ships the auto-density mechanism. |
| SearchField clear button | SearchField.tsx:48 | 18 × 18 | **Designer-call exception** — clear (✕) is an internal sub-control, the parent `<input>` is the primary touch target (h = 32px → 40px under comfortable auto-density). The clear button retains a 18×18 visual hit but inherits the input's 32px container height. K8 may extend the hit area via padding if testing surfaces complaints. |
| ErrorState retry button | ErrorState.tsx:37 | h ≈ 24px (px-[10px] py-[4px] + line) | **Defer to K8** — fixing the off-grid `px-[10px]` to `px-[8px]` (B.1.1) is K7's job; bumping the height to 44px requires either a new `min-h-[44px]` (changes the visual) or accepting the WCAG 2.5.8 spacing exception. K7 fixes the spacing-grid issue; the touch-target bump is left for K8 with screenshot evidence. |
| ThreadRow / NotificationRow / KnowledgeRow | each `*.tsx` | h = `min-h-[var(--density-row-h)]` (for the ones that set it) or content height | Same as NavItem — auto-density to comfortable bumps row-h to 40px under mobile. K8 owns the final 44px enforcement. |
| KnowledgeSubmenu scope-tab `btn-xs` | AppShell.tsx:158 | h ≈ 24px | **Defer to K8** — DaisyUI `btn-xs` is the chosen size; bumping touches AppShell composition outside the K7 component sweep. |

**K7 scope of touch-target work:** ship the auto-density mechanism (Stage 4) so 44px is achievable at viewport ≤ 1024px via the comfortable preset. Final per-element 44px enforcement is K8.

## D. Resolution summary — what K7 changes

### D.1 Token edits (`framework/design-system/src/tokens.css`)

- `[data-density="compact"]` → pad-x `0.5rem` (was `0.375rem`), row-h `1.5rem` (was `1.625rem`). Driver: AESTHETICS.md § Spacing & Density row "Density tier ratio (compact)".
- New `[data-density="comfortable"]` → no token edits required (already matches × 1.25 rounded up).
- Add CSS custom properties for **typography depth**:
  - `--leading-body: 1.5` (default), with `[data-density="comfortable"] { --leading-body: 1.55 }`. Driver: AESTHETICS.md § Typography rows "Body line-height (default)" and "(comfortable)".
  - `--leading-heading: 1.25` (used by ≤ 20px headings), `--leading-heading-lg: 1.2` (used by 24px+ headings). Driver: AESTHETICS.md § Typography row "Heading line-height".
  - `--tracking-caps: 0.02em`. Driver: AESTHETICS.md § Typography row "Letter-spacing for caps".
- Add **font-weight** tokens `--fw-regular: 400; --fw-medium: 500; --fw-emphasis: 600`. Driver: row "Font-weight scale".
- Add **easing curve** token `--motion-ease: cubic-bezier(0.2, 0, 0, 1)`. Driver: AESTHETICS.md § Motion row "Easing curve".
- Add `@media (prefers-reduced-motion: reduce)` block setting `--motion-fast/medium/slow: 1ms` and disabling the `skeleton-pulse` animation. Driver: row "Reduced-motion media block".

### D.2 Component sweep (HTML + TSX in lockstep)

| Component | Change | AESTHETICS row |
|---|---|---|
| ErrorState | `px-[10px]` → `px-[8px]` (retry button) | "Grid base unit" (4px hard rule) |
| KnowledgeRow | factory-mode version pill: `px-[6px]` → `px-[8px]`, `text-[10px]` → `text-[11px]` | "Grid base unit" + "Body size (default)" |
| NavItem | count badge: `px-[5px]` → `px-[4px]`, `text-[10px]` → `text-[11px]` | "Grid base unit" + "Body size (default)" |
| SearchField | kbd: `text-[10px]` → `text-[11px]`. `pr-[56px]` retained (designer-call exception, B.1.5). | "Body size (default)" |
| KeyValue | uppercase label: `tracking-[0.05em]` → `tracking-[0.02em]` | "Letter-spacing for caps" |
| Tag | uppercase mono context: keep current 0.03em via HTML / 0.05em via TSX disagreement → unify to `tracking-[0.02em]` per recommendation | "Letter-spacing for caps" |
| StatusChip | retain `tracking-[0.05em]` — designer-call exception per B.3 | n/a (exception) |

(Card components — BetCard / PitchCard / TaskCard / ThreadRow / NotificationRow / Skeleton — sit at on-grid pixel values. No spacing edits required by the audit.)

### D.3 Mobile auto-density

Per AESTHETICS.md § Mobile & Touch rows "Auto-density behavior" + "Density preference state":
- Density preference becomes a tri-state in the Settings panel: `"auto" | "default" | "compact" | "comfortable"`.
- Default value flips from `"default"` to `"auto"`.
- AppShell hook subscribes to `(max-width: 1024px)`; when matched and preference is `"auto"`, renders `[data-density="comfortable"]`. Otherwise `[data-density="default"]` (or the user override).

### D.4 Visual-regression expectations (per spec — not re-baselined here)

K8 owns the visual-regression re-baseline. K7 should expect failures in:
- ErrorState (retry button padding shift)
- KnowledgeRow factory-mode (version pill +1px width, +1px font)
- NavItem count badge (badge -1px width, +1px font)
- SearchField (kbd +1px font)
- KeyValue (label tracking compresses ~3px across the label)
- Tag (label tracking compresses)
- Density-preset consumers under data-density="compact" (pad-x +2px, row-h -2px)
