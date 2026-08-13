# Hearth — The HyperIdle Design Language

Hearth is warm, tactile, and human. It feels like a well-crafted workspace where you want to spend your day -- not a sterile tool you endure. Status and meaning come through content (badges, dots, text color) rather than structural decoration. Warm shadows give cards weight. Generous rounding invites interaction. The cream canvas holds everything gently.

Six words define Hearth: **Warm. Grounded. Tactile. Inviting. Organic. Human.**

---

## The Three Generators

The entire Hearth palette derives from three values:

1. **Pale lemon base** -- `#fcf8e8` (Paper). Every surface is tinted warm-lemon. No cool grays, no flat beige.
2. **Two-role accent** -- lemon drop `#f0c419` (`--accent-primary`) for FILLS (buttons, checked states; dark content on top), cocoa `#6f4d1e` (`--accent-deep`) for TEXT/icons/focus/identity. Amber (`#d97706`) is the secondary accent for attention.
3. **Warm earth text** -- `#2a2415`. Dark but warm. Not black, not slate.

Everything else -- surfaces, borders, shadows, status colors -- is derived from these three.

---

## Material Palette

Hearth names its surfaces after physical materials. These names appear in conversation between designers and builders, replacing hex codes with intent.

| Material | Token | Light | Dark | Role |
|----------|-------|-------|------|------|
| **Paper** | `--surface-page` | `#fcf8e8` | `#14140b` | App background. The canvas. |
| **Linen** | `--surface-container` | `#f6f0d8` | `#242418` | Sidebar, nav, inset areas. |
| **Card** | `--surface-elevated` | `#ffffff` | `#2f2f21` | Cards, panels, main content. Floats above Paper. |
| **Scrim** | `--scrim` | `rgba(26,21,16,0.45)` | `rgba(20,16,12,0.62)` | Modal backdrops, drawer scrims. |
| **Lemon** | `--accent-primary` | `#f0c419` | `#f5d33d` | Buttons, checked states, count badges. The fill accent — dark content on top. |
| **Cocoa** | `--accent-deep` | `#6f4d1e` | `#d9c9a3` | Links, icons, focus rings, agent identity. The text accent. |
| **Amber** | `--accent-secondary` | `#d97706` | `#d97706` | Budget badges, warnings, attention-drawing elements. |
| **Earth** | `--text-primary` | `#2a2415` | `#ecead9` | Primary text. The darkest value in light mode. |

---

## Design Philosophy

### Warmth signals trust

Software used all day should feel like a place you want to be. Every color is tinted warm -- no cool grays, no blue-gray neutrals. Shadows use warm rgba tones (`rgba(44, 36, 26, ...)`) that make cards feel like paper lifted off a wooden desk, not flat rectangles on a screen.

### Status through content

Colored dots, pill badges, and text color carry meaning. Cards stay structurally uniform. A bet card has the same shadow, same border radius, same padding whether it is active, at risk, or completed. The status lives inside the card -- a green dot and "Active" badge -- not welded to its edges.

The one exception: toasts use a thin (1.5px) left-border accent as the single structural status signal in the system.

### Generous rounding

16px default radius and pill-shaped buttons (9999px) create a soft, approachable feel. Even small elements get 10px radius. The radius scale is deliberately sparse:

| Token | Value | Usage |
|-------|-------|-------|
| `--r-none` | `0` | Flat edges (rare) |
| `--r-subtle` | `10px` | Small elements, main panel, inner containers |
| `--r-default` | `16px` | Cards, modals, inputs, toast |
| `--r-pill` | `9999px` | Buttons, badges, avatars, toggles, tabs |

There is no 4px or 8px step. The jump from 0 to 10px is intentional.

### Mixed hierarchy

Shadows AND borders AND tints work together. Different elements use different strategies:
- **Cards** get `--shadow-default` (warm, visible shadow) on `--surface-elevated`
- **Thread rows** use bottom `--border-subtle` hairline dividers
- **Toast** uses left-border accent
- **Status** uses colored dots and tinted pill badges

This variety is the Hearth signature, not inconsistency.

---

## Typography

Two families. One scale. No density toggles.

### Families
| Token | Stack | Usage |
|-------|-------|-------|
| `--font-sans` | system-ui, -apple-system, Segoe UI, sans-serif | All UI text |
| `--font-mono` | ui-monospace, SF Mono, Cascadia Code, monospace | Data labels, timestamps, code |

### Scale

| Step | Size | Weight | Usage |
|------|------|--------|-------|
| 3xl | 30px | 700 | Brand heading, page hero |
| 2xl | 24px | 600 | Page titles |
| xl | 20px | 600 | Section headings, main header titles |
| lg | 17px | 500-600 | Card titles, bet names |
| base | 15px | 400 | Body text, message content |
| sm | 13px | 400-500 | Secondary text, previews, labels |
| xs | 12px | 500-600 | Timestamps, metadata, section headers (uppercase) |
| micro | 10px | 500 | Agent badge labels, avatar initials (sm), swatch labels |
| count | 9px | 500 | Count badges (numeric only) |

### Heading signature

Section headers use uppercase, wide letter-spacing (0.06em-0.08em), and tertiary color -- the Hearth hallmark. They are quiet structural markers that organize without shouting.

---

## Spacing

Closed composition vocabulary. One size per component -- no density system. Tokens name available values; semantic relationships use guidance ranges rather than an authoritative one-token mapping.

| Token | Value | Usage |
|-------|-------|-------|
| `--space-1` | 3px | Minimum composition increment; compact metadata |
| `--space-2` | 6px | Close relations; labels, icons, badges |
| `--space-3` | 9px | Roomy close relations; peer actions |
| `--space-4` | 12px | Compact group separation; standard padding |
| `--space-6` | 18px | Roomy group separation; card padding |
| `--space-8` | 24px | Cued major sections; page gutter |
| `--space-12` | 36px | Weak-cue or sparse major sections |
| `--space-16` | 48px | Exceptional page-level/expressive separation |

`0px` is also part of the vocabulary: use it for contiguous divided rows and intentional resets. Suggested vertical ranges are `3–9px` for close relations (normally `6–9px`), `12–18px` for related groups, and `24–36px` for major sections. Suggested horizontal ranges are `3–9px` for icon/text and metadata, `9–12px` for peer actions, `18–24px` for distinct clusters/columns, and `36–48px` only for rare broad layouts.

Choose the compact end when the viewport is narrow, the surface is dense, or headings/borders/background changes already establish hierarchy. Choose the roomy end for larger or multiline type, sparse content, or weak boundaries. Do not add space between contiguous list rows, use `48px` as a routine section gap, or invent a raw value when hierarchy is weak. Control internals, padding/geometry, optical offsets, canvas coordinates, negative overlap, resets, and subject-authored content are separate concerns and require narrow structural treatment.

### Key measurements

- **Card padding:** 18px
- **Avatar (default):** 36px
- **Avatar (small):** 24-28px
- **Avatar (large):** 48px
- **Page gutter:** 24px
- **Sidebar width:** 200px
- **Thread row padding:** 12px vertical, 24px horizontal
- **Button padding:** 10px 18px (default), 7px 12px (small)

---

## Shadows

Warm-tinted. Three levels. Light mode uses `rgba(44, 36, 26, ...)` so shadows have an earthy warmth instead of neutral gray.

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--shadow-subtle` | `0 1px 4px rgba(44,36,26,0.06)` | `0 1px 4px rgba(0,0,0,0.3)` | Active sidebar items, pill tabs |
| `--shadow-default` | `0 4px 12px rgba(44,36,26,0.08)` | `0 4px 12px rgba(0,0,0,0.4)` | Main panel, cards, bet cards, toast, app preview |
| `--shadow-elevated` | `0 8px 24px rgba(44,36,26,0.1)` | `0 8px 24px rgba(0,0,0,0.5)` | Bet card hover, onboarding card, modals |

Shipping Hearth chrome uses only `none` and these three tokens. Subtle marks active or lightly lifted chrome; default gives cards/panels tactile weight; elevated is for floating overlays and deliberate hover escalation. Raw Tailwind or arbitrary elevation shadows are forbidden. Focus, validation, and selected-state rings communicate state rather than depth and are narrowly exempt; third-party or subject-authored preview content is not Hearth chrome.

---

## Borders

Thicker than typical (1.5px default). Warm-toned. Three weights.

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--border-subtle` | `#e8e0d0` | `#3d342a` | Hairline dividers, thread row separators |
| `--border-default` | `#d5cbb8` | `#554a3c` | Input borders, card outlines, sidebar dividers |
| `--border-strong` | `#b5a890` | `#756850` | Select arrows, focused inputs, completed dots |

---

## Motion

Gentle. Never attention-grabbing.

| Token | Duration | Usage |
|-------|----------|-------|
| `--motion-fast` | 120ms | Hover, checkbox, toast close |
| `--motion-default` | 240ms | All transitions, tab switches, border color |
| `--motion-slow` | 450ms | Progress bar fill, slow reveals |

Easing: `cubic-bezier(0.25, 0.1, 0.25, 1)` for most transitions. Toggle thumb uses expressive easing: `cubic-bezier(0.34, 1.56, 0.64, 1)` for a slight overshoot.

---

## Status Colors

| Token | Light | Dark | Semantic |
|-------|-------|------|----------|
| `--status-success` | `#16764f` | `#2eaa7a` | Healthy, approved, done, active |
| `--status-warning` | `#d97706` | `#d97706` | Behind schedule, at risk, budget alert |
| `--status-error` | `#dc4a3a` | `#ee6a5a` | Blocked, error, rejected, failed |
| `--status-info` | `#2e7dba` | `#4498d4` | Draft, informational, in review |

Status is always communicated through color + text + shape. Never color alone.

### Status tint tokens (AI6)

Tinted backgrounds for icon containers, hover states, and focus glows. Use these instead of hardcoded rgba values.

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--accent-primary-dim` | `rgba(22,118,79,0.08)` | `rgba(46,170,122,0.10)` | Success/primary icon bg, ghost hover, input focus glow |
| `--accent-secondary-dim` | `rgba(217,119,6,0.08)` | `rgba(217,119,6,0.10)` | Warning/amber icon bg, amber badge tint |
| `--status-error-dim` | `rgba(220,74,58,0.08)` | `rgba(238,106,90,0.10)` | Error icon bg, error input focus glow |
| `--status-info-dim` | `rgba(46,125,186,0.08)` | `rgba(68,152,212,0.10)` | Info icon bg, info badge tint |
| `--accent-secondary-hover` | `#b86305` | `#b86305` | Amber button hover state |
| `--status-error-hover` | `#c53e30` | `#c53e30` | Destructive button hover state |
| `--scrim` | `rgba(26,21,16,0.45)` | `rgba(20,16,12,0.62)` | Modal overlay scrim (AI2) |

---

## Closed Sets (AZ7)

Five axes closed to a decided set, each entry stating its job. Adding a value
outside a set is either a type error (Button) or fails `npm run lint`
(radius, controls, status, colors) — see `tools/eslint-plugin-design/src/hearth-config.ts`.

### Button — 4 variants × 3 sizes

| Variant | Job |
|---|---|
| `primary` | The one action that completes the surface's purpose. At most one per surface. |
| `secondary` | An equal-standing alternative to the primary — *Cancel* beside *Save*. |
| `ghost` | An action that must not compete with the content it sits in: row actions, toolbars, dialog dismiss. |
| `destructive` | An action that ends or removes something. |

| Size | Job |
|---|---|
| `default` | Page-level and dialog-level actions. |
| `sm` | Inside a row, a toolbar, or a dense panel. |
| `icon` | A square control whose entire label is its icon (32px desktop, 44px touch floor below `lg`); carries an accessible name. |

`amber` is deleted (zero production uses). A pressed/open TOGGLE state (a
composer's insert-menu button, a sidebar toggle) is not this set — it has no
built-in pressed treatment distinct from the four action variants.

### Input — 6 members

| Member | Job |
|---|---|
| `Input` | A single-line value the user types. `textarea` is the same field when the value is long. |
| `SearchField` | A query that filters what is already on screen. |
| `Select` | One value chosen from a closed list. |
| `Composer` | A message sent into a conversation. |
| `Checkbox` | A boolean the user sets in place. |
| `Toggle` | A setting that takes effect the moment it changes. |

A raw `<input type="checkbox"|"radio"|"range">` carrying DaisyUI form-control
chrome stays permitted (AQ-011 exemption) — `Checkbox`/`Toggle` wrap exactly
those classes themselves.

### Filled surfaces — 4 fills + 2 tints

| Fill | Job |
|---|---|
| `--surface-page` | The canvas the application is drawn on. Nothing that is not the page background uses it as a fill. |
| `--surface-elevated` | Anything that floats on the canvas and holds content: cards, panels, list containers, text inputs. |
| `--surface-container` | A region recessed *inside* an elevated surface: code block, table header, quote, empty state, embedded reference, progress track. |
| `--surface-overlay` | A surface drawn above the page: modal, popover, toast. |
| `--accent-primary-dim` | The hover / selected tint on an interactive row or a ghost control. **Not** `--surface-page` — that was its accidental second job before AZ7. |
| `color-mix(in oklab, var(--status-*) NN%, transparent)` | The fill of a status chip or an inline alert banner, and nothing else. |

### Radius — 4 values, one spelling each

| Spelling | Value | Job |
|---|---|---|
| no radius class, or `rounded-none` | 0 | Full-bleed regions, table cells, edges that meet another edge. |
| `rounded-[var(--r-subtle)]` | 10px | A region inside a card; a menu item; an icon button. |
| `rounded-[var(--r-default)]` | 16px | Cards, dialogs, panels, text inputs. |
| `rounded-[var(--r-pill)]` | 9999px | Buttons, chips, avatars, toggles, tabs, progress tracks. |

The only permitted spelling of a non-zero radius is a `--r-*` token.
`rounded-full`, named Tailwind radii (`rounded-lg`, `rounded-2xl`, …), and
arbitrary pixel radii (`rounded-[8px]`) are all lint errors — even when the
pixel value happens to land on the scale. `rounded-full` was the pill's
second spelling; Chrome's computed value for it (`calc(infinity * 1px)`,
clamped to 33,554,432px) is what made a computed-style measurement of this
app report an "off-scale" radius as its most common value. One spelling
closes that reading. The one documented exception: `Checkbox`'s 20×20px box
uses `rounded-[6px]` (AQ-011 form-control exemption — none of the four scale
values reads right on a small checkbox).

**Enforcement boundary.** `design/radius-token-only` reads a class string
directly in `className`, and follows it through a same-file `const` whose
value is provably single-assignment (`CommentRow.tsx`'s `avatarClass`
ternary and similar module-level extracted class-string constants are
covered this way — see `createConstIdentifierResolver` in
`tools/eslint-plugin-design/src/util.ts`). It does **not** follow a `let`/
reassignable binding, a value imported from another file, or a string built
at runtime from a prop/state value it cannot statically resolve. Nor is the
boundary limited to those three: a `const` bound to an object-literal member
access (`const cls = RADII.pill`) is statically resolvable in principle but
is not followed either — the resolver only chases a `const`'s own
initializer expression, not a property read off it — and neither is
mid-token string concatenation (`"rounded-" + "full"`), which the walker
never reassembles into `rounded-full` before testing it against the token
regex. A radius built through any of these shapes would still pass silently
— the same failure mode that let `CommentRow.tsx`'s `rounded-full` ship
invisible to `npm run lint` until review round 2 caught it by browser
measurement.

### Status presentation — 2 members

| Member | Job |
|---|---|
| `StatusChip` | The object's state, said in a word. Whenever a state is named on screen, this is its shape. |
| `RowDot` | The same state reduced to a dot, where the row has no room for the word and the word is available on hover and to a screen reader. |

`RowCell.tone` is deleted — a third status channel with one call site. Not
status, unchanged: `Tag`, `ReferenceChip`, `ArtifactKindBadge` (what an object
*is*), `LiveDot` (something is happening right now), `Progress` (how much). A
state's word comes from `status-mapping.ts` and the `@hyperidle/domain-model`
label registries — a surface may not invent one.

---

## Conventions (AI6)

These conventions are enforced by ESLint rules scoped to `framework/design-system/src/**/*.tsx`. Violations fail `npm run lint`.

### Focus treatments

Exactly two documented focus treatments exist in Hearth. No others.

**Control-ring** — buttons, toggles, tabs, cards, rows, menu items (any interactive element that is NOT a text input):
```
focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-primary)]
```
Add `focus-visible:[outline-offset:-1px]` for inset surfaces (rows, list items that sit inside a container edge).

**Input-glow** — text inputs, textareas, select elements:
```
focus:border-[var(--accent-primary)] focus:shadow-[0_0_0_3px_var(--accent-primary-dim)]
```
Error variant uses `var(--status-error-dim)` instead of `var(--accent-primary-dim)`.

The distinction is intentional and documented: `control-ring` for pointers, `input-glow` for text fields. Both appear consistently within their element class.

### Tracking tokens

Every uppercase label uses a tracking token. Never a bare `tracking-[0.Xem]`.

| Token | Value | Usage |
|-------|-------|-------|
| `--tracking-caps` | `0.08em` | 13px+ section titles, standalone uppercase headers |
| `--tracking-caps-sm` | `0.06em` | 11px / 10px inline uppercase labels, badges, chips, kicker rows |

Allowed exception: negative-em optical kerning on display titles (`tracking-[-0.01em]`, `tracking-[-0.005em]`). These are NOT caps-tracking and are not flagged.

### Hover vs Selected (two-tone rule)

For any component that holds hover and selection as independent states:
- **Hover** (transient): neutral `color-mix(in oklab, var(--text-secondary) 8%, transparent)` — same warm-family idiom as row hover tints.
- **Selected / active**: `bg-[var(--accent-primary-dim)]` + `text-[var(--accent-primary)]` — accent signals commitment.

Selected = accent-colored; hover = neutral grey. Distinct hue, not just opacity.

See `TabBar.tsx` as the reference implementation (selected independent of hover). Components where selection-follows-hover by design (e.g. `slash-menu.tsx`) use a single committed-cursor highlight — that is correct, not a bug.

### Renderer container rule

Same content kind = same container chrome, whether rendered as a block payload or an artifact kind-renderer:

- **Image / media**: `figure` with `rounded-[var(--r-default)] border border-[var(--border-subtle)] overflow-hidden`
- **Table**: outer `div` with `overflow-x-auto rounded-[var(--r-default)] border border-[var(--border-subtle)]`
- **Code / HTML embedded panel**: `rounded-[var(--r-default)]` + `bg-[var(--surface-container)]` + `p-[12px]`

The `block/*Payload.tsx` family is the reference. `kinds/*-renderer.tsx` must match it.

### Motion tokens

No bare `duration-[Nms]` or `ease-[ease]` in DS components. Use Hearth motion tokens:

| Token | Value | Usage |
|-------|-------|-------|
| `--motion-fast` | `120ms` | Hover, checkbox, toast close |
| `--motion-default` | `240ms` | Most transitions |
| `--motion-slow` | `450ms` | Progress bar, slow reveals |
| `--motion-ease` | `cubic-bezier(0.25,0.1,0.25,1)` | All standard easing |

---

## Theme Modes

Two modes. Light-first. Switchable via `data-theme` attribute.

| Mode | Attribute | Default |
|------|-----------|---------|
| Hearth Light | `data-theme="hearth-light"` | Yes (default) |
| Hearth Dark | `data-theme="hearth-dark"` | Respects `prefers-color-scheme` |

---

## Component Architecture

Components are organized in tiers. Each tier builds on the one below.

- **Tier 0 (Foundation Primitives):** Avatar, AvatarGroup, Button, Input, Select, Toggle, Checkbox, TabBar, Toast, Progress, Tooltip
- **Tier 1 (Atoms):** Menu, StatusChip, Tag, Badge, KeyValue, NavItem, SearchField
- **Tier 2 (Molecules):** BetCard, ThreadRow, CommentRow, Composer, EmptyState, ErrorState, KnowledgeRow, NotificationRow, TaskCard
- **Tier 3 (Shell):** Sidebar, Main Panel, App Shell

Every component has a single canonical representation:
- **TSX** (`framework/design-system/src/`) — the design source of truth and production implementation. Stories (`*.stories.tsx`) define the visual contract. (AJ1: the HTML reference tree was deleted; TSX is now the single source of truth.)

---

## Overlay Layering

All overlay surfaces use the AI2 z-layer token scale. No raw `z-[N]` classes are permitted on any overlay after migration.

| Token | Value | Surface |
|---|---|---|
| `--z-base` | 0 | App content (default) |
| `--z-sticky` | 10 | Sticky headers, in-flow anchored popovers |
| `--z-drawer` | 30 | TaskSheet, mobile nav drawer (non-modal slide-ins) |
| `--z-overlay` | 40 | AssistantOverlay, NotificationPopover (anchored non-modal popovers) |
| `--z-scrim` | 50 | The modal scrim |
| `--z-dialog` | 60 | Modal dialogs + GlobalSearch palette |
| `--z-toast` | 70 | Toasts — always on top, never blocked |

All overlays portal into `#overlay-root`, which is a sibling of `#root` under `<body>`.
This ensures the `inert` attribute on `#root` (applied when a modal is open) never disables
dialog content. Toasts at `--z-toast: 70` stay clickable over an open modal because they
also live in `#overlay-root`, which is never inerted.

The modal scrim color is `--scrim` (defined in `tokens.css`). AI6 will refine this token
via `color-mix(in oklab, ...)`.

---

## Token Enforcement Gate

Token resolution (`var(--x)` referencing a custom property defined in `tokens.css`) is not currently machine-checked — the AI1 `token-guard:check` was retired with the rest of the guard set in AU28 and has not yet been re-derived in the new governance lint.

**For contributors:**
- Every `var(--…)` in shipped source must resolve to a name declared in `framework/design-system/src/tokens.css`.
- If you need a new token, add it to `tokens.css` (AI6 scope). Do not use `var(--undefined-name)` and rely on browser silent fallback.
- `@lore` and JSDoc comments that name dead tokens by example (e.g. `/* was var(--old-name) */`) are safe — the guard strips comments before scanning.
- Test and story files are excluded from the scan; they may reference token strings as fixture data.

---

## Menu (AG5)

`Menu` is the canonical anchored-action-menu primitive. Every overflow/context menu in the app renders through it — `BlockActionsPopover`, WorkBet bet overflow, KnowledgeDetail overflow.

**API:**
```tsx
<Menu
  open={boolean}
  onClose={() => void}
  items={MenuItem[]}
  label={string}           // aria-label on role=menu container
  align="end" | "start"   // default "end"
/>
```

**`MenuItem` shape:**
```ts
{ id: string; label: string; onSelect: () => void;
  disabled?: boolean; destructive?: boolean; shortcut?: string;
  dataAttrs?: Record<string, string> }
```

**Behavior:**
- Returns `null` when `open=false` (no DOM presence).
- Escape closes (document-level listener, stopPropagation).
- Click outside closes (mousedown outside the panel).
- ArrowUp/Down/Home/End move focus between items.
- Enter/Space activate the focused item.
- Disabled items are un-clickable (`aria-disabled=true`, native `disabled` attr + onClick guard).
- Destructive items render in `--status-error` color.
- `dataAttrs` spreads verbatim onto the button element (C4 — E2E selector preservation).

**ARIA:** `role=menu` on container, `role=menuitem` + `aria-disabled` on each button.
**DS marker:** `data-ds-component="Menu"` `data-tier="1"` (via `dsProps("Menu","1")`).
**Single-owner rule (C1):** No other component may render its own `role=menu` anatomy. If you need a menu, use `<Menu>`.

**Files:** `framework/design-system/src/Menu.tsx`, `framework/design-system/src/Menu.stories.tsx`.

---

## Further Reading

- **PRINCIPLES.md** -- the seven universals (Clarity, Hierarchy, Restraint, Content First, Consistency, Feedback, Accessibility) + surprise principles that govern every design decision in Hearth.
- **AESTHETICS.md** -- 19 rules (AQ-001 through AQ-019) that protect the Hearth feeling. Every rule should make you nod "yes, obviously."
- **THEMES.md** -- the hearth-light.css and hearth-dark.css token files, how modes work, and how to apply them.
