# Finishing Touches

The difference between "functional" and "polished" is in the micro-details.

## Borders

- **Default:** `1px solid rgba(255, 255, 255, 0.08)` — subtle structural borders
- **Emphasized:** `1px solid rgba(255, 255, 255, 0.12)` — input fields, active panels
- **Focus:** `1px solid var(--primary)` — keyboard focus indicator
- **Never:** `2px` or thicker borders. Never colored borders for decoration.

Borders create structure that tonal-only layering fails to achieve at the dark end of the spectrum. A single border at 8% white opacity on a card immediately creates visual organization.

## Shadows

- **Use sparingly.** In dark mode, shadows have less effect than in light mode.
- **Only on floating elements:** modals, popovers, dropdowns, tooltips.
- **The token:** `var(--float)` = `0 0 32px rgba(173,198,255,0.08)`
- **Never:** `shadow-lg` on cards. Cards use surface elevation, not shadows.

## Corner Radii

Closed set — no arbitrary values:

| Token | Value | Usage |
|-------|-------|-------|
| `--r0` | 0 | No rounding (table cells, full-width bars) |
| `--r1` | 2px | Buttons, chips, badges, small controls |
| `--r2` | 4px | Cards, panels, input fields |
| `--r3` | 8px | Modals, overlays, large containers |
| `--r-pill` | 999px | Pills, scrollbar thumbs |

**Rule:** Smaller elements get smaller radii. A chip (--r1) inside a card (--r2) inside a modal (--r3) creates a coherent nesting hierarchy.

## Hover States

Every interactive element needs a hover state:
- **Surface elements (cards, rows):** Background shifts up one surface level
- **Buttons:** Background lightens or accent color brightens
- **Text links:** Underline appears or opacity increases
- **Transition:** `var(--motion-fast)` (120ms)

## Focus States

- **Visible focus ring on ALL interactive elements.** No exceptions.
- **Style:** `outline: 1px solid var(--primary); outline-offset: -1px;` (inside the element, not outside)
- **Never remove focus styles.** If default focus rings are ugly, replace them — don't remove them.

## Active/Pressed States

- **Buttons:** Slight scale reduction (`scale(0.98)`) or translate (`translateY(1px)`)
- **Cards/rows:** Subtle flash or deeper surface color
- **Duration:** Instant or `var(--motion-fast)` max

## Transitions

| What | Duration | Property |
|------|----------|----------|
| Hover background | `--motion-fast` (120ms) | `background-color` |
| Focus ring | instant | `outline` |
| Panel expand/collapse | `--motion-medium` (200ms) | `height, opacity` |
| Modal open/close | `--motion-slow` (320ms) | `opacity, transform` |
| Color change | `--motion-fast` (120ms) | `color, background-color` |

**Only animate GPU-friendly properties:** `transform`, `opacity`, `background-color`, `color`, `outline`. Never animate `width`, `height`, `margin`, `padding`, `top/left`.

## Skeleton Loading

- Match the shape of the content being loaded
- Use `surface-ghost` animated shimmer, not a generic spinner
- Skeleton height/width should approximate the actual content size
- Remove skeleton in one frame (no fade-out) when content loads

## Empty States

- Center vertically in the available space
- Icon (optional) + title + brief description + action button (if applicable)
- Title in `--text-mid`, not `--text-hi` (empty states are secondary, not primary)
- Keep copy concise. One sentence max for description.

## Error States

- Red (`--danger`) indicator on the left or top (small, not overwhelming)
- Clear error message in `--text-hi`
- Retry action if applicable
- Never show raw error messages or stack traces to users

## Scroll Behavior

- Custom scrollbar: 6px wide, `surface-ghost` track, `surface-5` thumb, `--r-pill` radius
- Scrollbar appears only on hover (`::-webkit-scrollbar-thumb` with opacity transition)
- Content should not jump when scrollbar appears/disappears

## The Polish Checklist

Before considering a component "done":

- [ ] Hover state on all interactive elements
- [ ] Focus ring visible on keyboard navigation
- [ ] Active/pressed state on buttons
- [ ] Transitions on state changes (not instant)
- [ ] Loading skeleton matches content shape
- [ ] Empty state is designed, not blank
- [ ] Error state is designed, not a raw message
- [ ] Text truncates with ellipsis where overflow is possible
- [ ] Scrollbar is styled consistently
- [ ] No hardcoded colors, sizes, or spacing values
