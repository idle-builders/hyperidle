# U7 Architecture Plan — Tier 1 Primitives Restyle

## Required Reading

- `plans/U7/design/approved.md` — the locked design contract
- `packages/design-system/src/tokens.css` — Hearth token definitions
- `packages/design-system/html/_tokens.css` — HTML token sheet
- `packages/design-system/AESTHETICS.md` — spacing/density/AQ rules
- `.claude/rules/aesthetic-quality.md` — AQ hard rules
- `.claude/rules/visual-parity.md` — HTML is design reference, TSX must match

---

## Plan Reconciliation: Spec vs Reality

| Spec Assumption | Reality | Resolution |
|---|---|---|
| Components use Lucid tokens at runtime | `tokens.css` only defines Hearth tokens. Lucid tokens (`--ok`, `--warn`, etc.) are UNDEFINED in production since U3 shipped. Components are visually broken. | U7 fixes this by migrating to Hearth tokens. |
| `--info` token exists for blue status | `--status-info` exists in Hearth tokens (#2e7dba light / #4498d4 dark). | Use `--status-info`. No new token needed. |
| AC says "active" status type | Current type is `"healthy"`. No `"active"` variant. | Keep existing type. AC describes color intent, not type rename. |
| HTML files are "design source of truth" | Rule says never change HTML styling. But AC explicitly requires "HTML reference files updated to match Hearth aesthetic." | U7 is a deliberate override — we update HTML first (new design reference), then match TSX to it. |
| Tag is pill-shaped per AC | Current Tag uses `--r2` (Lucid: 8px). | Change to `--r-pill` (9999px). |
| NavItem has `statusDot` prop per AC | NavItem has no `statusDot` prop today. | Add optional prop. |
| font-heading resolves to Geist Mono | Tailwind config `fontFamily.heading = ["Geist Mono", ...]`. Under Hearth, use `font-[family-name:var(--font-mono)]` for pixel parity with HTML. | StatusChip + KeyValue: change from `font-heading` to `font-[family-name:var(--font-mono)]`. |
| EmptyState/ErrorState get card styling | Currently no background/shadow/radius on these components. | Add `--surface-elevated` bg, `--r-default` radius, `--shadow-subtle` shadow. |
| Tests assert Lucid token class names | StatusChip.test: `text-[var(--ok)]`, NavItem.test: `bg-[var(--surface-4)]`, etc. | Update test assertions to Hearth token names. |
| `tailwind.config.ts` still Lucid-themed | Both viewer + web configs define Lucid DaisyUI themes + Lucid color utilities. | Out of scope for component restyle. Components use `var(--token)` directly via arbitrary values, not Tailwind color utilities. Tailwind config update is a separate workpackage (U4 follow-up). |
| `web/index.html` sets `data-theme="lucid-dark"` | Hearth tokens defined on `:root` win for custom properties. DaisyUI theme is separate concern. | No change needed for U7. Components use `var(--status-success)` etc. which resolve from `:root`. |

---

## Acceptance Criteria + Verification

### AC-1: StatusChip uses Hearth colored badges

**Criteria:** StatusChip uses colored badges — green (status-success) for healthy/done, amber (status-warning) for behind, red (status-error) for blocked/error, blue (status-info) for paused. Pill-shaped (border-radius: 9999px).

**Verification:** Unit test asserts:
- `text-[var(--status-success)]` class on healthy/done chips
- `text-[var(--status-warning)]` class on behind chip
- `text-[var(--status-error)]` class on blocked/error chips
- `text-[var(--status-info)]` class on paused chip
- `text-[var(--text-tertiary)]` class on unknown chip
- `rounded-full` class present (pill shape, unchanged)
- `font-[family-name:var(--font-mono)]` class present (replacing `font-heading`)

### AC-2: Tag is pill-shaped with colored tint backgrounds

**Criteria:** Tag has border-radius: 9999px (pill). Kind tints use Hearth tokens for background color-mix.

**Verification:** Unit test asserts:
- Tag renders with `rounded-[var(--r-pill)]` (not `rounded-[var(--r2)]`)
- Neutral tag uses `color-mix(in oklab, var(--text-secondary) 8%, transparent)` background + `--text-secondary` text
- Kind=decision tag has `tag-tint-decision` class + `text-[var(--accent-primary)]`
- Kind=failure tag has `tag-tint-failure` class + `text-[var(--status-error)]`
- Kind=pattern tag has `tag-tint-pattern` class + `text-[var(--text-secondary)]`

### AC-3: NavItem uses warm hover states, rounded-10px, status dot support

**Criteria:** NavItem has `--r-subtle` corners (10px), hover uses `--accent-primary-dim`, selected uses `--surface-elevated` bg + `--accent-primary` border, optional `statusDot` prop.

**Verification:** Unit test asserts:
- Button has `rounded-[var(--r-subtle)]` class
- Selected state has `bg-[var(--surface-elevated)]` and `border-l-[var(--accent-primary)]`
- Non-selected has `hover:bg-[var(--accent-primary-dim)]`
- When `statusDot="success"` prop given, a 6px dot element renders with `bg-[var(--status-success)]`
- Text uses `--text-primary`, icon uses `--text-tertiary` (default) / `--accent-primary` (selected)

### AC-4: SearchField has 16px radius, forest green focus ring

**Criteria:** 16px border-radius (`--r-default`), border `--border-default`, focus ring uses `--accent-primary` + 3px shadow.

**Verification:** Unit test asserts:
- Input has `rounded-[var(--r-default)]` class
- Input has `border-[var(--border-default)]` (visible border)
- Input has `focus:border-[var(--accent-primary)]` 
- Input has focus shadow class containing `accent-primary-dim`
- Placeholder uses `--text-placeholder` token
- Background uses `--surface-container`

### AC-5: Skeleton uses warm backgrounds

**Criteria:** Skeleton bars use `--surface-container` (warm cream in light, warm earth in dark). Card wrapper uses `--surface-elevated`.

**Verification:** Unit test asserts:
- Skeleton bar class contains `bg-[var(--surface-container)]`
- SkeletonCard wrapper has `bg-[var(--surface-elevated)]`
- Animation class unchanged (`animate-[skeleton-pulse_...]`)

### AC-6: EmptyState has warm card styling

**Criteria:** EmptyState has `--surface-elevated` background, `--r-default` radius, `--shadow-subtle` shadow. Forest green action buttons. Text uses Hearth tokens.

**Verification:** Unit test asserts:
- Outer div has `bg-[var(--surface-elevated)]`, `rounded-[var(--r-default)]`, `shadow-[var(--shadow-subtle)]`
- Title uses `text-[var(--text-primary)]`
- Description uses `text-[var(--text-tertiary)]`

### AC-7: ErrorState has warm card styling with forest green retry

**Criteria:** Same card styling as EmptyState. Title in `--status-error`. Retry button uses `--accent-primary` bg + `--text-on-accent` text.

**Verification:** Unit test asserts:
- Outer div has `bg-[var(--surface-elevated)]`, `rounded-[var(--r-default)]`, `shadow-[var(--shadow-subtle)]`
- Title uses `text-[var(--status-error)]`
- Retry button has `bg-[var(--accent-primary)]` + `text-[var(--text-on-accent)]`

### AC-8: KeyValue uses Hearth text tokens

**Criteria:** Label uses `--text-tertiary`, value uses `--text-primary`. Label font is `--font-mono`.

**Verification:** Unit test asserts:
- Label has `text-[var(--text-tertiary)]` and `font-[family-name:var(--font-mono)]`
- Value has `text-[var(--text-primary)]`

### AC-9: HTML reference files updated

**Criteria:** All 8 HTML files in `packages/design-system/html/` use Hearth tokens (no `--ok`, `--warn`, `--danger`, `--text-lo`, `--text-hi`, `--text-mid`, `--primary`, `--surface-2/3/4/5/ghost`, `--r1`, `--r2`, `--mono`, `--ui`).

**Verification:** Grep test: `grep -r "var(--ok)\|var(--warn)\|var(--danger)\|var(--text-lo)\|var(--text-hi)\|var(--text-mid)\|var(--primary)\|var(--surface-2)\|var(--surface-3)\|var(--surface-4)\|var(--surface-5)\|var(--surface-ghost)\|var(--r1)\|var(--r2)\|var(--mono)\|var(--ui)" packages/design-system/html/{StatusChip,Tag,NavItem,SearchField,Skeleton,EmptyState,ErrorState,KeyValue}.html` returns zero matches.

### AC-10: Stories render correctly

**Criteria:** All `.stories.tsx` files for the 8 components render without error and use appropriate story data.

**Verification:** `npm run check` passes (stories are type-checked). Visual regression test (`visual-regression.test.ts`) passes with <5% pixel diff.

### AC-11: Unit tests updated

**Criteria:** All existing unit tests updated for new Hearth token class names. No test failures.

**Verification:** `npm run test` passes with zero failures.

### AC-12: npm run verify passes

**Criteria:** Full verification suite green.

**Verification:** `npm run verify` exits 0.

---

## Ordered Task List

### Task 0: Update HTML references (design source of truth)

**Rationale:** HTML files are the design reference. Update them FIRST, then match TSX.

**Files:**
1. `packages/design-system/html/StatusChip.html` — migrate inline CSS from Lucid to Hearth tokens
2. `packages/design-system/html/Tag.html` — migrate + change radius to `--r-pill`
3. `packages/design-system/html/NavItem.html` — migrate + add statusDot demo + change radius to `--r-subtle`
4. `packages/design-system/html/SearchField.html` — migrate + change radius to `--r-default` + add focus ring shadow
5. `packages/design-system/html/Skeleton.html` — migrate bg from `--surface-5` to `--surface-container`
6. `packages/design-system/html/EmptyState.html` — migrate + add card styling (bg/radius/shadow)
7. `packages/design-system/html/ErrorState.html` — migrate + add card styling + green retry button
8. `packages/design-system/html/KeyValue.html` — migrate text/font tokens

**Token replacements in HTML inline `<style>` blocks:**

| Lucid | Hearth |
|---|---|
| `var(--ok)` | `var(--status-success)` |
| `var(--warn)` | `var(--status-warning)` |
| `var(--danger)` | `var(--status-error)` |
| `var(--text-hi)` | `var(--text-primary)` |
| `var(--text-mid)` | `var(--text-secondary)` |
| `var(--text-lo)` | `var(--text-tertiary)` |
| `var(--primary)` | `var(--accent-primary)` |
| `var(--surface-2)` | `var(--surface-container)` (hover states) |
| `var(--surface-3)` | `var(--surface-container)` (input bg) |
| `var(--surface-4)` | `var(--surface-elevated)` (selected) |
| `var(--surface-5)` | `var(--surface-elevated)` (skeleton/kbd) |
| `var(--surface-ghost)` | `color-mix(in oklab, var(--text-secondary) 8%, transparent)` |
| `var(--surface-0)` | `var(--surface-page)` |
| `var(--r1)` | `var(--r-subtle)` |
| `var(--r2)` | `var(--r-default)` |
| `var(--r-pill)` | `var(--r-pill)` (unchanged) |
| `var(--mono)` | `var(--font-mono)` |
| `var(--ui)` | `var(--font-sans)` |

**Dependencies:** None (first task).

### Task 1: Update StatusChip.tsx

**File:** `packages/design-system/src/StatusChip.tsx`

**Changes:**
- Replace `STATUS_STYLES` record to use Hearth tokens:
  - `var(--ok)` -> `var(--status-success)` (healthy, done)
  - `var(--warn)` -> `var(--status-warning)` (behind)
  - `var(--danger)` -> `var(--status-error)` (blocked, error)
  - `var(--text-lo)` -> `var(--text-tertiary)` (paused -> changes to `--status-info`)
  - unknown -> `var(--text-tertiary)`
- Change paused from `--text-lo` to `--status-info` (blue per AC)
- Replace `font-heading` with `font-[family-name:var(--font-mono)]` in `CHIP_BASE`

**Dependencies:** Task 0 (HTML ref must be updated first for parity check).

### Task 2: Update Tag.tsx + tag-kinds.tsx

**Files:**
- `packages/design-system/src/Tag.tsx`
- `packages/design-system/src/tag-kinds.tsx`

**Changes in Tag.tsx:**
- Change `TAG_BASE` radius from `rounded-[var(--r2)]` to `rounded-[var(--r-pill)]`
- Change `font-[family-name:var(--ui)]` to `font-[family-name:var(--font-sans)]`
- Neutral tag: `bg-[var(--surface-ghost)]` -> `bg-[color-mix(in_oklab,var(--text-secondary)_8%,transparent)]`
- Neutral tag: `text-[var(--text-mid)]` -> `text-[var(--text-secondary)]`

**Changes in tag-kinds.tsx:**
- pattern: `text-[var(--text-mid)]` -> `text-[var(--text-secondary)]`
- decision: `text-[var(--primary)]` -> `text-[var(--accent-primary)]`
- failure: `text-[var(--danger)]` -> `text-[var(--status-error)]`

**Dependencies:** Task 0.

### Task 3: Update NavItem.tsx

**File:** `packages/design-system/src/NavItem.tsx`

**Changes:**
- Add `statusDot?: "success" | "warning" | "error" | "info"` to `NavItemProps`
- Change `baseClasses`:
  - `text-[var(--text-hi)]` -> `text-[var(--text-primary)]`
  - `rounded-[var(--r1)]` -> `rounded-[var(--r-subtle)]`
- Change `stateClasses`:
  - Selected: `bg-[var(--surface-4)]` -> `bg-[var(--surface-elevated)]`
  - Selected: `border-l-[var(--primary)]` -> `border-l-[var(--accent-primary)]`
  - Default: `hover:bg-[var(--surface-2)]` -> `hover:bg-[var(--accent-primary-dim)]`
- Icon color:
  - Selected: `text-[var(--primary)]` -> `text-[var(--accent-primary)]`
  - Default: `text-[var(--text-lo)]` -> `text-[var(--text-tertiary)]`
- Count badge:
  - `bg-[var(--surface-ghost)]` -> `bg-[color-mix(in_oklab,var(--text-secondary)_8%,transparent)]`
  - `font-[var(--mono)]` -> `font-[family-name:var(--font-mono)]`
  - `text-[var(--text-mid)]` -> `text-[var(--text-secondary)]`
- Add status dot rendering: 6px colored dot between label and count

**Export:** Add `statusDot` type to `NavItemProps` export in `index.ts` (already auto-exported via interface).

**Dependencies:** Task 0.

### Task 4: Update SearchField.tsx

**File:** `packages/design-system/src/SearchField.tsx`

**Changes:**
- Input:
  - `bg-[var(--surface-3)]` -> `bg-[var(--surface-container)]`
  - `rounded-[var(--r2)]` -> `rounded-[var(--r-default)]`
  - `font-[var(--ui)]` -> `font-[family-name:var(--font-sans)]`
  - `text-[var(--text-hi)]` -> `text-[var(--text-primary)]`
  - `placeholder:text-[var(--text-lo)]` -> `placeholder:text-[var(--text-placeholder)]`
  - `border border-transparent` -> `border border-[var(--border-default)]`
  - `focus:border-[var(--primary)]` -> `focus:border-[var(--accent-primary)]`
  - `focus:bg-[var(--surface-2)]` -> `focus:bg-[var(--surface-page)]`
  - Add: `focus:shadow-[0_0_0_3px_var(--accent-primary-dim)]`
- Search icon: `text-[var(--text-lo)]` -> `text-[var(--text-tertiary)]`
- Spinner:
  - `border-[var(--surface-5)]` -> `border-[var(--border-default)]`
  - `border-t-[var(--primary)]` -> `border-t-[var(--accent-primary)]`
- Clear button:
  - `text-[var(--text-lo)]` -> `text-[var(--text-tertiary)]`
  - `rounded-[var(--r1)]` -> `rounded-[var(--r-subtle)]`
  - `hover:bg-[var(--surface-ghost)]` -> `hover:bg-[color-mix(in_oklab,var(--text-secondary)_8%,transparent)]`
  - `hover:text-[var(--text-mid)]` -> `hover:text-[var(--text-secondary)]`
- Kbd:
  - `rounded-[var(--r1)]` -> `rounded-[var(--r-subtle)]`
  - `bg-[var(--surface-5)]` -> `bg-[var(--surface-elevated)]`
  - `text-[var(--text-lo)]` -> `text-[var(--text-tertiary)]`
  - `font-[var(--mono)]` -> `font-[family-name:var(--font-mono)]`

**Dependencies:** Task 0.

### Task 5: Update Skeleton.tsx

**File:** `packages/design-system/src/Skeleton.tsx`

**Changes:**
- `SKELETON_BAR`: `bg-[var(--surface-5)]` -> `bg-[var(--surface-container)]`
- `SKELETON_BAR`: `rounded-[var(--r2)]` -> `rounded-[var(--r-default)]`
- SkeletonCard wrapper: `bg-[var(--surface-3)]` -> `bg-[var(--surface-elevated)]`
- SkeletonCard wrapper: `rounded-[var(--r2)]` -> `rounded-[var(--r-default)]`

**Dependencies:** Task 0.

### Task 6: Update EmptyState.tsx

**File:** `packages/design-system/src/EmptyState.tsx`

**Changes:**
- Outer div: add `bg-[var(--surface-elevated)] rounded-[var(--r-default)] shadow-[var(--shadow-subtle)]`
- Title: `text-[var(--text-hi)]` -> `text-[var(--text-primary)]`
- Description: `text-[var(--text-lo)]` -> `text-[var(--text-tertiary)]`

**Dependencies:** Task 0.

### Task 7: Update ErrorState.tsx

**File:** `packages/design-system/src/ErrorState.tsx`

**Changes:**
- Outer div: add `bg-[var(--surface-elevated)] rounded-[var(--r-default)] shadow-[var(--shadow-subtle)]`
- Title: `text-[var(--danger)]` -> `text-[var(--status-error)]`
- Description: `text-[var(--text-lo)]` -> `text-[var(--text-tertiary)]`
- Retry button:
  - `text-[var(--surface-0)]` -> `text-[var(--text-on-accent)]`
  - `bg-[var(--primary)]` -> `bg-[var(--accent-primary)]`
  - `rounded-[var(--r2)]` -> `rounded-[var(--r-default)]`

**Dependencies:** Task 0.

### Task 8: Update KeyValue.tsx

**File:** `packages/design-system/src/KeyValue.tsx`

**Changes:**
- Label: `font-heading` -> `font-[family-name:var(--font-mono)]`
- Label: `text-[var(--text-lo)]` -> `text-[var(--text-tertiary)]`
- Value: `text-[var(--text-hi)]` -> `text-[var(--text-primary)]`

**Dependencies:** Task 0.

### Task 9: Update tag-tint CSS classes in tokens.css

**File:** `packages/design-system/src/tokens.css`

**Changes:** The `.tag-tint-*` classes already use Hearth tokens (`--text-secondary`, `--accent-primary`, `--status-error`). Verify and confirm NO CHANGE needed.

Also add a neutral tint class for the no-kind Tag (used by the TSX now):
```css
.tag-tint-neutral {
  background-color: color-mix(in oklab, var(--text-secondary) 8%, transparent);
}
```

Wait -- actually the TSX uses an inline arbitrary value for neutral Tag bg. To maintain pixel parity with the HTML reference, keep the inline approach. NO tokens.css change needed.

**Dependencies:** None.

### Task 10: Update stories files

**Files:**
- `packages/design-system/src/StatusChip.stories.tsx`
- `packages/design-system/src/Tag.stories.tsx`
- `packages/design-system/src/NavItem.stories.tsx`
- `packages/design-system/src/SearchField.stories.tsx`
- `packages/design-system/src/Skeleton.stories.tsx`
- `packages/design-system/src/EmptyState.stories.tsx`
- `packages/design-system/src/ErrorState.stories.tsx`
- `packages/design-system/src/KeyValue.stories.tsx`

**Changes:**
- Update any Lucid token references in demo wrapper elements (e.g., `bg-[var(--surface-3)]` in story containers)
- Add NavItem story with `statusDot` prop
- Verify render of all variants

**Dependencies:** Tasks 1-8.

### Task 11: Update unit tests

**Files:**
- `packages/web/src/__tests__/StatusChip.test.tsx` — update token assertions
- `packages/web/src/__tests__/NavItem.test.tsx` — update token assertions + add statusDot test
- `packages/web/src/__tests__/SearchField.test.tsx` — update token assertions
- `packages/web/src/__tests__/KeyValue.test.tsx` — update `font-heading` -> `font-[family-name:var(--font-mono)]` assertion
- `packages/web/src/__tests__/EmptyState.test.tsx` — no class assertions, likely safe
- `packages/web/src/__tests__/ErrorState.test.tsx` — no class assertions, likely safe
- `packages/web/src/__tests__/SkeletonList.test.tsx` — check if it asserts class names

**Critical assertion changes:**
| Test File | Old Assertion | New Assertion |
|---|---|---|
| StatusChip.test | `text-[var(--ok)]` | `text-[var(--status-success)]` |
| StatusChip.test | `text-[var(--warn)]` | `text-[var(--status-warning)]` |
| StatusChip.test | `text-[var(--danger)]` | `text-[var(--status-error)]` |
| StatusChip.test | `text-[var(--text-lo)]` (paused) | `text-[var(--status-info)]` |
| StatusChip.test | `font-heading` | `font-[family-name:var(--font-mono)]` |
| NavItem.test | `bg-[var(--surface-4)]` | `bg-[var(--surface-elevated)]` |
| NavItem.test | `border-l-[var(--primary)]` | `border-l-[var(--accent-primary)]` |
| SearchField.test | `bg-[var(--surface-3)]` | `bg-[var(--surface-container)]` |
| KeyValue.test | `font-heading` | `font-[family-name:var(--font-mono)]` |

**Dependencies:** Tasks 1-8.

### Task 12: Run verification

**Commands:**
1. `npm run check` — zero type errors
2. `npm run lint` — zero lint errors (watch for AQ rules on new token references)
3. `npm run test` — all green

**Dependencies:** Tasks 10-11.

---

## Type Signatures

### NavItemProps (updated)

```typescript
export interface NavItemProps {
  label: string;
  icon?: ReactNode;
  count?: number;
  selected?: boolean;
  statusDot?: "success" | "warning" | "error" | "info";
  onClick?: () => void;
}
```

### StatusChip STATUS_STYLES (updated values)

```typescript
const STATUS_STYLES: Record<Status | "unknown", StatusStyle> = {
  healthy: {
    chip: "bg-[color-mix(in_oklab,var(--status-success)_14%,transparent)] text-[var(--status-success)]",
    dot: "bg-[var(--status-success)]",
  },
  behind: {
    chip: "bg-[color-mix(in_oklab,var(--status-warning)_14%,transparent)] text-[var(--status-warning)]",
    dot: "bg-[var(--status-warning)]",
  },
  blocked: {
    chip: "bg-[color-mix(in_oklab,var(--status-error)_14%,transparent)] text-[var(--status-error)]",
    dot: "bg-[var(--status-error)]",
  },
  paused: {
    chip: "bg-[color-mix(in_oklab,var(--status-info)_14%,transparent)] text-[var(--status-info)]",
    dot: "bg-[var(--status-info)]",
  },
  done: {
    chip: "bg-[color-mix(in_oklab,var(--status-success)_14%,transparent)] text-[var(--status-success)]",
    dot: "bg-[var(--status-success)]",
  },
  error: {
    chip: "bg-[color-mix(in_oklab,var(--status-error)_14%,transparent)] text-[var(--status-error)]",
    dot: "bg-[var(--status-error)]",
  },
  unknown: {
    chip: "bg-[color-mix(in_oklab,var(--text-tertiary)_14%,transparent)] text-[var(--text-tertiary)]",
    dot: "bg-[var(--text-tertiary)]",
  },
};
```

---

## Risks and Ambiguities

### Risk 1: Downstream consumers of Lucid tokens

**Impact:** Other components in `packages/web/src/` (ArtifactView, Submenu, etc.) also use Lucid tokens. U7 only fixes the 8 Tier 1 primitives. The remaining components remain broken until their own track workpackages run.

**Mitigation:** U7 scope is limited to the 8 named components. Cross-cutting Lucid->Hearth migration of ALL web components is a Track U follow-up (U8 Tier 2, U9 screens).

### Risk 2: Visual regression test may fail during partial migration

**Impact:** If HTML is updated but TSX is not yet matched, the pixel-diff test will fail.

**Mitigation:** Update HTML and TSX in lockstep per-component (Task 0 then Tasks 1-8 in same commit). Run visual regression only after both are done.

### Risk 3: DaisyUI theme mismatch

**Impact:** The DaisyUI themes in tailwind.config.ts are still Lucid. Any DaisyUI class (`btn-primary`, `badge-success`) will render with Lucid colors, not Hearth.

**Mitigation:** U7 components do NOT use DaisyUI semantic classes for color (they use `var(--token)` directly). The ErrorState retry button currently uses `bg-[var(--primary)]` which becomes `bg-[var(--accent-primary)]` — direct token reference, no DaisyUI dependency.

### Risk 4: `font-heading` class used elsewhere

**Impact:** If other tests or components rely on StatusChip/KeyValue having `font-heading`, they may break.

**Mitigation:** Grep for consumers. The `font-heading` class resolves to `font-family: Geist Mono, ui-monospace, monospace` via Tailwind. The replacement `font-[family-name:var(--font-mono)]` resolves to `font-family: var(--font-mono)` which in Hearth is `ui-monospace, "SF Mono", "Cascadia Code", monospace`. The font stacks differ (Geist Mono vs system monospace). This is intentional — Hearth uses system fonts, not Geist. If production needs Geist Mono, a follow-up could add it to the `--font-mono` value.

### Risk 5: NavItem statusDot is a new API addition

**Impact:** Low risk — additive optional prop. No existing consumer breaks.

**Mitigation:** Add prop, render conditionally only when provided.

---

## Security & Abuse Cases

| Check | Applicable? | Notes |
|---|---|---|
| Rate-limit on POST/PATCH | N/A | Pure frontend component change, no API endpoints |
| Input-trust boundary | N/A | No new user input handling |
| Secret-handling | N/A | No credentials |
| Path-traversal | N/A | No file paths |
| SSRF | N/A | No outbound URLs |

U7 is a CSS/styling-only change with one additive prop. No security surface.

---

## Protected Tests

Tests whose behavior/assertions MUST remain stable (these verify functionality, not styling):

```
protectedTests: [
  "packages/web/src/__tests__/EmptyState.test.tsx",   // behavior only (role, text, testid)
  "packages/web/src/__tests__/ErrorState.test.tsx",   // behavior only (role, text, retry click)
  "packages/design-system/src/__tests__/ds-attrs.test.ts",  // data-ds-* attributes
  "packages/design-system/src/__tests__/density-tier.test.ts",  // density token values
  "packages/eslint-plugin-design/src/rules/__tests__/no-density-tokens.test.ts"  // lint rules
]
```

Tests that WILL be updated (assertion changes for new token names):
- `packages/web/src/__tests__/StatusChip.test.tsx`
- `packages/web/src/__tests__/NavItem.test.tsx`
- `packages/web/src/__tests__/SearchField.test.tsx`
- `packages/web/src/__tests__/KeyValue.test.tsx`

---

## Migrations (renamed symbols)

| Old Symbol | New Symbol | Affected Files |
|---|---|---|
| `font-heading` (class) | `font-[family-name:var(--font-mono)]` | StatusChip.tsx, KeyValue.tsx, StatusChip.test.tsx, KeyValue.test.tsx |
| `var(--ok)` | `var(--status-success)` | StatusChip.tsx, StatusChip.html, StatusChip.test.tsx |
| `var(--warn)` | `var(--status-warning)` | StatusChip.tsx, StatusChip.html, StatusChip.test.tsx |
| `var(--danger)` | `var(--status-error)` | StatusChip.tsx, ErrorState.tsx, StatusChip.html, ErrorState.html, StatusChip.test.tsx |
| `var(--text-lo)` | `var(--text-tertiary)` / `var(--text-placeholder)` | All 8 TSX + HTML + tests |
| `var(--text-hi)` | `var(--text-primary)` | All 8 TSX + HTML + tests |
| `var(--text-mid)` | `var(--text-secondary)` | NavItem, Tag, SearchField + tests |
| `var(--primary)` | `var(--accent-primary)` | NavItem, SearchField, ErrorState + tests |
| `var(--surface-ghost)` | `color-mix(...)` | NavItem, SearchField + tests |
| `var(--r1)` | `var(--r-subtle)` | NavItem, SearchField |
| `var(--r2)` | `var(--r-default)` | Tag, SearchField, Skeleton, ErrorState |
| `var(--mono)` | `var(--font-mono)` | NavItem, SearchField |
| `var(--ui)` | `var(--font-sans)` | Tag, SearchField |

---

## Execution Order Summary

```
Task 0: HTML references (all 8, design source of truth)
  |
  ├── Task 1: StatusChip.tsx
  ├── Task 2: Tag.tsx + tag-kinds.tsx
  ├── Task 3: NavItem.tsx (+ new statusDot prop)
  ├── Task 4: SearchField.tsx
  ├── Task 5: Skeleton.tsx
  ├── Task 6: EmptyState.tsx
  ├── Task 7: ErrorState.tsx
  └── Task 8: KeyValue.tsx
       |
       Task 9: tokens.css verification (no-op expected)
       |
       Task 10: Stories files
       |
       Task 11: Unit tests
       |
       Task 12: npm run verify
```

Tasks 1-8 are independent of each other and can be done in any order (all depend only on Task 0). Tasks 10-11 depend on 1-8. Task 12 depends on all.
