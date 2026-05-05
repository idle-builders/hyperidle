# L7 — Approved Design

**Status:** approved (single spec; multi-variant exploration skipped per `brief.md` — the design space is too narrow to spread three ways without theatre).

**Surface:** in-flight + failure feedback for response commit on `ReviewVerdictBar` and `Composer`. No new components. Extends existing component props. The page-level fetch in `ConversationsReview.tsx` and `ThreadShell.handleComposerSubmit` are the call-sites that drive these states.

---

## 1. User story

As a reviewer responding to a thread, when my response is being committed I see that the system has it; when it fails I see why and can retry; when it succeeds the thread state changes are signal enough on their own.

## 2. Component mapping

| Surface | Component | Change |
|---|---|---|
| Verdict button row | `ReviewVerdictBar` | Add `pending?: VerdictDecision \| null` prop; add `error?: string` prop. Already has `disabled`. |
| Composer submit | `Composer` | Add `pending?: boolean` prop; add `error?: string` prop. Submit button already exists. |
| Error region (verdict bar) | inline within `ReviewVerdictBar` | One row above the buttons, shown only when `error` is set. Single line, `text-[var(--danger)]` on `surface-1`. Includes a "Retry" `<button>`. |
| Error region (composer) | inline within `Composer` | Same shape as verdict-bar error, sits above the textarea. |
| Async-recorded ack | DaisyUI `toast` | Single transient toast, copy "Response recorded — agent will pick it up on next session." Lives 4s. Only fires on async commit (sync commit is self-evident — the verdict bar disappears). |
| Loading-on-button | existing button + DaisyUI `loading` class | Use `loading loading-spinner loading-xs` on the actively-pressed button. Other buttons in the bar are `disabled`. |

No new component types. Component budget unchanged at 19.

## 3. States

### 3.1 ReviewVerdictBar

| State | Visual | Behavior |
|---|---|---|
| `idle` | Five buttons, current tones (primary/neutral/danger). | Click handler dispatches `onAction(decision)`; parent flips `pending` to that decision. |
| `pending` | The pressed button shows `loading-spinner loading-xs` after its label; all five buttons get `disabled`. The error row is not shown. | Pointer events disabled. Buttons keep their tone (no muting beyond `disabled:opacity-50` already present). |
| `error` | All buttons return to enabled. Error row visible above the buttons: `<icon-warning>` + message text + `[Retry]` link-button. | `[Retry]` re-dispatches the last attempted decision. Click on any verdict button dismisses the error and starts a new attempt. |
| `committed (sync)` | The verdict bar unmounts (the head resolves; ThreadShell stops rendering it). | No success toast — the disappearance IS the signal. |
| `committed (async)` | Bar still visible (async threads don't resolve on response). Toast: "Response recorded — agent will pick it up on next session." | Toast auto-dismisses 4s. |

### 3.2 Composer

| State | Visual | Behavior |
|---|---|---|
| `idle` | Textarea + Send button. | Standard. |
| `pending` | Textarea is `readOnly`, Send button shows spinner + label "Sending…". | Cmd/Ctrl+Enter is suppressed during pending. |
| `error` | Send button re-enabled. Error row appears between textarea and submit row, same shape as the verdict-bar error: warning glyph + message + `[Retry]`. | Retry resends the same payload (the textarea content is preserved — never cleared until commit succeeds). |
| `success` | Textarea clears, focus returns to the textarea. | No toast. The new message appearing in the stream IS the signal. |

### 3.3 Page-level (ConversationsReview)

The page state machine adds two transient flags per `onAppend` call:

- `pending: { kind: "verdict" \| "composer", payload: ... } | null`
- `error: string | null`

On `fetch` success → clear both, refresh the thread.
On `fetch` failure → clear `pending`, set `error` to a clear copy:
- HTTP 5xx: "Server couldn't record this response. Try again?"
- HTTP 4xx: pass server's error message if shaped (`{ error: string }`); otherwise "Couldn't record response (HTTP <code>)."
- Network: "No connection. Try again when you're back online."
- Abort/timeout: "Request timed out. Try again?"

## 4. Behavior

- **No optimistic UI.** The thread is not updated until the server confirms (story constraint line 261). The `pending` state is the only feedback during the round-trip.
- **Idempotency.** `clientKey` is reused on retry so the server can dedupe (this is the architect's contract — design just has to ensure Retry sends the same key).
- **Focus.** On `error`, focus moves to the `[Retry]` button (assistive tech announces the error via `role="alert"` on the error row, then lands focus on the action). On `committed`, focus returns to the textarea (composer) or to the head's first focusable element (verdict commit, sync case) or stays on the bar (verdict commit, async case).
- **Motion.** Spinner uses `--motion-fast` via DaisyUI's `loading-spinner`. Error row enters with `opacity` + 4px Y translate, `--motion-fast` (≈120ms). No layout-property transitions (AQ-014).
- **Keyboard.** No new shortcuts. The story spec rejection-list bans verb-key shortcuts. Cmd/Ctrl+Enter on the composer is the only existing one and is suppressed during `pending`.
- **Aria.** The error row carries `role="alert"`. The pending button carries `aria-busy="true"`. The verdict bar wrapper keeps its existing `aria-live="polite"` from `ThreadShell` for shape transitions; that announces the bar disappearing on sync commit.

## 5. Content (copy)

| Surface | Copy |
|---|---|
| Pending verdict button | (button keeps its label; spinner appears beside it) |
| Pending composer button | "Sending…" |
| Network error | "No connection. Try again when you're back online." |
| Server 5xx | "Server couldn't record this response. Try again?" |
| Server 4xx (no body) | "Couldn't record response (HTTP <code>)." |
| Server 4xx (with body) | server-provided message, truncated to 120 chars |
| Timeout | "Request timed out. Try again?" |
| Async ack toast | "Response recorded — agent will pick it up on next session." |
| Retry button | "Retry" |

No marketing register, no superlatives (AQ-110). No emoji (story constraint line 263).

## 6. Mobile adaptation

- Verdict buttons already meet the 44px touch-target floor (AQ-015) — kept.
- Error row stacks below the buttons on viewport ≤ 768px (the buttons wrap first, then the error row sits above them); inverted on desktop where buttons fit on one line.
- Toast lives in the bottom-center DaisyUI position on mobile, top-right on desktop (DaisyUI defaults).

## 7. Trade-offs

- **No success toast on sync commit.** Some users may want explicit confirmation. The signal is the verdict bar unmounting + the verdict message appearing in the stream — both already happen via the existing thread refresh. Adding a toast would be redundant and noisy. If founder feedback says they miss the confirmation, we revisit.
- **Per-button spinner instead of a single bar-level spinner.** Slightly more visual change (one button morphs) but tells the user *which* verdict they pressed. Important if the click was ambiguous (e.g. a misclick they want to abort).
- **Inline error vs toast for failures.** Errors are inline (not toast) because they require an action (retry). Toasts disappear; inline errors persist until the user does something.

## 8. Rejection list (to prevent re-litigation in `/architecture`)

- Don't add a new component. ✗
- Don't put a global "saving…" banner at the top of the page. ✗ (over-broad; obscures the actual surface that's working)
- Don't render an optimistic verdict message in the stream then roll back on failure. ✗ (constraint line 261)
- Don't auto-advance to the next thread on commit. ✗ (out of scope per story spec line 253)
- Don't add an undo affordance. ✗ (out of scope per story spec line 253)
- Don't add a confirmation modal before commit. ✗ (verdict click is the confirmation; modals add friction without value)
- Don't add a success toast on sync commit. ✗ (the bar disappearing + the verdict landing in the stream IS the signal)
- Don't show a different visual for sync vs async during pending. ✗ (the user shouldn't have to know which kind their thread is — the system handles it)

## 9. Open questions for the architect

1. Where does `pending` state live? Page (ConversationsReview) is natural since it owns the fetch; ThreadShell forwards via existing onAppend signature. The architect picks.
2. Server contract for error response shape — the design assumes `{ error: string }` for 4xx. If the actual contract differs, copy fallback for "no body" applies.
3. Toast component source — DaisyUI `toast` exists; the architect confirms whether a global toast root already mounts somewhere or needs adding.
4. `clientKey` on retry — design assumes same key; architect confirms server dedupes by it.

## 10. Verification

This spec is verified by:

- **Storybook stories** added to `ReviewVerdictBar.stories.tsx` and `Composer.stories.tsx`: `Idle`, `Pending`, `Error`, `ErrorThenRetry`.
- **Playwright spec** in the L7 test plan: load thread → click verdict → server returns 500 → error row visible → click Retry → server returns 200 → bar unmounts.
- **Vitest** for the page-level state machine: pending flag set on click, cleared on success, error string set on failure.
- **Screenshots** of each state at desktop + mobile for the design-critique gate.

## 11. Score

`/design-critique` skipped — there is no rendered artifact yet (the spec is prop additions, not a new layout). The next gate is `/architecture` consuming this contract, then `/visual-polish` after implementation against the Storybook screenshots.
