# L15 — Variant C: `linear-palette`

**Reference.** Linear's `Cmd+K` per-issue command palette. Slack's `/`-commands.

**Constraint.** Invoke a context-aware command palette on a focused card with
a single keystroke. The palette presents the canonical request verbs as
matched commands, plus "Open thread" and "Snooze". Selecting a command
either fires immediately or opens a Composer modal.

**Signature.** Power-user keyboard interaction is the headline. A focused
card + `Cmd+K` (or `K` plain on a focused card) opens a palette overlaying
the page. Mouse users get a fallback `···` button — but the palette is the
primary surface.

---

## 1. User story

A founder, scanning the Team Board, lands focus on a stuck task with arrow
keys. Presses `K`. A palette slides down anchored just below the focused
card showing pre-matched commands for that task: `> Request stop`,
`> Request unblock`, `> Open thread`, `> Snooze`. They type `un` to filter
to "Request unblock", press Enter. Toast: "Request sent."

## 2. Components

| Slot | Component | Notes |
|---|---|---|
| Card frame | `TaskCard` (Tier 2, exists) | Adds `aria-keyshortcuts="K"` when focused; visual `K` glyph appears on focus |
| Trigger (mouse) | DaisyUI `btn btn-ghost btn-xs` | Same `···` fallback as Variant A |
| Palette | DaisyUI `modal` (anchored, not centered) | Custom positioning — relative to the focused card |
| Command list | DaisyUI `menu` with input header | `<input>` filter at top; results below |
| Command icons | None | AQ-113 + Linear-grammar (no decorative icons in commands) |
| Composer modal | `Composer` (Tier 2, exists) | Used when a verb has a "with reason" suffix |
| Toast | DaisyUI `toast` + `alert` | "Request sent" |

**Component budget delta: +0.** Reuses `Composer` for the optional reason
field; the palette itself is a styled DaisyUI modal.

## 3. Information hierarchy

### Card focus indicator
On focus, the card shows a small monospace `K` chip in the top-right corner.
Reads: "press K here to do something." The chip is mono `11px`, color
`--text-lo`, background `--surface-ghost`, padding `1px 5px`,
border-radius `--r1`. This is the *only* card-level chrome.

### Palette structure (top → bottom)
1. **Header strip** (`28px`, `--surface-2` background): task title +
   `[Esc]` hint right-aligned. Mono caps, 11px.
2. **Filter input** (`36px`, `--surface-1` background): autofocused;
   placeholder `Type a command…`. Real-time fuzzy match.
3. **Command list** (max 6 visible, scrolls otherwise):
   - Verb commands first (state-machine-aware, same as Variant A)
   - **Divider**
   - Universal: `Open thread`, `Snooze 24h`, `Copy task link`
   - **Divider**
   - Cancel: `Cancel pending request` (visible only when a request is
     pending on this task)
4. **Footer hint** (`24px`, `--surface-2`): mono 10px,
   `↑↓ Navigate · ↵ Run · Esc Cancel · Agents read these as suggestions`

### Verb commands carry metadata
Each command has:
- Primary label (`Request stop`)
- Secondary muted text (`→ marks as killed (agent decides)`)
- Optional shortcut (`⌘ S` on the right when the command has a hotkey)

The secondary text teaches the agent-decides contract every time the
palette opens — not buried in a one-time disclosure.

## 4. States

### Closed
Palette is not visible. Cards are unchanged at rest. On card focus, the `K`
chip appears.

### Open (mouse-invoked via `···`)
Palette overlays the column area, anchored to the card. Filter input has
focus. Backdrop dims (`--surface-0` at 60% opacity) the rest of the page.

### Open (keyboard-invoked via `K` on focused card)
Identical to mouse-invoked, but additionally the originating card retains a
visible "anchor" outline so the user knows which task the palette acts on.

### Empty filter result
"No commands match" + a single hint: `Try: stop, unblock, hold, done, hand,
thread`.

### After verb-fire (atomic command)
Palette closes. Toast appears. `↪ pending` chip on the card.

### After verb-fire (with-reason command)
Palette is replaced (in place, no double-modal) with the Composer modal.
Header: `Request unblock — JWT refresh logic`. Body: `Composer` with
placeholder `Why? (optional)`. Footer: `[Esc] Cancel` and
`[⌘ ↵] Send request`. Submitting closes the modal, fires the request with
the reason as the message body, toast appears.

### After "Open thread"
Palette closes. Page navigates to the thread surface (L18). The thread
opens with cursor in its composer.

## 5. Behavior

### Mouse
- Hover card → `···` fades in (same as Variant A)
- Click `···` → palette opens
- Click outside palette → palette closes
- Click command → command fires

### Keyboard (the primary path for this variant)
- Tab to card → focus + `K` chip visible
- `K` (or `Cmd+K`) on focused card → palette opens, filter input focused
- Type to filter; arrow keys to navigate
- `Enter` → fire selected command
- `Esc` → close palette, return focus to card
- `Cmd+Enter` inside Composer modal → send-with-reason

### Touch
- Tap card → palette opens (no `K` chip needed since no hover)
- Touch keyboard input still works for filtering
- Footer becomes top sticky on touch (small viewports) so commands aren't
  obscured by the on-screen keyboard

### Drag
- Identical to A and B: removed. Canvas drag unaffected.

### Motion
- Palette open: `--motion-fast` (80ms) opacity + `transform: translateY(-4px)`
  to `0`. Honor `prefers-reduced-motion`.
- `K` chip on focus: `--motion-fast` (80ms) opacity-only fade in.
- Toast: DaisyUI default.

## 6. Mobile adaptation

On viewport ≤ 1024px:
- Tap card opens the palette as a **bottom sheet** (DaisyUI `modal-bottom`)
  with the filter input pinned at the bottom (above on-screen keyboard)
- Command rows have `min-height: 44px`
- The `K` keyboard glyph chip is hidden on mobile (no physical keyboard
  context)

## 7. Trade-offs

**Bad at:**
- **Discoverability.** New users won't think to press `K`. The `K` chip on
  focus mitigates it but only after the user has somehow focused a card with
  the keyboard. Mouse users still rely on the `···` fallback — and if they
  rely on it, the palette is just a uglier menu (Variant A is better for
  this).
- **Two surfaces, two grammars.** Mouse users see the dropdown shape (which
  competes with their expectation of a context menu); keyboard users see
  a command palette. Two mental models.
- **Cognitive load.** "Type to filter" assumes the user knows the verb
  names. Without scanning the static list first, a typed filter on first
  use is friction.
- **Pretentious for the use case.** A command palette is overkill for "I
  want to ask the agent to stop." Linear's palette has hundreds of
  commands; this one has 5-7. The chrome-to-content ratio is high.

**Good at:**
- **Keyboard-first power.** Once learned, fastest of the three variants.
- **Teaching the contract.** Secondary text "→ agent decides" appears on
  every command, not buried.
- **Extensibility.** Future verbs (e.g., L17 cost-related actions, L18
  thread-related actions) slot in without growing the card chrome.
- **Reusability.** A palette is reusable across surfaces — Bet detail,
  Knowledge, Conversations could all adopt the same shape (eventually).

## 8. Signature

The card stays a card. Power = keystroke. The palette teaches the
agent-decides contract on every open.
