# Variant — Assistant overlay states (routine, single variant)

**User task:** founder sends a message and either sees a streamed reply or a one-glance, one-click-to-fix guidance message. Never a dead composer.

## Component composition
- Shell: existing `AssistantOverlay` (360px popover) + `ThreadShell` (message list + `Composer`). No structural change.
- Streaming indicator: a single styled row appended below the last user message — DaisyUI `loading loading-spinner loading-sm` + text "Assistant is thinking…" in `--text-tertiary`, on a faint `--accent-primary-dim` tint (matches the existing `ToolCallRow` tint pattern already in the overlay). Removed when the reply or a notice lands.
- Guidance/error states: rendered in-thread as a **notice card** styled like `ErrorState` (icon + title + description + one affordance), keyed off `message.payload.notice.kind`. It sits where an assistant reply would, so the timeline reads naturally ("you asked → assistant couldn't, here's why").

## The four+three states

### idle (composer ready)
Default `ThreadShell` + `Composer`. Seeded welcome message visible on first open.

### streaming
After send: user message appears immediately (existing `refresh()`), then the "Assistant is thinking…" row shows until the first assistant `thread_message_appended` for this thread. Spinner is `loading-sm`, copy is tertiary, low-key — not a full-screen spinner.

### answered
The thinking row is replaced by the assistant's `plain` reply (existing `ThreadShell` message rendering + `renderToolCallSummaries` for any tool calls). The reply is a real model response, visibly distinct from the seeded welcome text.

### error/guidance — three distinct notices (each a notice card)
Icon uses the ErrorState glyph; color and copy distinguish the class.

| kind | Color | Title | Description | Affordance |
|---|---|---|---|---|
| `missing_key` | `--status-warning` | "No API key yet" | "I can't think until an API key is set. Add your Anthropic key to get started." | Button (primary, sm): "Open Credentials" → Settings → Credentials |
| `missing_harness` | `--status-warning` | "Runtime not configured" | "I don't have a runtime selected. Pick a harness for me and I'll be ready." | Button: "Open Agent settings" → Settings → Agents |
| `provider_error` | `--status-error` | "Couldn't reach the model" | "The model provider returned an error. This is usually temporary." (+ `code` chip if safe, e.g. `rate_limited`) | Button (ghost, sm): "Retry" → re-runs the turn |

- `missing_key`/`missing_harness` are **warning** (it's a setup gap the user fixes), `provider_error` is **error** (something went wrong). This color split is the readability signal.
- Notice cards are dense: ~9–12px padding, 13px description, fit the 360px width in 2–3 lines.
- No secret ever appears (copy is fixed per class; provider `code` is shown only from an allowlist of non-sensitive codes).

## Information hierarchy (in a notice)
1. Title (what's wrong, 13–15px/600).
2. One-line description (what it means / that it's fixable).
3. One affordance (the fix). Exactly one — no competing buttons.

## Behavior
- Send is disabled while a turn is in flight for this thread (prevents stacked turns; mirrors the §security in-flight guard).
- Notice affordance routes to the relevant Settings tab (existing nav) or fires Retry.
- Motion: thinking row fades in (`--motion-fast`, opacity only — AQ-014). Notice card no special motion.
- Keyboard: Escape closes overlay (existing). No new shortcuts.

## Mobile
Overlay already maps to a full-width sheet via the existing dialog behavior; notice cards and thinking row are width-fluid. No change.

## Signature
Every failure is a **first-class message in the conversation**, not a toast or a silent composer. The thread itself tells you the assistant tried and what to fix — the Assistant is never silent, by construction of the timeline.

## Trade-offs
- Bad at: distinguishing transient vs permanent provider errors precisely (we show one `provider_error` with Retry). Acceptable — Retry covers the common transient case.
- The notice card reuses ErrorState styling but renders inline at 360px — needs a compact size; ErrorState's compact retry pill already exists, the card padding is tuned down for the overlay.

## Rejected directions
- **Toast/snackbar for errors** (outside the thread): rejected — a toast is dismissable and ephemeral; the AC demands the failure be *surfaced and persistent* in the overlay. A timeline notice can't be missed.
- **Single generic "Assistant unavailable" error** (no class distinction): rejected — the AC requires distinguishing missing key / missing harness / provider error so the user knows what to fix. One affordance per class is the value.
- **Disabled composer with a banner** (block input, show a banner why): rejected — a banner above a dead composer reads as broken; an in-thread notice reads as "the assistant responded with guidance," which is alive.
- **Token-by-token streaming text** (progressive partial render): considered, deferred — adds a WS delta event + buffer for marginal UX gain over thinking→answered. Flagged in architecture §3 as a follow-up; the thinking→answered transition satisfies the AC "streaming response."
