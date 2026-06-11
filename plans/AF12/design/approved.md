# AF12 — Approved Design (routine, 1 variant)

Input contract to `/architecture`. Visual hierarchy, component vocabulary, copy, and interaction grammar are decided here; the architect does not re-litigate them.

All four surfaces are **extensions of existing components**. No new design-system component is added (component budget unchanged at 19). All values use Hearth tokens already in use on these surfaces.

---

## Surface 1 — Activate draft bet (AC1)

**Where:** WorkBet header overflow dropdown (`bet-overflow-menu`, `WorkBet.tsx:1015-1067`).

**Change:** Add one menu item as the **first** item, shown only when `bet.status === 'draft'`:

```
[ Activate bet ]   data-bet-action="activate"
```

- Class: same as existing items — `w-full text-left px-3 py-2 text-[13px] hover:bg-[var(--accent-primary-dim)]`. NOT red (it's constructive, not destructive). Default text color (`--text-primary` inherited).
- Hierarchy: it is the primary action for a draft bet, so it sits at the top of the dropdown.
- Behavior: click → `handleAction("activate")` → `POST /api/bets/:id/commit` with empty body (reason optional, omitted) → on success `fetched.refresh()`. **No confirmation dialog** — activation is the happy path and reversible-by-kill. Mirrors the existing no-confirm `ship` flow.
- States:
  - Populated/draft: item visible.
  - Non-draft: item absent (the `status === 'draft'` guard).
  - In-flight: no optimistic UI (per TRACK-L scope: no optimistic-UI bragging). The dropdown closes on click; the status badge flips draft→active when `refresh()` returns. If the request fails (e.g. `CapacityExceededError` → 400), surface the error inline. **Open question for architecture:** the overflow menu has no error slot today. Reuse the same inline-error affordance the appetite dialog uses, OR show a transient inline banner in the bet header. Recommend: a small `role="alert"` line under the header title, cleared on next action. Keep it terse: "Couldn't activate: team at capacity."
- Status badge already handles `draft` and `active` (`WorkBet.tsx:953-978`) — no change.

**Copy:** menu label "Activate bet". No marketing verbs.

**Adjust-appetite guard change (same dropdown):** change the appetite item's condition from `(status === 'active' || status === 'draft')` to `status === 'active'` only. Appetite is set at creation or after activation; the draft path always 400s on the server.

---

## Surface 2 — Appetite money editor (AC2)

**Where:** `AppetiteDialog` (`WorkBet.tsx:477-607`). Same `<dialog>` chrome, same non-skippable pattern (Escape/backdrop blocked), same required-reason field.

**Change:** replace the duration `<select>` (`APPETITE_OPTIONS = ["1 week","2 weeks","6 weeks"]`) and its string state with a **money input row**:

Hierarchy inside the dialog (top→bottom):
1. Title: "Adjust appetite" (unchanged).
2. **New appetite** field — a horizontal row:
   - Currency `<select class="select select-bordered select-sm">` — options from `CURRENCY_CODES` (`USD|EUR|GBP|JPY`). Width ~`min-w-[80px]`. Default = bet's current `costAppetite.currency` ?? `"USD"`.
   - Amount `<input type="number" inputMode="decimal" class="input input-bordered input-sm flex-1">` — major units (dollars, not cents). `min={0}`, `step` by currency scale (`0.01` for scale-2, `1` for JPY scale-0). Placeholder = current major amount or "0.00".
   - Layout: `flex items-center gap-[6px]`.
3. **Reason** textarea (unchanged, required).
4. Cancel / Save buttons (unchanged).

**Conversion (UI-side):** the input collects a major-unit number; on Save, convert to `WireMoney`: `minor = Math.round(amount * 10 ** scaleForCurrency(currency))`, `currency`. Send `{ field: "cost_appetite", value: { minor, currency }, reason }`. `scaleForCurrency` is already exported from `@hyperidle/shared`. The dialog's `onConfirm` signature changes from `(appetite: string, reason)` to `(value: WireMoney, reason)`.

**Display:** the header appetite chip and the budget stat card already use `formatMoney(bet.costAppetite)` (`WorkBet.tsx:1011,1168`) — no change. The dialog's `currentAppetite` prop changes from a formatted string to the `WireMoney | null` value so the fields can prefill the raw amount; the dialog formats for the placeholder itself.

**States:**
- No current appetite (`costAppetite === null`): currency defaults USD, amount empty with "0.00" placeholder.
- Validation: Save disabled while amount is empty/NaN/<0 OR reason empty (extend the existing `!reason.trim()` guard). Negative or non-numeric blocked client-side; server also rejects (`minor >= 0`).
- Error: existing inline `role="alert"` slot. The 400-on-string bug disappears because we now send `WireMoney`.

**Copy:** field label "New appetite". Reason placeholder "Why is the appetite changing?" (unchanged).

**DELETE:** `APPETITE_OPTIONS` constant and the duration `<select>`. They are the bug.

---

## Surface 3 — Kill dialog copy honesty (AC3)

**Where:** `ConsequencePreviewDialog` (`WorkBet.tsx:325-459`). No structural change. Architecture makes the cascade real (bet→tasks→sessions at the state/DB level). Design's job: ensure the copy matches the **actual** boundary.

**Locked copy** (the four lines at `WorkBet.tsx:403-415`):

```
STOPS:      In-progress tasks are killed and their active sessions stopped.
CONTINUES:  Completed tasks and their artifacts are preserved.
SAVED:      Team capacity is freed.
NOTE:       Running agents finish their current step before stopping.
```

Rationale per `concept.md` Decision 1 + 3:
- "In-progress tasks are killed" is now true (cascade implemented). Use "In-progress" loosely to mean all non-terminal tasks; the line stays short. Acceptable: keep the original "All active tasks will be halted" only if architecture confirms every non-terminal task is killed — but the more precise line above is preferred and still honest.
- The cascade is **state-truth** (task→killed, session→stopped at the DB level). It does NOT promise to abort a live OS process mid-flight (AF7's seam). The copy says "stopped," which matches `outcome='stopped'` and does not over-claim instant process death. No line says "immediately terminates running agents."
- **WARNING A — no instant-cost-stop claim.** Dropped "immediately" from the SAVED line: AF12 only guarantees DB-state truth — capacity is freed in state, but a live AF7 harness process may keep running (and keep burning cost) until it reaches a stopping point. "freed immediately" would falsely imply cost stops the instant you click Kill. The new `NOTE:` line ("Running agents finish their current step before stopping") makes the seam explicit: state flips now, the process winds down at its next step. No line asserts cost stops instantly. (Unit-test expectation: the kill-dialog copy test asserts the dialog text does NOT contain "immediately" on the SAVED line and DOES contain the "finish their current step" qualifier — so a future regression can't silently re-introduce the false instant-cost-stop claim.) `NOTE:` uses neutral styling (not red) — it's informational, not a danger axis.
- "Completed tasks and their artifacts are preserved" replaces the vaguer "Existing artifacts are preserved" — sharper and honest (done tasks are NOT re-killed).

Keep the red `STOPS:` label (`font-semibold text-error`), neutral `CONTINUES:`/`SAVED:`. Red is reserved for the danger axis — consistent with Lucid/Hearth red-only-for-danger.

No other change: reason still required, confirm label "Kill bet", non-skippable.

---

## Surface 4 — Sessions list on TaskSheet (AC4)

**Where:** `TaskSheet` (`TaskSheet.tsx`), inside the scrollable body. Insert a **Sessions section** between the existing single-artifact preview (`TaskSheet.tsx:329`) and the Discussion section (`TaskSheet.tsx:373`).

**Pattern source:** reuse the exact session-row shape already shipped in WorkTask (`SessionRow` + `LiveDot`, `WorkTask.tsx:103-159`) and the `useTaskSessions` hook (`hooks/useTaskSessions.ts`). Architecture decides extract-vs-duplicate (see open questions) — design mandates the *same visual shape* either way.

**Hierarchy inside the section:**
1. Section label: `Sessions` — `text-xs font-heading uppercase tracking-[0.02em] text-[var(--text-tertiary)]` (matches the existing "Discussion" / "REQUEST" labels in TaskSheet, `TaskSheet.tsx:375,398`). Optional count suffix: `Sessions · 3`.
2. Session rows — one `SessionRow` per session:
   - Left: session title (or agent + started-time if no title) `text-[14px] font-[500]`, agent line `text-[12px] text-[var(--text-tertiary)]`.
   - Right cluster: optional cost (`font-mono tabular-nums`), then the **status indicator**: `LiveDot` (pulsing green) + "Active" for `state==='active'`; plain "Done" / outcome label otherwise.
   - Row chrome: `flex items-center gap-[12px] py-[12px] border-b border-[var(--border-subtle)] last:border-b-0`.

**Active-session indicator (AC4 explicit requirement):** `LiveDot` next to rows where `session.state === 'active'`. This is the "active-session indicator." `LiveDot` is an existing design-system primitive (used in WorkTask, `@lore visual-parity-audit D-30`).

**States:**
- Loading: while `useTaskSessions` is fetching, render a single locked line — `text-xs text-[var(--text-tertiary)] px-4 py-2` "Loading sessions…". NOT "render nothing" — a blank-then-populate flashes the empty surface and is indistinguishable from the empty state for the duration of the fetch. The explicit "Loading sessions…" line prevents the flash-of-empty and is honest about the pending fetch. (One line, no skeleton chrome — TaskSheet has no skeleton system.)
- Empty (task has zero sessions): one line — `text-[13px] text-[var(--text-tertiary)]` "No sessions yet." NOT a blank. This is the AC4 "surface is not permanently empty" guarantee. (Today both surfaces are blank because the endpoint 404s.)
- Error: one line `role="alert" text-error` "Couldn't load sessions." Do not break the rest of the sheet.
- Populated: the rows. Active sessions show the live dot; completed/stopped show the status label.

**Read-only:** no actions on session rows (AF7 owns dispatch). Rows are not clickable in TaskSheet (no harness-link needed here; WorkTask keeps the harness link). Keep TaskSheet's session rows minimal: title/agent + cost + status dot. This keeps the in-context peek dense and fast.

**Mobile:** TaskSheet is already a bottom-sheet on mobile (`TaskSheet.tsx:301`). The sessions section flows in the same scroll column — no special handling. Rows are full-width, ≥44px tall (`py-[12px]` + content ≈ 44px), satisfying touch-target AQ-015.

---

## Cross-surface notes

- **Motion:** no new motion. `LiveDot` already animates (existing). Dialogs use the existing `<dialog>` show/close. No transitions added (`--motion-*` untouched).
- **Density:** all additions respect the surfaces' existing density (12px row padding, 6px sub-gaps, 9px menu padding). On the Hearth 6px grid.
- **Keyboard/focus:** AppetiteDialog focus order becomes currency → amount → reason → Cancel → Save (DOM order). TaskSheet's focus trap (`TaskSheet.tsx:202`) automatically includes the new section's focusables — but the sessions rows are non-interactive, so they add nothing to the trap. No keyboard-verb shortcuts (TRACK-L rejection list).
- **Color:** red only on `STOPS:` and the Kill button. Activate is neutral/constructive. No new colors.

## Rejected directions ("did we consider X/Y/Z?")

- **A dedicated "Activate" button in the header (not in the overflow menu).** Rejected: the header already has the overflow-menu pattern for bet actions; a separate prominent button would split the action surface and add header clutter for a one-time transition. The menu is where bet verbs live.
- **An activation confirmation dialog (reason required).** Rejected: activation is constructive and reversible (kill exists). Forcing a reason adds friction to the happy path. The endpoint's reason is optional; we omit it. Confirmation is reserved for destructive acts (kill) — consistent with the verdict-grammar principle.
- **A token/appetite dual-axis editor in AppetiteDialog (Money + TokenUsage caps).** Rejected: out of scope. AF12 fixes the appetite=money 400; TokenUsage caps are optional and owned elsewhere (`wip-and-cost-limits.md` §10). One axis, one fix.
- **A free-text or slider money input.** Rejected: number input + currency select is the boring, correct, precision-safe shape. A slider invents a range with no defined max; free-text invites parse ambiguity. The closed currency enum + numeric major-unit field maps cleanly to `WireMoney`.
- **A separate Sessions tab/drawer on TaskSheet.** Rejected: a tab adds navigation overhead for a 3-row list. The sessions section flows inline in the existing scroll column — denser, no extra chrome, matches WorkTask's inline section.
- **Making session rows clickable to open the harness from TaskSheet.** Rejected here (kept in WorkTask): TaskSheet is a quick in-context peek; harness deep-links live on the full WorkTask detail page. Keeps the sheet minimal.
- **Weakening the kill dialog copy to "tasks keep running" instead of implementing the cascade.** Rejected: the docs intend the cascade (concept Decision 1); the honest *and* correct move is to make the promise true, not to lower the promise.

## Open questions for the architect

1. **Sessions endpoint shape.** Frontend `useTaskSessions` already expects `{ sessions: TaskSession[] }` where `TaskSession = { id, title, agent, cost: WireMoney|null, tokens, status, harnessUrl, effectivenessScore }` (`hooks/useTaskSessions.ts:13`). `GET /api/tasks/:id/sessions` must return exactly this shape. `status` = session `state` (active/...) so the active-dot keys off it; map session `outcome` into the label for ended sessions. Confirm the title/agent derivation (sessions table has no title — derive from agent + startedAt, or "Session N").
2. **SessionRow reuse.** Extract `SessionRow`/`LiveDot` usage into a shared spot, or duplicate the ~40-line component into TaskSheet? Duplication keeps TaskSheet self-contained (it already inlines `KanbanTask`); extraction avoids drift. Architect's call — design only requires identical visual output. TaskSheet's variant omits the harness link and effectiveness score for density; WorkTask keeps them.
3. **Activate error surface.** Where does a `CapacityExceededError` (400) from activate render? Recommend a `role="alert"` line under the bet title.
4. **AppetiteDialog prop change.** `currentAppetite: string` → `WireMoney | null`; `onConfirm: (string, string)` → `(WireMoney, string)`. Confirm no other caller depends on the old signature (it's defined and used only inside WorkBet).
