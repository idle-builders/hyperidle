# AF8 — Code Review (Phase 4)

**Verdict: NOT DONE** — 1 CRITICAL, 5 WARNING. The backend is strong (the two things I said I'd check hardest in Phase 2 — the cost-breach/quiet-hours split and the `kind`-not-message auto-unblock filter — are both implemented faithfully). The failures are on the frontend contract: a brand-new dead control, a popover that materially diverges from the locked design, and hollow story coverage.

Round 1 of max 3.

---

## AC table (AC → test → pass/fail)

| AC | Test | Verdict |
|---|---|---|
| AC1 — drain delivers pending row automatically | `AF8-notification-delivery.integration.test.ts` "drain loop delivers pending row" | **WEAK PASS** — asserts `flushQueue` marks the row sent, but the test calls `flushQueue` directly, not the drain interval. The interval-firing path (`startNotificationDrain` actually invoking flush on a tick) is only proven by "returns a disposer that does not throw". The behavior is correct (drain wraps flushQueue verbatim) but the AC ("no manual flush") is proven by the wrapped fn, not the timer. Acceptable. |
| AC2 — notification event → typed, thread-keyed source-linked row | same file, AC2 test | **PASS** — asserts `typeKey="review_request"` and `sourceLink === "/conversations/${threadId}"` exactly. Pins the corrected shape. Real assertion. |
| AC3 — auto_unblock does NOT create a row | AC3 test | **PASS** — emits `kind:"auto_unblock"` with the real dep-watcher message text, asserts zero rows. Proves the filter is on `kind`, not message. Correct. |
| AC4 — quiet-hours defers blocking, then delivers | AC4 test | **PASS** — defers under window, `deferred===0` after window clears. Real. |
| AC12 — cost_breach bypasses factory silence, defers in quiet hours | AC12 (a)+(b) | **PASS** — both cases asserted. The rule-#8 regression guard. Strong. |
| AC5 — stuck lease recovered automatically | AC5 test | **WEAK PASS** — calls `recoverStuckLeases` directly, not via the drain tick. The AC says "by the scheduled drain". `flushQueue` calls it at its top so the wiring is real, but the test exercises the helper, not the drain. Acceptable. |
| AC6 — cost sentinel reacts to a real written value | AC6 test | **PASS** — writes via `recordFactoryCost`, reads `factory_settings.cost_actual > 0`, asserts `cost_cap_breached` emitted. Real input→output. |
| AC7 — source link persisted, never reconstructed | AC2 (persist half) + popover reads `row.sourceLink` | **PASS (backend)** — persistence asserted. Component reads the column (`navigate(row.sourceLink)`, no route building). Confirmed by reading the component, not a dedicated unit test, but the assertion in AC2 + the component code together cover it. |
| AC8 — registry is single source for Settings + mute | `AF8-notification-types.test.ts` + `AF8-SettingsNotificationsTypeList.test.tsx` | **PASS** — registry shape + `urgencyForType` unit-tested; Settings renders one switch per entry. Real. |
| AC9 — muting a type suppresses enqueue | AC9 integration + Settings component | **PASS** — muted `review_request` → zero rows enqueued. Real. |
| AC10 — popover lists/marks-seen/dismisses; unread dot; states; API | `AF8-NotificationPopover.test.tsx` + AC10 API | **PARTIAL** — API shapes pass. Component: empty/loading/error/populated render, markSeen-on-open, dismiss→markRead, mute→muteType all asserted (real). BUT the loading-state assertion is hollow (`getByRole("status") ?? querySelector` with `.toBeDefined()` — `??` short-circuits and `toBeDefined` on a truthy expression always passes). And the error-state Retry button is asserted present but is a DEAD control (no onClick) — see CRITICAL-1. |
| AC11 — type-list supersedes the 3 AF15 toggles | AC11 test | **PASS** — asserts `email-digests` gone, exactly `NOTIFICATION_TYPES.length` switches, intro text present. Real. |

All ACs have a test; AC10 has one hollow sub-assertion and ships a dead control that its own test "passes" on.

---

## Findings

### CRITICAL

**C1 — Introduced dead control: the popover "Retry" button has no `onClick`.**
`packages/web/src/shell/NotificationPopover.tsx:154-168`. The error-state Retry button renders but does nothing — clicking it cannot re-fetch the inbox. `useNotifications` exposes no `refetch`, so there is no handler to wire. The error state is therefore a terminal dead end: the only recovery is closing and reopening the whole popover.

This is **introduced by AF8**, not a pre-existing AF16-owned dead control. A control you add in the same diff must work or not exist. AC10 requires the error state to "render" — it does, but a render-only Retry is a slop control that the component test (`:131`) green-lights by asserting only presence.

**Fix:** add a `refetch` to `useNotifications` (expose the existing `fetchInbox` callback) and wire `onClick={() => void refetch()}` on the button. The hook already has `fetchInbox` — it just isn't returned. One-line export + one-line wire.

### WARNING

**W1 — Popover row diverges materially from the locked design (`approved.md` §A "Row anatomy").**
`NotificationPopover.tsx:191-326`. The approved contract is a **single-line dense row** (`min-h-36px`, urgency dot → title (flex-1, truncate) → type label → relative time → trailing mute/dismiss that are `opacity-0` until `group-hover`/`focus-within`). The built row is a **two-tier stacked block**: title row, then a meta row, then a third always-visible actions row with text buttons "Mute review" / "Dismiss". This is a different visual grammar than the one locked in Phase 2 — taller, noisier, no hover-reveal, text buttons instead of 16px glyph buttons. Design lens: TSX does not match the approved reference.

Also in the same block:
- Empty state is plain text "All caught up" (`:172-184`), not the DS `EmptyState` with the body line "Notifications land here when something needs you." that `approved.md` §States mandates.
- No outside-click close and no Escape handler — `approved.md` §Placement explicitly requires both ("Escape closes; outside-click DOES close"). Only the × button closes. Functional gap, not just visual.
- `left: "212px"` and `bottom: "64px"` are hardcoded pixel offsets (`:73-74`) rather than the `fixed bottom-16 left-4` anchor in the spec; brittle against sidebar width changes.

**Fix:** rebuild the row to the single-line spec (or get the design contract amended — but that is a Phase 2 re-litigation, not a Phase 4 call). At minimum add Escape + outside-click close and the EmptyState body line, which are behavioral/contract gaps independent of the row layout debate.

**W2 — Stories are hollow: four of five "state" stories render the identical component with no state control.**
`NotificationPopover.stories.tsx`. `Empty`, `LoadingState`, `ErrorState`, `Populated` all render `<NotificationPopover open={true} onClose={noop} />` with no mock of `useNotifications`. In Storybook the hook runs its real `fetchInbox`, so every one of those four stories renders whatever that single fetch resolves to (error or perpetual loading) — they cannot show distinct states. Only `Empty`/`Closed` are honest by accident. This defeats the purpose of state stories (visual verification of each state) and is the kind of copy-paste slop the rubric flags. Frontend rule requires a `.stories.tsx` rendering **key states** — these render one state four times.

**Fix:** lift the popover's data into props (or accept an injectable hook) so stories can drive loading/error/populated/empty deterministically. Given the hook is hard-wired, this likely needs the component to accept the notification data as props with the hook as the default — a small refactor the design-system story model expects.

**W3 — `POST /seen` does an N+1 update loop instead of a single UPDATE.**
`notifications-routes.ts:385-399`. Selects all unseen ids, then issues one `UPDATE ... WHERE id = ?` per row in a JS loop. This is a set-to-value over a filtered set — a single `UPDATE notification_queue SET seen_at = now WHERE seen_at IS NULL` does it in one statement. At 50+ unseen rows this is 50+ round-trips on every popover open. Drizzle supports the bulk form (`.update(notificationQueue).set({seenAt}).where(isNull(notificationQueue.seenAt))`). Simplification + performance.

**W4 — `POST /:id/read` UUID validation regex is too loose and the update is unauthenticated-against-existence (silent no-op on bad id).**
`notifications-routes.ts:404-417`. `/^[0-9a-f-]{36}$/` accepts `------------------------------------` (36 dashes) and other non-UUID 36-char strings — it does not validate UUID structure (version/variant nibbles or hyphen positions). The plan said "Validate `:id` is UUID"; use `z.string().uuid()` to match the contract. Low severity (the value only feeds an `eq` on a UUID PK, so a malformed id just matches nothing) but it is the exact validation the route-checklist promised. Also: a read on a non-existent id returns `{ok:true}` with zero rows affected — harmless but the route claims success for a no-op.

**W5 — Listener `classifyItem` has dead/duplicated branches (slop).**
`notification-listener.ts:47-64`. The `risk === "high" || risk === "blocking"` branch and the `risk === "medium"` branch return the identical value (`{review_request, immediate}`), and the trailing `low → ambient` comment+return is the only branch that differs. The three-way `if` collapses to: `immediate` if `blocking || risk ∈ {high, blocking, medium}`, else `ambient`. The medium branch is a copy of the high branch with its own comment — reads like it was meant to differ but doesn't. Tighten to one predicate. (Behavior is correct per the concept's "≥ medium → immediate" rule — this is a clarity finding, not a correctness one.)

### NIT

- **N1** — `notification-listener.ts:114`: `severity` is `urgency === "immediate" ? "blocking" : "digest"`. See adjudication of flagged item #2 below — this is **correct**, not a finding, but the variable would read more honestly named `egressSeverity` since it no longer maps 1:1 to the model.
- **N2** — `GET /inbox` sorts in JS after a `createdAt`-ordered query (`:357-362`); the `nq_inapp_idx(readAt, createdAt)` does not cover the urgency-first sort. Cap-50 bounds it; flagged in Phase 2 as a NIT and remains one.
- **N3** — `useNotifications` `fetchInbox` sets `status:"loading"` on every poll/refetch, which would flash the spinner over existing rows on a 30s poll. The hook doesn't actually poll yet (no interval — the plan's "~30s" polling is not implemented), so latent. If polling is added, guard the loading flash.
- **N4** — `useNotificationMute` (Settings) and `useNotifications.muteType` (popover) are two separate hooks writing the same store but with no shared cache; muting in the popover won't reflect in an already-open Settings panel until remount. The concept's hard rule #5 ("popover shortcut and Settings list write the same per-user mute state") is satisfied at the store level (both hit `PUT /mute/:key`), so this is acceptable for v1, but note it.

---

## Adjudication of the two builder-flagged items

**Flagged #1 — Retry button with no onClick → CRITICAL (AF8 must fix).**
Ruled CRITICAL-1 above. AF16 owns *pre-existing* dead controls; this one is *introduced* by AF8 in the same diff. A new control must work or not exist. The fix is one-line (expose `fetchInbox` as `refetch`, wire it). Not punt-able to AF16.

**Flagged #2 — `severity` derived from `urgency` (`immediate→blocking`, ambient→`digest`) → builder is CORRECT. Not a finding (downgraded to NIT N1).**
I verified the claim against the concept's urgency model and the actual surfaces:
- The popover's data source is `GET /inbox`, which filters **only** on `readAt IS NULL` (`notifications-routes.ts:349-355`) and returns **all urgencies**. It does not read or filter on `severity`. So `severity` does not gate in-app display.
- The listener enqueues a row for **every** non-`auto_unblock` event after the mute check (`notification-listener.ts:116-128`), regardless of urgency. An ambient `review_request` IS written to `notification_queue` with `urgency:"ambient"` and appears in the popover (sorted into the ambient block, no unread escalation). This is exactly the concept's `ambient` definition ("listed, no escalation") — Phase 4 concept.md §Urgency.
- `severity` is the dormant **egress** field (push/email), retired as the model field per concept Phase 3. Mapping ambient→`digest` means an ambient review only egresses at digest time — which is *correct*: ambient = no interrupt ring. The concept explicitly says `digest` is an egress delivery mode, and ambient items should not page.

So no ambient notification is dropped from the in-app surface. The builder's reasoning is faithful to the urgency model. The only residual is naming clarity (N1).

---

## Architecture lens (positive)

- Three-layer downward dependency respected. `useNotifications`/`useNotificationMute` go through `apiFetch` (HTTP), never import `@hyperidle/db` (lore-asserted and verified). Listener/drain/mute live in fabric; routes in server; component in web. No reach-past-neighbor.
- The `kind` discriminator is **mandatory** on `NotificationEvent` (`events.ts:96`), set at both emit sites (`policy-engine.ts` → `"attention"`, `dependency-watcher.ts` → `"auto_unblock"`). Compiler-enforced, message-text-free filter. Exactly the Phase-2 contract.
- Cost-breach split implemented in BOTH `flushQueue` (`dispatcher.ts:399-496`) and the direct-send `route()` (`:687-744`), with `isFactorySilenced` (no window) + `isInSilenceWindow` as the two predicates. `isSilenced` retained for back-compat. Faithful to the locked § "Cost-breach silence split".
- `recordFactoryCost` at the tail of `recordCostAndCheck` (`cost-cap.ts:351`) with the AF10-preservation + inflation `@lore`. Sound.
- Source link corrected to thread-keyed at the listener (`buildSourceLink`), `threadId`-null → `/conversations` fallback (not a 404-shaped link). Matches the plan.

## Security lens

- `PUT /mute/:key` validates `:key ∈ NOTIFICATION_TYPES` (`:438-445`); no rate limiter, justified per Phase-2 (idempotent, founder-tier, no fan-out). OK.
- `/seen`, `/:id/read` writes are idempotent set-to-value; no limiter needed. OK.
- `sourceLink` is system-authored; the component navigates it verbatim. The plan promised the popover would "reject `javascript:`/external (defense-in-depth) — validate starts with `/`." **This guard is NOT implemented** — `navigate(row.sourceLink)` (`:215`) is called with no prefix check. Since the link is system-authored today the risk is low, but the plan's §Security "Addressed" claim does not match the diff (Auditor lens: PR/plan claim ≠ code). Folding into W4-adjacent; recommend the one-line `if (!row.sourceLink.startsWith("/")) return;` guard the plan specified.
- No secrets logged/returned. STRIDE clean for the new routes.

---

## Documentation score (`/write-docs` rubric, `docs/guides/user/notifications.md`)

The doc is short (42 lines) but accurate, scannable (tables, bolded lead-ins), and matches the shipped behavior (types table, inbox row anatomy, mute, the cost-breach-bypasses-silence-but-respects-quiet-hours nuance, auto-unblock-is-not-a-notification). It is, however, thin on activation/visuals and slightly ahead of the build in one place (mentions "set primary and digest channels" / "quiet hours in Settings" which exist in config but the type-list Settings surface AF8 shipped does not include — minor drift).

| # | Dimension | Score | Note |
|---|---|---|---|
| 1 | Attention capture (lead) | 4 | Opens with the value ("when agents need your attention"), no preamble. |
| 2 | Scannability (headings/tables/bold) | 5 | Strong: type table, bolded row lead-ins, sectioned. |
| 3 | Progressive disclosure | 4 | Types → inbox → delivery → settings → edge case. Logical. |
| 4 | Accuracy vs shipped behavior | 4 | Matches; minor drift on "digest channel in Settings > Notifications" (config exists, but not in the AF8 type-list panel). |
| 5 | Activation / next-action | 3 | "Click the bell" is the only call to action; no screenshot/visual, no "try it". |
| 6 | Concision | 5 | No filler, no superlatives. |
| 7 | Correct terminology (concept vocab) | 5 | "inbox/popover", "type", "quiet hours", "factory silence", "auto-unblock ambient" — all on-vocabulary; avoids "rail"/"category". |
| 8 | Completeness (covers new surfaces) | 3 | Covers popover + mute + Settings toggles. Missing: dismiss-vs-mute distinction (concept's load-bearing difference), urgency dot meaning (immediate vs ambient color), empty state. |
| 9 | Error/edge guidance | 3 | Quiet-hours + silence covered well; nothing on "what if the inbox fails to load" or muted-everything. |
| 10 | Voice/consistency | 5 | Consistent second-person, calm, matches house voice. |

**Total: 41/50.** Threshold (≥35, all dims ≥3) **MET** — all dimensions ≥3, total 41. Docs PASS. (Recommend, not block: add the dismiss≠mute distinction (#8) and an urgency-dot legend, since both are load-bearing in the concept and absent.)

---

## What the builder must fix to reach DONE (round 2)

1. **C1** — wire the Retry button (`refetch`) or remove it. (blocking)
2. **W1** — add Escape + outside-click close and the EmptyState body line; reconcile the row layout with `approved.md` (or escalate the design delta explicitly rather than silently shipping a different grammar). (blocking — contract divergence)
3. **W2** — make the four state stories render distinct states. (blocking — hollow coverage)
4. **W3, W4, W5** — single-statement `/seen` update; `z.string().uuid()` on `:id` + the `sourceLink` `startsWith("/")` guard the plan promised; collapse the duplicated `classifyItem` branches. (should-fix)
5. Fix the hollow loading-state assertion in `AF8-NotificationPopover.test.tsx:111-113`. (should-fix)

NIT N1-N4 are optional.

---

# AF8 — Code Review (Phase 4), Round 2

**Verdict: DONE.** All round-1 blockers (C1, W1, W2) and should-fixes (W3, W4, W5, hollow loading assertion) resolved against the actual code. Verify green (2599 tests). Round 2 of max 3.

## Fix verification (against code, not the builder's word)

| Item | Status | Evidence |
|---|---|---|
| **C1** — Retry wired to real refetch | **RESOLVED** | `useNotifications.ts:92` returns `refetch: fetchInbox`; `NotificationPopover.tsx:209` `onClick={() => void refetch()}`. Test `AF8-NotificationPopover.test.tsx:141-162` clicks Retry and asserts `refetchMock.toHaveBeenCalledOnce()` — real, not hollow. |
| **W1** — row matches `approved.md` §A | **RESOLVED** | Single-line dense row (`min-h-[36px]`, `py-[9px] px-[12px]`, `:244-378`): urgency dot → title (`flex-1 truncate`) → type label (mono uppercase) → relative time (tabular-nums) → trailing mute/dismiss **16px glyph buttons** with `opacity-0 group-hover:opacity-100 focus-within:opacity-100`. DS `EmptyState` with the mandated body line (`:218-222`). **Escape** (`:94-103`) AND **outside-click** (`:106-116`) both present. Anchor is `fixed bottom-16 left-4` (`:139`) — no hardcoded `left:212px/bottom:64px`. **No nested-button violation**: row is a `<div role="button" tabIndex=0>` with `onClick`+`onKeyDown`; the two trailing `<button>`s sit inside it with `e.stopPropagation()` — HTML-legal, `@lore`-documented at `:236-243`. |
| **W2** — four stories render DISTINCT states | **RESOLVED** | Component accepts `_data?: UseNotificationsResult` (`:70`), `_data ?? hookData` (`:81`). Stories inject per-state: `Empty` (ready/[]), `LoadingState` (loading), `ErrorState` (error), `Populated` (4 rows incl. immediate+ambient). No more identical `open={true}` with live hook. |
| **W3** — `/seen` single bulk UPDATE | **RESOLVED** | `notifications-routes.ts:391` — `db.update(notificationQueue).set({seenAt}).where(isNull(notificationQueue.seenAt))`. One statement, no loop. |
| **W4** — `:id` UUID validation + sourceLink guard | **RESOLVED** | `notifications-routes.ts:404` `z.string().uuid().safeParse(id)` → 400 on invalid (no more loose `[0-9a-f-]{36}` regex). Component guards `if (!sourceLink.startsWith("/")) return;` at `:122` before `navigate()`. |
| **W5** — `classifyItem` collapsed | **RESOLVED** | `notification-listener.ts:56-65` — single `blocking` branch, single `risk ∈ {high,blocking,medium} → immediate` predicate, `else → ambient`. Duplicate medium branch gone. Behavior unchanged (≥medium→immediate). |
| Hollow loading assertion (R1 should-fix) | **RESOLVED** | `AF8-NotificationPopover.test.tsx:117` now `getByRole("status",{name:/loading/i})` + `:119` asserts list NOT present. The `?? querySelector` + bare `toBeDefined()` form is gone. |
| **Docs** — dismiss≠mute + urgency legend | **RESOLVED** | `docs/guides/user/notifications.md:22` explicit "Dismiss ≠ Mute" paragraph; `:24-29` urgency-dot legend table (red=immediate, gray=ambient). |

## AC table — movements from round 1

| AC | R1 | R2 | Note |
|---|---|---|---|
| AC1 — drain delivers pending automatically | WEAK PASS | **WEAK PASS (unchanged)** | Behavior correct (drain wraps `flushQueue` verbatim); test still exercises wrapped fn not the timer tick. Acceptable — not a regression, not a blocker. |
| AC5 — stuck lease recovered by drain | WEAK PASS | **WEAK PASS (unchanged)** | `flushQueue` calls `recoverStuckLeases` at its top; test calls the helper directly. Same wiring, same acceptable gap. |
| AC10 — popover lists/marks/dismisses; states; API | PARTIAL | **PASS** | The two things keeping it PARTIAL are gone: the dead Retry control is wired + tested (C1), and the hollow loading assertion is now a real `getByRole("status")` + list-absence check. All four states render, markSeen-on-open, dismiss→markRead, mute→muteType, row anatomy all asserted with real assertions. |

AC10 moved PARTIAL → real PASS. AC1/AC5 remain WEAK PASS — these were already adjudicated *acceptable* in round 1 (the AC behavior is correct; only the test's entry point differs from the AC's literal "by the drain tick"). Not blockers; noted for a future test-hardening NIT. All other ACs were PASS in round 1 and are unchanged.

## Round-2 adjudications

**`vi.mock` not at top level (`AF8-NotificationPopover.test.tsx:259`) → NIT (accept, do not block).**
Confirmed by running the file: 10/10 pass, and vitest emits the warning ("will become an error in a future version"). The nested `vi.mock` is hoisted file-wide anyway and is **redundant** — the top-level `vi.mock` at `:20` already mocks `useNotifications`, and `beforeEach` sets the return value. The nested call at `:259` (inside the Sidebar-dot `it`) sets a return value that the Sidebar test does not even read its `unseenCount` from (the dot is driven by the `unseenNotificationCount={3}` prop, not the hook). So it is dead-and-redundant, not load-bearing. Today: tests green, no functional risk. It is a latent breakage on a future vitest major and trivially correct AI-slop (a `vi.mock` that does nothing). **Ruling: NIT** — clean it up opportunistically (hoist or delete the redundant `:259-268` block) but it does not gate DONE. Not a WARNING because it changes no behavior and the warning is non-fatal on the pinned vitest (`v4.1.7`).

**`//evil.com` / `javascript:` open-redirect via `startsWith("/")` → NOT a vulnerability. Guard is sufficient.**
- `javascript:` and absolute `http://`/`https://` are blocked — they don't start with `/`.
- `//evil.com` *does* start with `/`, so it passes the guard. But the component calls **`navigate(sourceLink)`** (React Router 7.15.1 client-side), never `window.location =` and never an `<a href>`. React Router parses the string into an internal path object and routes it through the in-app router — `navigate("//evil.com")` resolves to an in-app route `//evil.com` (no match → catch-all), **not** a protocol-relative off-origin redirect. The browser is never handed the string as a URL. Verified: this path has no `<a href={sourceLink}>` anywhere — `navigate()` is the only consumer.
- Defense-in-depth note (non-blocking): if a future change ever swaps `navigate()` for an `<a href>` or `window.location`, `//host` *would* become exploitable. To make the guard robust against that future, prefer `sourceLink.startsWith("/") && !sourceLink.startsWith("//")`. **Not required for DONE** — `sourceLink` is system-authored today (`buildSourceLink` only ever emits `/conversations[/id]`), the value is never attacker-controlled, and the current sink (`navigate`) is not redirect-exploitable. Logged as NIT N5.

## New findings (round 2)
- **N5** — `sourceLink` guard `startsWith("/")` admits protocol-relative `//host`; harmless under `navigate()` but brittle if the sink ever changes. Tighten to also reject `//`. NIT.
- No new CRITICAL or WARNING. No regressions introduced by the five fix commits (`568decde`, `f987cceb`, `f3a66cfa`, `3bd9ea50`, `7d2ab2ef`).

## Verdict

**DONE.** C1 + W1–W5 + docs all genuinely resolved against the code. AC10 is now a real PASS; AC1/AC5 stay acceptable-WEAK as adjudicated in R1. The two round-2 adjudicated items are both NIT (the `vi.mock` hoist warning and the `//host` guard hardening) — neither blocks. Pipeline proceeds to retro + ship.
