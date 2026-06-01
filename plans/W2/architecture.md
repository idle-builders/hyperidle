# W2 Architecture Plan

## Required Reading

The builder must read these files before implementing:

- `packages/design-system/DESIGN.md` -- Hearth design language, token reference, component tiers
- `packages/design-system/AESTHETICS.md` -- AQ rules protecting the Hearth feeling
- `packages/design-system/PRINCIPLES.md` -- Seven universals + Hearth principles
- `packages/design-system/src/tokens.css` -- Current token file (will be modified)
- `packages/design-system/html/_tokens.css` -- HTML token file (source of truth for Hearth values)
- `.claude/rules/visual-parity.md` -- HTML is the design reference, never change it
- `.claude/rules/design-system.md` -- Dual representation, story format, ds:sync
- `plans/W2/design/approved.md` -- Approved design spec with component mapping

---

## Phase 0 -- Interrogation

All questions settled by the spec, design, and codebase reads:

**Q1: What is the ds:sync script situation?** Root `package.json` has `"ds:sync": "npm run -w @hyperidle/design-system sync-check"` but `packages/design-system/package.json` has no `sync-check` script. The design-system has `"test:visual": "playwright test --config playwright.config.ts"` which runs `visual-regression.test.ts`. Resolution: add `"sync-check": "playwright test --config playwright.config.ts"` to design-system package.json. This wires `npm run ds:sync` at root to the visual regression test.

**Q2: Do new primitives use forwardRef?** Button is the strongest candidate (consumers may need ref for focus management, tooltips, popovers). All other primitives are self-contained and unlikely to need ref forwarding. Resolution: Button uses forwardRef. Others do not. This can be added later if needed.

**Q3: What happens to touch-target E2E tests after density removal?** The tests assert 44px touch targets under `[data-density="comfortable"]`. Without density, the default Hearth row height is 42px (from _tokens.css). The existing touch-targets.spec.ts tests need density references removed and the 44px assertion re-evaluated. Resolution: Update the tests to assert touch targets against the Hearth defaults. Where Hearth defaults are under 44px, add min-height to the component. The 42px row-h is close enough that padding/line-height brings total interactive area above 44px in practice, but each interactive element must be measured.

**Q4: Avatar/AvatarGroup same file or separate?** AvatarGroup is 15 lines of JSX. It's a thin composition wrapper, not a standalone concept. Resolution: Same file (`Avatar.tsx`), both exported. This matches the HTML reference (Avatar.html contains both).

---

## Plan Reconciliation (Spec vs Reality)

| Spec assumption | Reality | Resolution |
|---|---|---|
| `sync-check` script exists | Does not exist in design-system/package.json | Add it (Task 1) |
| `useDensity.ts` exists at stated path | Confirmed: `packages/web/src/hooks/useDensity.ts` | Delete in Task 2 |
| `useAutoDensity.ts` exists at stated path | Confirmed: `packages/web/src/hooks/useAutoDensity.ts` | Delete in Task 2 |
| `density-toggle.spec.ts` exists | Confirmed: `packages/web/e2e/density-toggle.spec.ts` | Delete in Task 2 |
| `responsive-density.spec.ts` exists | Confirmed: `packages/web/e2e/responsive-density.spec.ts` | Delete in Task 2 |
| `auto-density.test.tsx` exists | Confirmed: `packages/web/src/__tests__/auto-density.test.tsx` | Delete in Task 2 |
| `useDensity.test.ts` exists | Confirmed: `packages/web/src/__tests__/useDensity.test.ts` | Delete in Task 2 |
| `density-tier.test.ts` exists | Confirmed: `packages/design-system/src/__tests__/density-tier.test.ts` | Delete in Task 2 |
| `density-allowlist.json` exists | Confirmed: `packages/eslint-plugin-design/density-allowlist.json` | Delete in Task 2 |
| `use-density-tokens.ts` rule exists | Confirmed: `packages/eslint-plugin-design/src/rules/use-density-tokens.ts` | Delete in Task 2 |
| `no-density-tokens.ts` rule exists | Confirmed: `packages/eslint-plugin-design/src/rules/no-density-tokens.ts` | Delete in Task 2 |
| `Density` type in settings-types.ts | Confirmed at line 86 | Remove in Task 2 |
| `no-ai-aesthetic.ts` references density | Line 102: error message mentions density tokens | Update message in Task 2 |
| `no-off-grid-spacing.ts` references density | Line 33: error message mentions density tokens | Update message in Task 2 |
| `foundation.test.ts` has density describe block | Lines 247-288: entire `describe("index.css density tokens")` block | Delete block in Task 2 |
| `AppShell.test.tsx` has density tests | Lines 146-226: `describe("density wiring (J1)")` block | Delete block in Task 2 |
| `settings-redesign.spec.ts` has density tests | Lines 239-276: two density tests | Delete tests in Task 2 |
| `touch-targets.spec.ts` references density | Multiple references throughout; one test is already `.skip`ped | Update/remove density refs in Task 2 |
| `aesthetic-quality.md` has 4 density AQ rules | AQ-002, AQ-003, AQ-016, AQ-017 | Remove in Task 2 |
| 41 density token refs in design-system/src | Across ThreadRow, BetCard, etc. | Replace in Tasks 2+4 |
| 32 density token refs in web/src | Across WorkTeam, WorkPortfolio, etc. | Replace in Tasks 2+5 |
| `--easing-expressive` token missing | Not in either token file, used inline in Toggle.html | Add in Task 3 |
| `_tokens.css` --tracking-caps is 0.02em | tokens.css has 0.08em (correct) | Fix _tokens.css in Task 3 |
| `_tokens.css` missing --tracking-caps-sm | tokens.css has it (0.06em) | Add to _tokens.css in Task 3 |

---

## Acceptance Criteria

### AC-1: Density system completely removed
**Verification:** `grep -rn "data-density\|useDensity\|useAutoDensity\|density-allowlist\|density-tier\|density-toggle\|responsive-density\|auto-density" packages/` returns zero results (excluding comments/lore that explain the removal, TRACK-W.md, and this plan). `npm run check` passes. `npm run lint` passes.

### AC-2: Token files synced with zero drift
**Verification:** A test (or manual diff) confirms that every CSS custom property name+value pair in `_tokens.css` exists with the same value in `tokens.css` (shared tokens section). The `--easing-expressive` token exists in both files. `--tracking-caps` is 0.08em in both. `--tracking-caps-sm` is 0.06em in both. `--leading-body` and `--card-max-h` exist in the `:root` block (not inside density blocks, which no longer exist).

### AC-3: All 10 Tier 0 primitives exist as TSX with stories
**Verification:** The following files exist and export React components: `Avatar.tsx`, `Button.tsx`, `Input.tsx`, `Select.tsx`, `Toggle.tsx`, `Checkbox.tsx`, `TabBar.tsx`, `Toast.tsx`, `Progress.tsx`. Each has a sibling `.stories.tsx`. Each is exported from `index.ts`. `npm run check` passes with zero errors on the design-system package.

### AC-4: ds:sync passes for all new primitives (less than 5% pixel diff)
**Verification:** `npm run ds:sync` runs the visual-regression.test.ts with all new primitives in the COMPONENTS array. Each passes the 5% threshold. The sync-reports directory contains html.png, tsx.png, diff.png, and result.json for each.

### AC-5: ds:sync passes for all existing components (less than 5% pixel diff)
**Verification:** `npm run ds:sync` passes for all 16 existing components plus the new ones. Zero failures.

### AC-6: All density token references replaced in production code
**Verification:** `grep -rn "var(--density" packages/design-system/src/ packages/web/src/ --include="*.tsx" --include="*.ts" | grep -v "__tests__" | grep -v "e2e"` returns zero results.

### AC-7: SettingsAppearance has no density UI
**Verification:** The SettingsAppearance component renders only a theme selector. No density selector exists in the DOM. The `Density` type is removed from `settings-types.ts`.

### AC-8: ESLint density rules removed
**Verification:** `npm run lint` passes. The `use-density-tokens` and `no-density-tokens` rules do not exist in the plugin. The `density-allowlist.json` file does not exist.

### AC-9: Page-level visual match with W1 screen mockups
**Verification:** Playwright screenshots of each page (conversations, work, knowledge, settings, onboarding, error states) in light and dark mode. Side-by-side visual comparison confirms match with W1 HTML screen mockups.

### AC-10: npm run verify passes
**Verification:** Full verify pipeline (typecheck + lint + tests + build + E2E) passes with zero errors.

---

## Ordered Task List

### Task 1: Wire ds:sync script
**Files:** `packages/design-system/package.json`
**Change:** Add `"sync-check": "playwright test --config playwright.config.ts"` to scripts.
**Verification:** `npm run ds:sync` from root successfully invokes the visual regression test suite.
**Dependencies:** None.

### Task 2: Density strip (atomic commit)
**Files (delete):**
- `packages/web/src/hooks/useDensity.ts`
- `packages/web/src/hooks/useAutoDensity.ts`
- `packages/web/e2e/density-toggle.spec.ts`
- `packages/web/e2e/responsive-density.spec.ts`
- `packages/web/src/__tests__/auto-density.test.tsx`
- `packages/web/src/__tests__/useDensity.test.ts`
- `packages/design-system/src/__tests__/density-tier.test.ts`
- `packages/eslint-plugin-design/density-allowlist.json`
- `packages/eslint-plugin-design/src/rules/use-density-tokens.ts`
- `packages/eslint-plugin-design/src/rules/no-density-tokens.ts`

**Files (modify):**
- `packages/design-system/src/tokens.css` -- delete all `[data-density]` blocks (compact, default, comfortable); move `--leading-body: 1.55` and `--card-max-h: 70vh` to `:root` shared tokens section
- `packages/design-system/html/_tokens.css` -- delete all `--density-*` tokens from `:root` block
- `packages/eslint-plugin-design/src/index.ts` -- remove density rule imports, registrations, and recommended config entries
- `packages/web/src/settings/SettingsAppearance.tsx` -- remove density import, state, handler, and select UI; keep theme select only
- `packages/web/src/settings/settings-types.ts` -- remove `Density` type, `ResolvedDensity` type; remove `density` from `AppearanceSettings`
- `packages/web/src/__tests__/foundation.test.ts` -- delete the `describe("index.css density tokens")` block (lines 247-288)
- `packages/web/src/__tests__/AppShell.test.tsx` -- delete the `describe("density wiring (J1)")` block (lines 146-226) and any density-specific setup
- `packages/web/e2e/settings-redesign.spec.ts` -- delete the two density tests ("applies density immediately", "density preference persists")
- `packages/web/e2e/touch-targets.spec.ts` -- remove density references from lore comments; update the skipped NavItem test; remove `[data-density]` assertions; the 44px floor tests should still work against Hearth defaults
- `packages/eslint-plugin-design/src/rules/no-ai-aesthetic.ts` -- update error message at line 102 to remove density token suggestion
- `packages/eslint-plugin-design/src/rules/no-off-grid-spacing.ts` -- update error message at line 33 to remove density token suggestion
- `.claude/rules/aesthetic-quality.md` -- remove AQ-002, AQ-003, AQ-016, AQ-017

**Density token replacement in design-system/src/ (41 references):**
Each `var(--density-*)` reference replaced with the Hearth literal value per the HTML reference for that component. Specific mapping per component:

| File | Token | Replacement |
|---|---|---|
| `ThreadRow.tsx` | `--density-gap` | 12px (`--space-4`) |
| `ThreadRow.tsx` | `--density-pad-x` | 24px (`--space-8`) |
| `ThreadRow.tsx` | `--density-pad-y` | 12px (`--space-4`) |
| `ThreadRow.tsx` | `--density-text` | 15px (`--text-base`) |
| `ThreadRow.tsx` | `--density-avatar-size` | 36px (Avatar default) |
| `BetCard.tsx` | `--density-card-pad` | 18px (`--space-6`) |
| `BetCard.tsx` | `--density-card-gap` | 6px (`--space-2`) |
| `BetCard.tsx` | `--density-gap` | 12px (`--space-4`) |
| `BetCard.tsx` | `--density-text` | 15px (`--text-base`) |
| `TaskCard.tsx` | `--density-card-pad` | 18px (`--space-6`) |
| `TaskCard.tsx` | `--density-card-gap` | 6px (`--space-2`) |
| `TaskCard.tsx` | `--density-gap` | 12px (`--space-4`) |
| `TaskCard.tsx` | `--density-text` | 15px (`--text-base`) |
| `CommentRow.tsx` | `--density-pad-x` | 12px (`--space-4`) |
| `KnowledgeRow.tsx` | `--density-gap` | 12px (`--space-4`) |
| `KnowledgeRow.tsx` | `--density-pad-x` | 24px (`--space-8`) |
| `KnowledgeRow.tsx` | `--density-pad-y` | 12px (`--space-4`) |
| `KnowledgeRow.tsx` | `--density-text` | 15px (`--text-base`) |
| `NotificationRow.tsx` | `--density-gap` | 12px (`--space-4`) |
| `NotificationRow.tsx` | `--density-pad-y` | 12px (`--space-4`) |
| `NotificationRow.tsx` | `--density-pad-x` | 24px (`--space-8`) |
| `NotificationRow.tsx` | `--density-text` | 15px (`--text-base`) |
| `ErrorState.tsx` | `--density-card-gap` | 6px (`--space-2`) |
| `ErrorState.tsx` | `--density-pad-x` | 18px (`--space-6`) |
| `ErrorState.tsx` | `--density-card-pad` | 18px (`--space-6`) |
| `ErrorState.tsx` | `--density-text` | 15px (`--text-base`) |
| `Composer.tsx` | `--density-pad-y` | 12px (`--space-4`) |
| `Composer.tsx` | `--density-pad-x` | 12px (`--space-4`) |
| `KeyValue.tsx` | `--density-card-gap` | 6px (`--space-2`) |
| `KeyValue.tsx` | `--density-text` | 15px (`--text-base`) |
| `ThreadHostBanner.tsx` | `--density-pad-y` | 12px (`--space-4`) |
| `ThreadHostBanner.tsx` | `--density-pad-x` | 12px (`--space-4`) |
| `ThreadShell.tsx` | `--density-card-pad` | 12px (`--space-4`) |
| `ThreadShell.tsx` | `--density-pad-y` | 12px (`--space-4`) |

**Density token replacement in web/src/ (32 references):**
| File | Token | Replacement |
|---|---|---|
| `WorkTeam.tsx` (9x) | `--density-gap` | 12px (`--space-4`) |
| `WorkTeam.tsx` (2x) | `--density-card-pad` | 18px (`--space-6`) |
| `WorkTeam.tsx` (2x) | `--density-card-gap` | 6px (`--space-2`) |
| `WorkTeam.tsx` (1x) | `--density-text` | 15px (`--text-base`) |
| `WorkPortfolio.tsx` (4x) | `--density-gap` | 12px (`--space-4`) |
| `ArtifactSection.tsx` (2x) | `--density-gap` | 12px (`--space-4`) |
| `HostThreadSection.tsx` | `--density-text` | 15px (`--text-base`) |
| `HostThreadSection.tsx` | `--density-card-gap` | 6px (`--space-2`) |
| `HostThreadSection.tsx` | `--density-pad-x` | 12px (`--space-4`) |
| `HostThreadSection.tsx` | `--density-card-pad` | 12px (`--space-4`) |
| `ArtifactView.tsx` | `--density-card-pad` | 12px (`--space-4`) |
| `SetupFlow.tsx` | `--density-text-h1` | 24px (`--text-2xl`) |
| `SetupFlow.tsx` | `--density-page-gutter` | 24px (`--space-8`) |
| `Conversations.tsx` | `--density-text` | 15px (`--text-base`) |
| `Conversations.tsx` | `--density-card-gap` | 6px (`--space-2`) |
| `Conversations.tsx` | `--density-card-pad` | 12px (`--space-4`) |
| `WorkBet.tsx` | `--density-text` | 15px (`--text-base`) |
| `WorkBet.tsx` | `--density-card-gap` | 6px (`--space-2`) |
| `WorkBet.tsx` | `--density-card-pad` | 12px (`--space-4`) |
| `KnowledgeList.tsx` | `--density-text` | 15px (`--text-base`) |
| `KnowledgeList.tsx` | `--density-card-gap` | 6px (`--space-2`) |

Note: The exact Tailwind class replacement depends on the component. `var(--density-gap)` becoming `12px` means `gap-[var(--density-gap)]` becomes `gap-[12px]` or `gap-3` (if the Tailwind arbitrary value is cleaner). The builder should prefer `[Npx]` arbitrary values that match the Hearth grid rather than abstract Tailwind spacing classes, since the HTML references use exact pixel values.

**Verification:** `npm run check && npm run lint` pass. `grep -rn "density" packages/` shows only lore comments, TRACK-W.md, and plan files. All existing tests pass (minus the deleted density tests).
**Dependencies:** None.

### Task 3: Token sync
**Files:**
- `packages/design-system/html/_tokens.css` -- fix `--tracking-caps: 0.08em`, add `--tracking-caps-sm: 0.06em`, add `--easing-expressive: cubic-bezier(0.34, 1.56, 0.64, 1)`
- `packages/design-system/src/tokens.css` -- add `--easing-expressive: cubic-bezier(0.34, 1.56, 0.64, 1)` to `:root` shared tokens, move `--leading-body: 1.55` to `:root` shared tokens (if not done in Task 2)

**Verification:** Diff of shared token values between the two files shows zero mismatches. A new test in `packages/design-system/src/__tests__/token-sync.test.ts` parses both files and asserts every CSS custom property name+value pair in `_tokens.css` has a matching entry in `tokens.css`.
**Dependencies:** Task 2 (density blocks removed first).

### Task 4: Build Tier 0 primitives (10 components)

Build in dependency order. Each primitive is one sub-task with its own commit.

#### Task 4a: Avatar + AvatarGroup
**Files (create):**
- `packages/design-system/src/Avatar.tsx` -- Avatar and AvatarGroup components
- `packages/design-system/src/Avatar.stories.tsx` -- Demo stories for sizes, agent variant, groups
**Files (modify):**
- `packages/design-system/src/index.ts` -- add Avatar, AvatarGroup, AvatarProps, AvatarGroupProps exports
- `packages/design-system/src/__tests__/visual-regression.test.ts` -- add "Avatar" to COMPONENTS array, add EXPECTED_MARKERS entry

**Type signature:**
```typescript
export interface AvatarProps {
  initials: string;
  size?: 'sm' | 'md' | 'lg';
  agent?: boolean;
  className?: string;
}

export interface AvatarGroupProps {
  children: ReactNode;
  small?: boolean;
  className?: string;
}

export function Avatar(props: AvatarProps): JSX.Element;
export function AvatarGroup(props: AvatarGroupProps): JSX.Element;
```

**data-ds-component:** `"Avatar"` on Avatar, `"AvatarGroup"` on AvatarGroup
**Verification:** `npm run ds:sync` passes for Avatar (less than 5% diff against Avatar.html).
**Dependencies:** Tasks 2, 3.

#### Task 4b: Button
**Files (create):**
- `packages/design-system/src/Button.tsx`
- `packages/design-system/src/Button.stories.tsx`
**Files (modify):**
- `packages/design-system/src/index.ts` -- add Button, ButtonProps exports
- visual-regression.test.ts -- add "Button" to COMPONENTS, EXPECTED_MARKERS, INTERACTIVE_COMPONENTS

**Type signature:**
```typescript
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive' | 'amber';
  size?: 'sm' | 'default';
}

export const Button: React.ForwardRefExoticComponent<ButtonProps & React.RefAttributes<HTMLButtonElement>>;
```

**data-ds-component:** `"Button"`
**Verification:** `npm run ds:sync` passes for Button.
**Dependencies:** Tasks 2, 3.

#### Task 4c: Input
**Files (create):**
- `packages/design-system/src/Input.tsx`
- `packages/design-system/src/Input.stories.tsx`
**Files (modify):** index.ts, visual-regression.test.ts

**Type signature:**
```typescript
export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  hint?: string;
  error?: string;
  textarea?: boolean;
}

export function Input(props: InputProps): JSX.Element;
```

**data-ds-component:** `"Input"`
**Verification:** `npm run ds:sync` passes for Input.
**Dependencies:** Tasks 2, 3.

#### Task 4d: Select
**Files (create):**
- `packages/design-system/src/Select.tsx`
- `packages/design-system/src/Select.stories.tsx`
**Files (modify):** index.ts, visual-regression.test.ts

**Type signature:**
```typescript
export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: string;
  options: { value: string; label: string }[];
}

export function Select(props: SelectProps): JSX.Element;
```

**data-ds-component:** `"Select"`
**Verification:** `npm run ds:sync` passes for Select.
**Dependencies:** Tasks 2, 3.

#### Task 4e: Toggle
**Files (create):**
- `packages/design-system/src/Toggle.tsx`
- `packages/design-system/src/Toggle.stories.tsx`
**Files (modify):** index.ts, visual-regression.test.ts

**Type signature:**
```typescript
export interface ToggleProps {
  on?: boolean;
  label: string;
  description?: string;
  onChange?: (on: boolean) => void;
  disabled?: boolean;
}

export function Toggle(props: ToggleProps): JSX.Element;
```

**data-ds-component:** `"Toggle"`
**Verification:** `npm run ds:sync` passes for Toggle.
**Dependencies:** Tasks 2, 3.

#### Task 4f: Checkbox
**Files (create):**
- `packages/design-system/src/Checkbox.tsx`
- `packages/design-system/src/Checkbox.stories.tsx`
**Files (modify):** index.ts, visual-regression.test.ts

**Type signature:**
```typescript
export interface CheckboxProps {
  checked?: boolean;
  label: string;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
}

export function Checkbox(props: CheckboxProps): JSX.Element;
```

**data-ds-component:** `"Checkbox"`
**Verification:** `npm run ds:sync` passes for Checkbox.
**Dependencies:** Tasks 2, 3.

#### Task 4g: TabBar
**Files (create):**
- `packages/design-system/src/TabBar.tsx`
- `packages/design-system/src/TabBar.stories.tsx`
**Files (modify):** index.ts, visual-regression.test.ts

**Type signature:**
```typescript
export interface TabBarProps {
  tabs: { id: string; label: string }[];
  activeId: string;
  onChange?: (id: string) => void;
  variant?: 'pill' | 'underline';
}

export function TabBar(props: TabBarProps): JSX.Element;
```

**data-ds-component:** `"TabBar"`
**Verification:** `npm run ds:sync` passes for TabBar.
**Dependencies:** Tasks 2, 3.

#### Task 4h: Toast
**Files (create):**
- `packages/design-system/src/Toast.tsx`
- `packages/design-system/src/Toast.stories.tsx`
**Files (modify):** index.ts, visual-regression.test.ts

**Type signature:**
```typescript
export interface ToastProps {
  variant: 'success' | 'error' | 'warning' | 'info';
  icon: ReactNode;
  title: string;
  message: string;
  onClose?: () => void;
}

export function Toast(props: ToastProps): JSX.Element;
```

**data-ds-component:** `"Toast"`
**Verification:** `npm run ds:sync` passes for Toast.
**Dependencies:** Tasks 2, 3.

#### Task 4i: Progress
**Files (create):**
- `packages/design-system/src/Progress.tsx`
- `packages/design-system/src/Progress.stories.tsx`
**Files (modify):** index.ts, visual-regression.test.ts

**Type signature:**
```typescript
export interface ProgressProps {
  value: number;
  label?: string;
  variant?: 'green' | 'amber';
}

export function Progress(props: ProgressProps): JSX.Element;
```

**data-ds-component:** `"Progress"`
**Verification:** `npm run ds:sync` passes for Progress.
**Dependencies:** Tasks 2, 3.

### Task 5: Update existing components (Tier 1-3)

For each existing component whose HTML was updated in W1, update the TSX to match. This includes:

1. Integrating new Tier 0 primitives where the component previously used inline markup (e.g., ThreadRow replacing inline avatar div with `<Avatar>`)
2. Updating spacing/layout values to match the HTML reference exactly
3. Updating stories to use new primitives

**Files (modify) -- in dependency order:**
- `packages/design-system/src/StatusChip.tsx` + `.stories.tsx`
- `packages/design-system/src/Tag.tsx` + `.stories.tsx`
- `packages/design-system/src/KeyValue.tsx` + `.stories.tsx`
- `packages/design-system/src/NavItem.tsx` + `.stories.tsx`
- `packages/design-system/src/SearchField.tsx` + `.stories.tsx`
- `packages/design-system/src/ThreadRow.tsx` + `.stories.tsx`
- `packages/design-system/src/BetCard.tsx` + `.stories.tsx`
- `packages/design-system/src/TaskCard.tsx` + `.stories.tsx`
- `packages/design-system/src/CommentRow.tsx` + `.stories.tsx`
- `packages/design-system/src/KnowledgeRow.tsx` + `.stories.tsx`
- `packages/design-system/src/NotificationRow.tsx` + `.stories.tsx`
- `packages/design-system/src/EmptyState.tsx` + `.stories.tsx`
- `packages/design-system/src/ErrorState.tsx` + `.stories.tsx`
- `packages/design-system/src/Composer.tsx` + `.stories.tsx`
- `packages/design-system/src/RichMessageCard.tsx` + `.stories.tsx`
- `packages/design-system/src/ThreadHostBanner.tsx` + `.stories.tsx`
- `packages/design-system/src/ThreadShell.tsx` + `.stories.tsx`
- `packages/design-system/src/Skeleton.tsx` + `.stories.tsx`

**Verification:** `npm run ds:sync` passes for ALL components (new and existing). Zero failures at the 5% threshold.
**Dependencies:** Task 4 (new primitives must exist before components can import them).

### Task 6: Page-level assembly

Update pages to match W1 screen mockups. Pages use existing route architecture -- changes are component swaps and layout adjustments.

**Files (modify):**
- `packages/web/src/shell/Sidebar.tsx` -- status dots, brand wordmark, dividers, active state styling
- `packages/web/src/settings/SettingsAppearance.tsx` -- theme-only layout (density already removed in Task 2)
- `packages/web/src/pages/Conversations.tsx` -- component swaps to use updated ThreadRow, EmptyState
- `packages/web/src/pages/WorkTeam.tsx` -- use updated BetCard, TaskCard
- `packages/web/src/pages/WorkPortfolio.tsx` -- use updated BetCard grid
- `packages/web/src/pages/WorkBet.tsx` -- use updated components
- `packages/web/src/pages/KnowledgeList.tsx` -- use updated KnowledgeRow
- `packages/web/src/pages/SetupFlow.tsx` -- match onboarding mockup
- `packages/web/src/shell/HostThreadSection.tsx` -- layout adjustments
- `packages/web/src/shell/ArtifactView.tsx` -- layout adjustments
- `packages/web/src/components/ArtifactSection.tsx` -- layout adjustments

**Verification:** Playwright screenshots of each page in light and dark mode compared with W1 HTML screen mockups. Visual match confirmed.
**Dependencies:** Task 5 (components must be updated first).

### Task 7: Final verification
**Actions:**
- Run `npm run ds:sync` -- all components pass
- Run `npm run verify` -- all tools pass (typecheck + lint + tests + build + E2E)
- Take Playwright screenshots of every page in light and dark mode
- Visual comparison with W1 mockups
**Dependencies:** Tasks 1-6.

---

## Security & Abuse Cases

| Check | Applicable? | Resolution |
|---|---|---|
| Rate-limit on POST/PATCH | N/A | No new API endpoints |
| Input-trust boundary | N/A | No new user input processing |
| Secret handling | N/A | No new credentials |
| Path traversal | N/A | No path inputs |
| SSRF | N/A | No outbound URLs |

W2 is a pure frontend visual parity workpackage. No new API endpoints, no new data flows, no new user inputs beyond existing form controls getting restyled. The security surface is unchanged.

---

## Protected Tests

Tests whose assertions must NOT change (they verify existing non-density behavior):

```
protectedTests:
  - packages/web/src/__tests__/foundation.test.ts  # Non-density assertions preserved
  - packages/web/src/__tests__/AppShell.test.tsx    # Non-density assertions preserved
  - packages/web/e2e/touch-targets.spec.ts          # 44px floor assertions preserved (density refs removed)
  - packages/web/e2e/settings-redesign.spec.ts      # Non-density settings tests preserved
  - packages/design-system/src/__tests__/visual-regression.test.ts  # Test framework preserved; COMPONENTS array extended
```

Note: The density-specific assertions within these files are REMOVED (they test removed functionality). The non-density assertions (token presence, theme switching, touch targets, visual regression framework) are preserved.

---

## Migrations

### Removed symbols -- call-site audit

| Symbol | Action | Call sites to update |
|---|---|---|
| `useDensity` hook | delete | `SettingsAppearance.tsx` (1 import + 1 call) |
| `useAutoDensity` hook | delete | Search confirms: no production imports outside its own file (only test files) |
| `Density` type | delete | `SettingsAppearance.tsx` (1 import + 2 usages), `useDensity.ts` (deleted), `useAutoDensity.ts` (deleted) |
| `ResolvedDensity` type | delete | `useAutoDensity.ts` (deleted), `settings-types.ts` (definition) |
| `DENSITY_STORAGE_KEY` | delete | `useDensity.ts` (deleted), `useDensity.test.ts` (deleted) |
| `resolveDensity` function | delete | `useAutoDensity.ts` (deleted), `auto-density.test.tsx` (deleted) |
| `MOBILE_BREAKPOINT_MAX` | delete | `useAutoDensity.ts` (deleted), `auto-density.test.tsx` (deleted) |
| `density-allowlist.json` | delete | `use-density-tokens.ts` (deleted), `no-density-tokens.ts` (deleted) -- both rules import it |
| `useDensityTokens` rule | delete | `eslint-plugin-design/src/index.ts` (1 import + 2 registrations) |
| `noDensityTokens` rule | delete | `eslint-plugin-design/src/index.ts` (1 import + 2 registrations) |
| `DENSITY_OPTIONS` constant | delete | `SettingsAppearance.tsx` (1 definition + 1 usage) |
| `AppearanceSettings.density` | delete field | `settings-types.ts` (definition), `SettingsAppearance.tsx` (consumer) |

---

## Risks and Ambiguities

### Risk 1: Touch target regression
**Impact:** Medium. Removing density means no mobile auto-comfortable (which bumped row heights to 56px on mobile). Default Hearth row-h is 42px, below the 44px AQ-015 floor.
**Mitigation:** During Task 2, verify that all interactive elements clear 44px at mobile viewports. Where they don't, add explicit `min-h-[44px]` to the component. The touch-target E2E tests (preserved) will catch regressions.

### Risk 2: ds:sync flakiness
**Impact:** Low-Medium. The visual regression test uses pixelmatch with a 5% threshold. Font rendering differences between CDN React (HTML side, React 18.3.1) and bundled React (TSX side, React 19) could cause sub-pixel differences.
**Mitigation:** The FREEZE_CSS in the test disables animations. The 5% threshold is deliberately generous. If specific components consistently hit 4-5%, investigate font-weight/size differences first.

### Risk 3: Large density strip commit
**Impact:** Low. The density strip touches ~30 files. A single commit is large but necessary to avoid intermediate broken states (half-removed density system).
**Mitigation:** The commit is purely mechanical: delete files, delete CSS blocks, find-replace tokens. Each replacement is individually verifiable against the HTML reference. Run `npm run check && npm run lint && npm run test` after the commit.

### Risk 4: Existing component TSX divergence
**Impact:** Medium. Some existing TSX components may have structural differences from their HTML references that go beyond density tokens (e.g., different DOM structure, missing elements, extra wrapper divs).
**Mitigation:** The builder should read each component's HTML file carefully before updating the TSX. The ds:sync pixelmatch gate is the final arbiter -- if the diff is above 5%, the TSX needs more work.

---

## Design-It-Twice: Token replacement strategy

### Option A: Replace density tokens with --space-* token vars
Replace `var(--density-gap)` with `var(--space-4)` in Tailwind classes: `gap-[var(--space-4)]`.

**Trade-off:** Preserves indirection through CSS custom properties. If Hearth values change later, one file change propagates. But: doubles the indirection (Tailwind arbitrary value wrapping a CSS var) and the HTML references don't use --space-* tokens -- they use literal px values.

**Reject because:** The HTML references (source of truth) use literal values. Adding indirection that the HTML doesn't have creates a maintenance asymmetry. Also, `gap-[var(--space-4)]` is harder to read than `gap-[12px]`.

### Option B: Replace density tokens with literal pixel values
Replace `var(--density-gap)` with `12px` in Tailwind classes: `gap-[12px]`.

**Trade-off:** Direct, readable, matches the HTML references. If Hearth values change, a find-replace is needed. But: values are on the Hearth 6px grid so they rarely change, and the ds:sync gate catches any HTML/TSX drift.

**Chosen: Option B.** Literal pixel values match the HTML references exactly, are easy to compare during visual parity work, and are caught by the ds:sync gate if they drift. The `no-off-grid-spacing` lint rule still enforces the Hearth grid.
