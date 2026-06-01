# W2 Approved Design: Bottom-Up Trickle

## Direction

Make every TSX component match its W1 HTML reference pixel-for-pixel. Implementation flows bottom-up through the component dependency graph: strip density infrastructure, sync tokens, build Tier 0 primitives, update existing components, assemble pages.

## Rejection List (Settled -- Do NOT Re-Litigate)

1. No density system. Removed entirely. AESTHETICS.md AQ-003 is explicit.
2. No DaisyUI form primitives. Custom CSS matching HTML references.
3. No Tooltip in W2. Deferred.
4. No new components beyond the 10 Tier 0 primitives.
5. No page rewrites. Component swaps and layout adjustments only.
6. HTML files are NEVER modified for styling. TSX matches them.

---

## Part 1: Density Strip

### What Gets Removed

**Files deleted entirely:**
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

**CSS blocks deleted from tokens.css:**
- `:root, [data-density="default"]` block (the density container -- tokens move to `:root`)
- `[data-density="compact"]` block
- `[data-density="comfortable"]` block
- Mobile media query for `[data-density="default"]` card-max-h override

**Types removed:**
- `Density` type from `settings-types.ts`
- `ResolvedDensity` type from `settings-types.ts`
- `density` field from `AppearanceSettings` interface

**UI removed:**
- Density select dropdown from `SettingsAppearance.tsx`

### Token Migration

Every `var(--density-*)` reference in TSX is replaced with literal Hearth values from the HTML references:

| Context | Old token | New value | Rationale |
|---|---|---|---|
| Thread row padding | `var(--density-pad-x)` | `--space-4` (12px) or `--space-8` (24px) | Per ThreadRow.html horizontal padding |
| Thread row padding | `var(--density-pad-y)` | `--space-4` (12px) | Per ThreadRow.html vertical padding |
| Thread row gap | `var(--density-gap)` | `--space-4` (12px) | Per ThreadRow.html |
| Card padding | `var(--density-card-pad)` | `--space-6` (18px) | Per BetCard.html card padding |
| Card inner gap | `var(--density-card-gap)` | `--space-2` (6px) | Per BetCard.html inner spacing |
| Page gutter | `var(--density-page-gutter)` | `--space-8` (24px) | Per DESIGN.md page gutter |
| Body text | `var(--density-text)` | `--text-base` (15px) | Per type scale |
| H1 text | `var(--density-text-h1)` | `--text-2xl` (24px) | Per type scale |
| H2 text | `var(--density-text-h2)` | `--text-xl` (20px) | Per type scale |
| Row height | `var(--density-row-h)` | `42px` | Per _tokens.css Hearth value |
| Icon size | `var(--density-icon-size)` | `18px` | Per _tokens.css Hearth value |
| Avatar size | `var(--density-avatar-size)` | Per-context (28/36px) | Per Avatar.html sizes |

Note: The exact replacement for each component reference must be verified against that component's HTML file. The table above gives the general mapping; individual components may use different values based on their specific HTML reference.

---

## Part 2: Token Sync

### _tokens.css updates (to match tokens.css):
- `--tracking-caps: 0.08em` (currently 0.02em -- stale)
- Add `--tracking-caps-sm: 0.06em`
- Add `--easing-expressive: cubic-bezier(0.34, 1.56, 0.64, 1)`
- Remove all `--density-*` tokens

### tokens.css updates:
- Move `--leading-body: 1.55` to `:root` shared tokens
- Move `--card-max-h: 70vh` to `:root` shared tokens
- Add `--easing-expressive: cubic-bezier(0.34, 1.56, 0.64, 1)` to `:root`
- Delete all density blocks
- Verify all values match _tokens.css for shared tokens

### Post-sync verification:
The two files must have identical values for all tokens. Structural differences are permitted: tokens.css uses `@layer base`, has more lore comments, and lacks the CSS reset / demo layout classes that _tokens.css has.

---

## Part 3: New Tier 0 Primitives

### Component Mapping

Each component below lists its file path, props, key CSS values (from its HTML reference), and which existing components consume it.

#### Avatar (`packages/design-system/src/Avatar.tsx`)
```typescript
interface AvatarProps {
  initials: string;
  size?: 'sm' | 'md' | 'lg';
  agent?: boolean;
  className?: string;
}
```
- **Sizes:** sm=28px, md=36px (default), lg=48px
- **Default:** `--surface-page` bg, `--border-default` 1.5px border, `--text-secondary` color, pill radius
- **Agent:** `rgba(22,118,79,0.08)` bg, `--accent-primary` border and text
- **Font:** sm=10px/600, md=12px/600, lg=13px/600
- **Consumers:** CommentRow, ThreadRow, BetCard, ThreadHostBanner, screen mockups
- **data-ds-component:** `"Avatar"`

#### AvatarGroup (`packages/design-system/src/Avatar.tsx` -- same file)
```typescript
interface AvatarGroupProps {
  children: ReactNode;
  small?: boolean;
  className?: string;
}
```
- **Default:** flex, negative margin -8px overlap, 2px surface-elevated border
- **Small variant:** 24px avatars, -6px overlap
- **Consumers:** ThreadRow footer, BetCard footer
- **data-ds-component:** `"AvatarGroup"`

#### Button (`packages/design-system/src/Button.tsx`)
```typescript
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive' | 'amber';
  size?: 'sm' | 'default';
}
```
- **Base:** inline-flex, center, 6px gap, 13px/500 font, 10px 18px padding, pill radius, 1.5px transparent border
- **Primary:** accent-primary bg/border, text-on-accent color. Hover: accent-primary-hover.
- **Secondary:** surface-elevated bg, text-primary color, border-default border. Hover: border-strong, surface-page bg.
- **Ghost:** transparent bg, accent-primary color. Hover: `rgba(22,118,79,0.06)` bg.
- **Destructive:** status-error bg/border, text-on-accent. Hover: `#c53e30`.
- **Amber:** accent-secondary bg/border, text-on-accent. Hover: `#b86305`.
- **Small:** 12px font, 7px 12px padding.
- **Active:** `scale(0.97)`
- **Focus-visible:** 2px accent-primary outline, 2px offset
- **Disabled:** opacity 0.5, cursor not-allowed, pointer-events none
- **Consumers:** Composer, EmptyState, ErrorState, RichMessageCard, all pages
- **data-ds-component:** `"Button"`

#### Input (`packages/design-system/src/Input.tsx`)
```typescript
interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  hint?: string;
  error?: string;
  textarea?: boolean;
}
```
- **Input element:** 15px font, 10px 12px padding, 1.5px border-default, r-default radius, surface-elevated bg, 280px width
- **Focus:** accent-primary border, `0 0 0 3px rgba(22,118,79,0.1)` box-shadow
- **Error:** status-error border, `0 0 0 3px rgba(220,74,58,0.1)` box-shadow
- **Label:** 13px/500, text-primary
- **Hint:** 12px, text-tertiary
- **Error text:** 12px/500, status-error
- **Textarea:** resize vertical, 80px min-height, 1.55 line-height
- **Disabled:** opacity 0.5, cursor not-allowed
- **Consumers:** Settings forms, Composer (conceptually), search
- **data-ds-component:** `"Input"`

#### Select (`packages/design-system/src/Select.tsx`)
```typescript
interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: string;
  options: { value: string; label: string }[];
}
```
- **Same border/radius/focus as Input.** 40px right padding for arrow.
- **Arrow:** CSS border-trick triangle (5px L/R transparent, 6px top border-strong), absolutely positioned right:12px center.
- **appearance: none** to remove native chrome
- **Consumers:** Settings selects, form dialogs
- **data-ds-component:** `"Select"`

#### Toggle (`packages/design-system/src/Toggle.tsx`)
```typescript
interface ToggleProps {
  on?: boolean;
  label: string;
  description?: string;
  onChange?: (on: boolean) => void;
  disabled?: boolean;
}
```
- **Track:** 44x24px, pill radius, border-default bg (off), accent-primary (on)
- **Thumb:** 18px circle, surface-elevated bg, shadow-subtle, positioned 3px from edge
- **Thumb motion:** `--easing-expressive` (cubic-bezier(0.34, 1.56, 0.64, 1)) -- the signature spring overshoot
- **Label:** 13px/500, text-primary
- **Description:** 12px, text-tertiary, 1.55 line-height
- **Gap:** 9px between track and text
- **Consumers:** Settings toggles
- **data-ds-component:** `"Toggle"`

#### Checkbox (`packages/design-system/src/Checkbox.tsx`)
```typescript
interface CheckboxProps {
  checked?: boolean;
  label: string;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
}
```
- **Box:** 20x20px, 6px radius (form control exempt from r-scale), 1.5px border-default, surface-elevated bg
- **Checked:** accent-primary bg/border, white CSS checkmark (6x10px rotated border)
- **Gap:** 9px between box and label
- **Label:** 13px/400, text-primary
- **Transition:** all 120ms ease
- **Consumers:** Task lists, form checkboxes
- **data-ds-component:** `"Checkbox"`

#### TabBar (`packages/design-system/src/TabBar.tsx`)
```typescript
interface TabBarProps {
  tabs: { id: string; label: string }[];
  activeId: string;
  onChange?: (id: string) => void;
  variant?: 'pill' | 'underline';
}
```
- **Pill variant:** surface-container bg, pill radius, 3px padding track. Active tab: surface-elevated, accent-primary color, shadow-subtle, 600 weight. Inactive: text-secondary, 500 weight. Tab padding: 6px 12px.
- **Underline variant:** border-bottom 1px border-default. Active: accent-primary color, 600 weight, `rgba(22,118,79,0.06)` bg. Inactive: text-tertiary. Tab padding: 6px 9px. Gap: 18px.
- **Consumers:** Page headers, settings sections
- **data-ds-component:** `"TabBar"`

#### Toast (`packages/design-system/src/Toast.tsx`)
```typescript
interface ToastProps {
  variant: 'success' | 'error' | 'warning' | 'info';
  icon: ReactNode;
  title: string;
  message: string;
  onClose?: () => void;
}
```
- **Container:** surface-elevated bg, shadow-default, r-default radius, 12px padding, 9px gap, max 380px
- **Left border:** 1.5px solid status-[variant] color (the one structural status signal in Hearth)
- **Icon:** 20px circle, tinted bg (`rgba(..., 0.1)`), status color text, 12px/700 font
- **Title:** 13px/600
- **Message:** 13px, text-secondary, 1.55 line-height
- **Close button:** 17px x character, text-tertiary, hover: text-primary, 120ms transition
- **Consumers:** ToastRegion (shell)
- **data-ds-component:** `"Toast"`

#### Progress (`packages/design-system/src/Progress.tsx`)
```typescript
interface ProgressProps {
  value: number;
  label?: string;
  variant?: 'green' | 'amber';
}
```
- **Track:** 8px height, surface-container bg, pill radius
- **Fill:** pill radius, accent-primary (green) or accent-secondary (amber), width transition 450ms (motion-slow)
- **Label row:** flex space-between. Label: 13px text-secondary. Value: 12px mono text-tertiary.
- **Gap:** 6px between label row and track
- **Consumers:** BetCard (budget progress), WorkBet page
- **data-ds-component:** `"Progress"`

---

## Part 4: Existing Component Updates

Each existing component whose HTML was updated in W1 gets its TSX updated. The density strip (Part 1) handles token migration. The remaining work is:

1. **Replace inline avatar markup** with the new Avatar/AvatarGroup components
2. **Replace inline button markup** with the new Button component
3. **Update spacing values** to match exact HTML measurements where density tokens weren't the issue
4. **Verify section-by-section** with ds:sync against updated HTML

Components in order of update (dependency-respecting):

1. **StatusChip, Tag, KeyValue** -- atomic updates, no new primitive deps
2. **NavItem, SearchField** -- NavItem gains active state match (surface-elevated + shadow-subtle)
3. **ThreadRow** -- Avatar integration, padding/gap values from HTML
4. **BetCard** -- Avatar/AvatarGroup integration, card padding to 18px
5. **TaskCard** -- Card padding/gap from HTML
6. **CommentRow** -- Avatar integration, spacing from HTML
7. **KnowledgeRow, NotificationRow** -- Spacing from HTML
8. **EmptyState, ErrorState** -- Button integration, left-aligned per AQ-008
9. **Composer** -- Button integration, Input-style message field
10. **RichMessageCard** -- Button integration for action buttons
11. **ThreadHostBanner** -- Avatar integration
12. **ThreadShell** -- Layout adjustments
13. **Skeleton** -- Verify matches HTML

---

## Part 5: Page-Level Assembly

Pages use existing route/component architecture. Changes are component swaps and layout adjustments:

- **Sidebar** -- Status dots, brand wordmark, dividers, active state (surface-elevated + shadow-subtle), 200px width, 12px padding
- **Settings** -- Remove density toggle section, theme-only appearance settings
- **Empty states** (conversations-empty, work-empty, knowledge-empty) -- Use updated EmptyState with Button CTA
- **Error states** -- Use updated ErrorState with Button retry
- **Onboarding** -- Match screen mockup layout

---

## Part 6: Verification

### ds:sync (primary gate)
Every component passes `npm run ds:sync` with less than 5% pixel diff against its HTML reference. The visual-regression.test.ts COMPONENTS array is extended with all new primitives.

### Verify pipeline
`npm run verify` passes: typecheck + lint + tests + build + E2E.

### Visual screenshots
Playwright screenshots of every screen in both light and dark mode, compared side-by-side with W1 mockups.

---

## Open Questions for Architecture

1. **Avatar/AvatarGroup file organization:** Same file or separate files? Leaning same file (AvatarGroup is a thin wrapper around Avatar children).
2. **Button forwarding ref:** Should Button use `React.forwardRef` for DOM ref access by consumers?
3. **ESLint rule cleanup scope:** Do we remove the density rules only, or also update the no-off-grid-spacing rule's allowlist to reflect new Hearth values?
4. **ds:sync script:** Wire as Playwright test directly, or wrap in a script that starts the Vite server first?
5. **Density references in aesthetic-quality.md and design-system rules:** How many rule files reference density? Full audit needed during architecture.

---

## Mobile Adaptation

With density removal, the mobile auto-density (comfortable at viewport <= 1024px) disappears. The Hearth default sizes are designed to work at all viewport widths:

- **Touch targets:** Default row height (42px) is close to but slightly below the 44px AQ-015 minimum. The builder must verify that all interactive elements meet 44px at mobile viewports through padding, min-height, or the touch-target E2E tests. Avatar buttons (28px+) may need min touch area wrappers.
- **Font size:** The 15px base font and 13px label font are above the 16px iOS zoom threshold for inputs but fine for non-input text. Input font is 15px -- this should be verified against the AQ-005 rule (16px minimum at mobile for inputs).
- **Sidebar:** At mobile widths, the sidebar collapses per existing shell architecture. No change needed.

The three-tab mobile layout (existing architecture) is not affected by W2 changes.
