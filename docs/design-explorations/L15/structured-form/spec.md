# Variant B — Structured Form

## User story

A founder clicks "Request" on a TaskCard. A modal opens with a structured form: target state (radio chips), required note, "Open thread instead" link, "Send" / "Cancel". Slower than Variant A — but every request is deliberate, written, and auditable.

## Component composition

- `TaskCard` (existing). Two slots used: `actions` becomes a horizontal pair of buttons — `btn btn-xs btn-ghost` "Request" + `btn btn-xs btn-ghost` "Thread". Both are visible at the card footer.
- DaisyUI `modal` (modal-bottom on mobile per AQ; centered on desktop). Header / body / footer pattern.
- DaisyUI `radio` group rendered as chip-style buttons (one row, wrap to two rows on narrow viewports).
- DaisyUI `textarea` (16px font, 3 rows, autoresize via `field-sizing: content`).
- `KeyValue` (Tier 1 primitive) inside the modal header showing the task in question (title + owner) — re-uses an existing primitive.
- DaisyUI `kbd` for the `⌘+Enter` send hint.

No new component invented.

## Information hierarchy (top → bottom of the modal)

1. **Modal title** — `Request a change` (16px, font-medium, text-hi).
2. **Subhead** — `KeyValue` row: label `Task`, value `{title}` (truncated, full on hover via `title=`).
3. **Owner row** — `KeyValue` row: label `Assigned to`, value `@{owner}`.
4. **Field 1: Target state** — section label `What should change?` (uppercase mono, text-lo). Below: a row of radio-chips, one per valid target verb (Start / Resume / Block / Review / Done / Abandon — gated as in Variant A).
5. **Field 2: Why (optional but encouraged)** — section label `Note (the agent will read this)`. A textarea with placeholder `e.g. "I think the auth callback is the actual blocker — try the Apple flow first."`.
6. **Footer** — left-aligned `Open task thread` text-button (DaisyUI `btn-link`); right-aligned `Cancel` (`btn-ghost`) + `Send request` (`btn btn-primary`). The send button is disabled until a target state is chosen OR a note is non-empty (a note alone is a "talk to me" request — no state change).

The "Request" + "Thread" pair on the card uses 11px mono-style labels (matches StatusChip/Tag tracking), zero icons.

## All states

| State | Render |
|---|---|
| Empty (no targets, e.g. on `proposed`) | Modal still opens. The "What should change?" row shows: `No state requests are valid for a task in this state — leave a note for the agent.` Send activates only with a non-empty note. |
| Loading (submitting) | "Send request" → spinner (16px DaisyUI `loading-spinner loading-xs`) replaces the label. Both action buttons `aria-busy="true"`. The modal does not close until the response lands. |
| Error | An inline `alert alert-error` strip appears above the footer: `Couldn't send. {error}` Retry by re-clicking Send. |
| Populated (success) | Modal closes; the card pulses for 200ms (`opacity` 1→0.6→1 — honors `prefers-reduced-motion`). A toast confirms `Sent to @{owner}.` |
| Disabled targets (state machine truly forbids, e.g. `done` → `done`) | Hidden, not greyed. Only the meaningful subset shows. |

## Behavior

- **Trigger:** "Request" button on the card opens the modal. Stop-propagation on click so card `onClick` doesn't fire.
- **Trigger #2:** "Thread" button opens the task's thread in the Rail directly — does NOT open the modal. The two affordances are equal-weight verbs.
- **Modal open:** centered on desktop (`max-width: 480px`), full-bottom-sheet on viewport ≤ 640px. Backdrop is `var(--surface-0)` at 60% opacity; modal surface is `var(--surface-1)`.
- **Focus:** initial focus lands on the FIRST radio-chip (or, if none are valid, on the textarea).
- **Focus trap:** standard DaisyUI modal focus trap.
- **Keyboard:** `Esc` closes (with confirm IF note is non-empty). `Tab` cycles within the form. `⌘/Ctrl+Enter` submits. Arrow keys move between radio chips (native radio behavior).
- **Open thread (footer link):** dispatches `rail.open-thread` then closes the modal. The user is taken to the conversation surface where they can write freely.
- **Submit:** posts to `POST /api/threads/{taskThreadId}/messages` with `{ type: "plain", text, refs }`. Generated text:
  - With state target: `Please move "{title}" to {targetVerb} — {note}` (or without note: `Please move "{title}" to {targetVerb}.`)
  - Note-only: the note text itself, prefixed `Note: {note}`.
- **No optimistic state mutation.** Card chip never changes. The pulse + toast convey "sent".
- **Motion:** modal slides up `translateY(8px) → 0` and fades over `var(--motion-medium)`. Backdrop fades over `var(--motion-fast)`. Honors `prefers-reduced-motion` (no transform, just opacity).

## Mobile adaptation

- Card buttons "Request" + "Thread" remain visible (always-on; no menu trigger to discover).
- Modal renders as a bottom-sheet (full width, slide up from bottom). Touch targets ≥ 44px (the radio-chips are 32px tall but with 6px y-padding hit area extension).
- Textarea font-size 16px (AQ-005).

## Signature

The card always shows two equal-weight verbs in plain words: **Request** and **Thread**. Click "Request" and you get a form that makes you read what you're about to ask for. The agent receives a deliberate request with an explanation, not a one-tap impulse.

## Trade-offs

- **Bad at** speed — three clicks (Request → pick state → Send) versus Variant A's two.
- **Bad at** card density — two visible buttons per card, even on tasks the user will never touch.
- **Bad at** discoverability of "talk freely" — the "Open thread" link is in the modal footer, less prominent than the "Request" verb.
- **Good at** signalling that this is a deliberate request, not an accidental click.
- **Good at** producing readable thread messages (because the user wrote a note).
