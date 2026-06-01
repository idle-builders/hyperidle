# Variant: Bottom-Up Trickle

## User Story (1 sentence)

As a user of HyperIdle, I want every screen to look identical to the W1 HTML mockups, achieved by the builder fixing foundation primitives first so improvements cascade upward through the component dependency graph.

## Strategy

The implementation follows the component dependency graph bottom-up:

```
Tier 0 (Foundation)          Tier 1 (Atoms)          Tier 2 (Molecules)        Tier 3 (Shell/Pages)
Avatar, AvatarGroup    -->   StatusChip, Tag     --> BetCard, ThreadRow    --> Sidebar, Pages
Button                 -->   NavItem             --> Composer, EmptyState  --> Screen mockups
Input, Select          -->   SearchField         --> ErrorState            --> Settings
Toggle, Checkbox       -->   KeyValue            --> CommentRow            -->
Toast, TabBar          -->                       --> RichMessageCard       -->
Progress               -->                       --> KnowledgeRow          -->
```

Fix Avatar's TSX to match its HTML (36px default, 28px sm, 48px lg, agent green tint). Every component consuming Avatar (CommentRow, ThreadRow, BetCard sidebar) inherits the correct rendering without individual fixes.

## Phase 0: Density Strip (Infrastructure Prerequisite)

Before any component work, remove the density system entirely:

**tokens.css changes:**
- Delete `[data-density="default"]` block (lines 280-316) -- keep the tokens that were inside it but move them to `:root` with Hearth values from `_tokens.css`
- Delete `[data-density="compact"]` block (lines 319-335)
- Delete `[data-density="comfortable"]` block (lines 337-362)
- Rename `--density-*` tokens to `--space-*` equivalents or inline literal Hearth values
- Add `--easing-expressive: cubic-bezier(0.34, 1.56, 0.64, 1)` to `:root`
- Sync all shared tokens to match `_tokens.css` values (fix tracking-caps in _tokens.css to 0.08em, add --tracking-caps-sm: 0.06em)

**Token migration map (density tokens to Hearth values):**

| Old density token | Hearth value | Replacement |
|---|---|---|
| `--density-pad-x` (16px) | 18px | `--space-6` (18px) or inline `18px` |
| `--density-pad-y` (12px) | 12px | `--space-4` (12px) |
| `--density-gap` (12px) | 12px | `--space-4` (12px) |
| `--density-row-h` (44px) | 42px | inline `42px` |
| `--density-text` (15px) | 15px | `--text-base` (15px) |
| `--density-text-h1` (26px) | 24px | `--text-2xl` (24px) |
| `--density-text-h2` (20px) | 20px | `--text-xl` (20px) |
| `--density-card-pad` (12px) | 12px | `--space-4` (12px) |
| `--density-page-gutter` (16px) | 18px | `--space-6` (18px) |
| `--density-icon-size` (16px) | 18px | inline `18px` |
| `--density-avatar-size` (32px) | 30px | inline per component (24/28/36/48 per HTML) |
| `--density-card-gap` (8px) | 6px | `--space-2` (6px) |

Note: The "Hearth value" column comes from `_tokens.css` which reflects the 03-hearth.html design intent. These values differ from `tokens.css`'s density-default tier in several places.

**File deletions:**
- `packages/web/src/hooks/useDensity.ts`
- `packages/web/src/hooks/useAutoDensity.ts`
- `packages/web/e2e/density-toggle.spec.ts`
- `packages/web/e2e/responsive-density.spec.ts`
- `packages/web/src/__tests__/auto-density.test.tsx`
- `packages/web/src/__tests__/useDensity.test.ts`
- `packages/design-system/src/__tests__/density-tier.test.ts`
- `packages/eslint-plugin-design/density-allowlist.json`

**File modifications:**
- `packages/eslint-plugin-design/src/index.ts` -- remove density rule registrations
- `packages/eslint-plugin-design/src/rules/use-density-tokens.ts` -- delete
- `packages/eslint-plugin-design/src/rules/no-density-tokens.ts` -- delete
- `packages/web/src/settings/SettingsAppearance.tsx` -- remove density select UI
- `packages/web/src/settings/settings-types.ts` -- remove Density type, simplify AppearanceSettings
- All TSX files referencing `var(--density-*)` -- replace with Hearth literal values or --space-* tokens
- `packages/web/src/__tests__/foundation.test.ts` -- remove density block assertions
- `packages/web/src/__tests__/AppShell.test.tsx` -- remove density attribute assertions
- `packages/web/e2e/touch-targets.spec.ts` -- remove density-dependent assertions
- `packages/web/e2e/settings-redesign.spec.ts` -- remove density toggle assertions
- `.claude/rules/aesthetic-quality.md` -- remove AQ-002 (density tokens), AQ-003 (tier ladder), AQ-016 (auto-density), AQ-017 (density-aware components)

## Phase 1: Token Sync

After density strip, converge `_tokens.css` and `tokens.css`:

**_tokens.css updates (HTML side):**
- `--tracking-caps: 0.08em` (was 0.02em -- stale)
- Add `--tracking-caps-sm: 0.06em`
- Add `--easing-expressive: cubic-bezier(0.34, 1.56, 0.64, 1)`
- Remove all `--density-*` tokens from the :root block (they were single-tier references only)
- Keep the `--card-max-h: 70vh` token (non-density, still useful)

**tokens.css updates (TSX side):**
- Move `--leading-body: 1.55` and `--card-max-h: 70vh` from the density block up to `:root` shared tokens
- Add `--easing-expressive: cubic-bezier(0.34, 1.56, 0.64, 1)` to `:root`
- Verify all color, radius, motion, typography, spacing tokens match between files
- Fix any stale lore comments referencing density

After this phase, the two files should have identical token values (differing only in comments, @layer wrapper, CSS reset, and demo layout classes).

## Phase 2: Foundation Primitives (Tier 0 TSX)

Build order follows consumer count (most-consumed first):

### 1. Avatar + AvatarGroup
- **Props:** `initials: string`, `size?: 'sm' | 'md' | 'lg'`, `agent?: boolean`, `className?: string`
- **Sizes:** sm=28px, md=36px (default), lg=48px
- **Agent variant:** green tint bg (`rgba(22,118,79,0.08)`), accent-primary border and text
- **AvatarGroup:** overlapping stack with negative margins (-8px default, -6px small group), surface-elevated border cutout
- **Consumers:** CommentRow, ThreadRow, BetCard, ThreadHostBanner, all screen mockups
- **File:** `packages/design-system/src/Avatar.tsx`, `Avatar.stories.tsx`

### 2. Button
- **Props:** `variant?: 'primary' | 'secondary' | 'ghost' | 'destructive' | 'amber'`, `size?: 'sm' | 'default'`, `disabled?: boolean`, `children`, `onClick?`, `type?: 'button' | 'submit'`, `className?: string`
- **Key specs:** Pill-shaped always (r-pill). 13px/500 font. 10px 18px padding (default), 7px 12px (sm). 1.5px border. Active: scale(0.97). Focus-visible: 2px accent-primary outline.
- **Consumers:** Composer, ErrorState, EmptyState, RichMessageCard, all page actions
- **File:** `packages/design-system/src/Button.tsx`, `Button.stories.tsx`

### 3. Input
- **Props:** `label?: string`, `hint?: string`, `error?: string`, `disabled?: boolean`, `textarea?: boolean`, plus native input/textarea props
- **Key specs:** 15px font, 10px 12px padding, 1.5px border-default, r-default radius, surface-elevated bg. Focus: accent-primary border + 3px rgba ring. Error: status-error border + ring.
- **File:** `packages/design-system/src/Input.tsx`, `Input.stories.tsx`

### 4. Select
- **Props:** `label?: string`, `options: { value: string; label: string }[]`, `disabled?: boolean`, plus native select props
- **Key specs:** Same border/radius/focus treatment as Input. Custom CSS arrow (border-trick triangle). 40px right padding for arrow.
- **File:** `packages/design-system/src/Select.tsx`, `Select.stories.tsx`

### 5. Toggle
- **Props:** `on?: boolean`, `label: string`, `description?: string`, `onChange?: (on: boolean) => void`, `disabled?: boolean`
- **Key specs:** 44x24 track, 18px thumb. Off: border-default track. On: accent-primary. Thumb uses expressive easing (cubic-bezier(0.34, 1.56, 0.64, 1)).
- **File:** `packages/design-system/src/Toggle.tsx`, `Toggle.stories.tsx`

### 6. Checkbox
- **Props:** `checked?: boolean`, `label: string`, `onChange?: (checked: boolean) => void`, `disabled?: boolean`
- **Key specs:** 20x20 box, 6px radius (form control exempt from r-scale per PRINCIPLES.md). 1.5px border. Checked: accent-primary fill with CSS checkmark.
- **File:** `packages/design-system/src/Checkbox.tsx`, `Checkbox.stories.tsx`

### 7. TabBar
- **Props:** `tabs: { id: string; label: string }[]`, `activeId: string`, `onChange?: (id: string) => void`, `variant?: 'pill' | 'underline'`
- **Key specs:** Pill: container bg, pill-rounded track, elevated active tab with shadow-subtle. Underline: border-bottom, active gets accent tint bg and accent color.
- **File:** `packages/design-system/src/TabBar.tsx`, `TabBar.stories.tsx`

### 8. Toast
- **Props:** `variant: 'success' | 'error' | 'warning' | 'info'`, `icon: ReactNode`, `title: string`, `message: string`, `onClose?: () => void`
- **Key specs:** Elevated bg, shadow-default, 1.5px left-border accent (the one structural status signal). Icon in 20px tinted circle. Max 380px.
- **File:** `packages/design-system/src/Toast.tsx`, `Toast.stories.tsx`

### 9. Progress
- **Props:** `value: number` (0-100), `label?: string`, `variant?: 'green' | 'amber'`
- **Key specs:** 8px track on container bg, pill-rounded. Fill transition 450ms (motion-slow).
- **File:** `packages/design-system/src/Progress.tsx`, `Progress.stories.tsx`

### 10. Tooltip (deferred)
Tooltip is listed in Tier 0 but requires positioning logic (portal, measurement, collision detection). It is not consumed by any other W2 component. If time permits, a simple CSS-only version can be built. Otherwise it ships as a follow-up.

## Phase 3: Existing Component Updates (Tier 1-3)

For each existing component whose HTML was updated in W1, update the TSX to match. The density token replacements from Phase 0 get the components partway there. Remaining work per component:

**CommentRow** -- Replace density-pad-x with 12px (from HTML), update avatar rendering to use new Avatar component (36px with 1.5px border)
**ThreadRow** -- Replace all density tokens, integrate Avatar component for the avatar slot, ensure 12px vertical / 24px horizontal padding matches HTML
**BetCard** -- Replace density tokens, integrate AvatarGroup for footer, update card padding to 18px (--space-6)
**Composer** -- Replace density tokens, integrate Button for send, use Input styling for the message input
**EmptyState** -- Replace density tokens, integrate Button for CTA. Left-aligned per AQ-008.
**ErrorState** -- Replace density tokens, integrate Button for retry. Icon in tinted circle.
**NavItem** -- Update to match HTML nav-item styling (active state uses surface-elevated + shadow-subtle)
**RichMessageCard** -- Replace density tokens, integrate Button for action buttons
**ThreadHostBanner** -- Replace density tokens, integrate Avatar for participant display

Each component update is verified by `npm run ds:sync` (pixelmatch against its HTML reference).

## Phase 4: Visual Regression Test Updates

**COMPONENTS array** in `visual-regression.test.ts` must be extended with the 10 new primitives:
```
"Avatar", "Button", "Checkbox", "Input", "Progress", "Select", "TabBar", "Toast", "Toggle"
```

**EXPECTED_MARKERS** must add entries for each new component.

**INTERACTIVE_COMPONENTS** should add hover/focus tests for Button, Input, Select, Toggle, Checkbox.

**ds:sync script** -- Add `"sync-check": "playwright test --config playwright.config.ts"` to `packages/design-system/package.json` so `npm run ds:sync` at root resolves.

## Phase 5: Page-Level Assembly

Pages inherit most fixes from the component trickle-up. Remaining page-level work:

- **Sidebar** -- Match W1 sidebar: brand wordmark, status dots, dividers, 200px width, 12px padding
- **Settings** -- Remove density toggle, update appearance section to theme-only
- **Empty states** -- Match W1 empty state screens (conversations-empty, work-empty, knowledge-empty)
- **Error states** -- Match W1 error states screen
- **Onboarding** -- Match W1 onboarding screen mockup

## States

For each new primitive:
- **Default / Populated** -- the primary rendering state
- **Hover** -- per-component (Button: hover color, Toggle: track highlight, etc.)
- **Focus-visible** -- 2px accent-primary outline, 2px offset (all interactive primitives)
- **Active/Pressed** -- Button: scale(0.97); Toggle: thumb snap
- **Disabled** -- opacity: 0.5, cursor: not-allowed, pointer-events: none
- **Error** -- Input/Select: status-error border + ring

## Signature

The signature of this variant is **cascade through composition**. Fix one foundation primitive, and every consumer inherits the fix. The builder never needs to manually update 12 components for a 36px avatar -- they fix Avatar.tsx once and the cascade handles it. This is what "bottom-up trickle" means.

## Trade-offs

- **Bad at:** parallel work. The dependency graph forces serialization: Avatar must be done before ThreadRow can be updated.
- **Bad at:** early visual feedback on pages. Page-level assembly only happens in Phase 5, after all component work is done.
- **Good at:** preventing redundant work. Each pixel fix happens exactly once at the lowest possible layer.
- **Good at:** ds:sync verification. Each component can be verified independently as it's completed.
