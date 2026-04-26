# Bucket A — Conversations daily loop (Wave 3)

Auditor: designer
Browser: Playwright headless (chromium), 1440x900
Server: http://localhost:5173
Date: 2026-04-26

## Environment baseline

- Default route `/` redirects to `/conversations/review`. The page loads with **mock data only** (`MOCK_REVIEWS` in `packages/web/src/pages/ConversationsReview.tsx`). One thread renders directly into the artifact area; there is **no list-of-threads view**.
- Submenu (`aria-label="Filter Conversations"`) renders four tabs: `All / Needs review / Chats / Resolved` plus two static section headers `Review Queue 3` and `Chat 1`. The section bodies are **not populated** with thread rows — only the headers exist. Clicking any tab does not change the URL or visibly filter the thread list because the list does not exist.
- Verdict actions render in `ReviewHeader` with aria-labels for every primary + secondary action (Approve, Request changes, Reject, Snooze, Pause, Approve with comments, Comment, Inline comment, Edit, Reply, Escalate). Single-key shortcuts pre-fill a "Pending: <verdict> — press Enter to confirm" affordance.
- Rail renders `Active Bets`, `Blockers`, `Cost` sections. None of the entries are interactive (verified by walking parent chain — no anchor/button/role).
- Cmd+K opens a global search palette (`Search conversations, work, knowledge…`). `/` does NOT trigger search.
- `/conversations/chat` renders one thread (`Sprint planning`) with a composer footer. No thread list, no pinned Coach thread, no unread indicators.

---

## Journey rank 1 — DL-02 — Triage overnight blocking review threads

**Walked**: partial — the queue itself does not render, so steps 1, 4 (advance), 5 (next) cannot be exercised.
**Steps actually possible**: step 3 (read reasoning + artifact on the one mock review), step 4 (verdict shortcuts pre-fill).
**Screenshots**: `screenshots/A-DL-02-needs-review.png`, `screenshots/A-DL-02-after-NeedsReview-tab.png`, `screenshots/A-DL-02-resolved-tab.png`, `screenshots/A-DL-02-after-X-reject.png`.

### Gaps

| Severity | Step | What's missing/broken | Repro |
|---|---|---|---|
| missing | 1 (filter to blocking) | No "blocking" filter chip exists. Submenu tabs are `All / Needs review / Chats / Resolved` — none is "blocking". `Needs review` is the closest but is a tab, not a filter, and produces no visible change. | Click `Needs review` tab → URL stays `/conversations/review`, thread/queue rendering unchanged. |
| missing | 1 (the queue itself) | The Submenu has section headers `Review Queue 3` and `Chat 1` but **no rows under them**. There is no scrollable list of overnight items to triage. | Inspect Submenu — only 4 tab buttons exist as clickables; no ThreadRow primitives are rendered. |
| missing | 2 (open top blocking thread) | No row to click. The page already shows one mock thread inline. There is no concept of "next thread" to open. | n/a — the affordance to open a different thread is absent. |
| missing | 4 (advance after verdict) | Pressing A/R/X/S sets `Pending: <verdict>` and Enter confirms (mock only), but there is no auto-advance to the next blocking thread because there is no list. | Press `A`, then `Enter` — pending banner clears; no navigation occurs. |
| missing | 5 (J/K next-prev) | J/K keys do nothing in the review page — no list to move through. The keyboard handler covers only A/R/X/S/P/Enter. | Press `KeyJ`, `KeyK` repeatedly. URL and selected item unchanged. |
| degraded | 1 (blocking visual differentiation) | No visible "blocking" badge on the active review. The metadata strip shows `status pending sla 2h left routing Backend Agent`, but no dedicated blocking indicator. The data model knows `blocking: true` (see `MockReviewItem`), the surface doesn't render it. | Inspect ReviewHeader — no chip with "blocking" or red-dot. |

### Notes

The verdict grammar (A/R/X/S/P → pending → Enter) is implemented and correct. The triage flow itself is not — there is no inbox view, no queue position, no "3 of 7 blocking" counter, no auto-advance. This is the literal core daily loop and currently consists of one static mock thread.

---

## Journey rank 2 — DL-09 — Notice + unblock a stuck agent (Rail → Conversations bridge)

**Walked**: partial — Rail renders the Blockers section but rows are static.
**Steps actually possible**: step 1 (see "1" badge next to BLOCKERS label) and step 2 (read "Developer / Waiting for API spec / BLOCKED").
**Screenshots**: `screenshots/A-DL-01-glance.png`.

### Gaps

| Severity | Step | What's missing/broken | Repro |
|---|---|---|---|
| broken | 3 (click blocker → jump to thread) | The Blocker row "Developer — Waiting for API spec — BLOCKED" is **not interactive**. Walked the parent DOM chain from the text node up to `<body>`: zero `<a>`, `<button>`, or `role="button"` ancestors. Clicking does nothing. | Run `node docs/reviews/journey-gaps/_audit2.mjs` — output: `Blocker entry interactivity chain: NOT INTERACTIVE`. |
| missing | 3 (deep-link to conversation) | No URL pattern for blocker→thread navigation. Clicking the blocker entry does not change the URL. | n/a — no affordance. |
| degraded | 2 (per-blocker duration) | The Rail blocker entry shows "Waiting for API spec" but no duration ("for 47m", "since 2h ago"). Without duration the founder cannot distinguish "freshly blocked" from "stuck for hours". | Inspect Blockers section in Rail — only label + status chip, no time. |
| missing | 4 (reply with missing piece) | Even if the blocker linked to a thread, there is no shortcut to "reply with missing context" — the Rail does not surface what context is missing. | n/a |

### Notes

The bridge from Rail to Conversations does not exist as an interaction; it exists only as visual proximity. This is the journey description verbatim ("Rail → Conversations bridge") and the bridge is missing.

---

## Journey rank 5 — DL-01 — 10-second "is anything on fire" morning glance

**Walked**: yes (this is read-only by design).
**Steps actually possible**: 1 (open Factory landing), 2 (glance at Rail), 3 (scan thread list), 4 (decide).
**Screenshots**: `screenshots/A-DL-01-glance.png`.

### Gaps

| Severity | Step | What's missing/broken | Repro |
|---|---|---|---|
| degraded | 2 (Rail minimized strip with critical numerals) | Rail shows `ACTIVE BETS 2`, `BLOCKERS 1`, `COST TODAY $12.40 / $50.00`. There is no single-line "minimized strip" of "X blocked / Y reviews / $Z spend". The numerals are correct but spread across three sections, not condensed for a 10-second glance. | Visually inspect Rail. |
| missing | 2 (unread reviews count in Rail) | Rail shows blockers count but not the **review queue** count. Submenu shows `Review Queue 3` but that's not in the Rail — the founder must look at two regions. | Compare Rail content to Submenu. |
| missing | 3 (blocking-vs-non-blocking visual differentiation in ThreadRow) | There are no ThreadRows rendered anywhere — only one inline thread. Nothing to scan. | n/a |
| missing | 3 (pinned Coach thread always visible) | No pinned thread surface in either Submenu or Rail. The pinned-Coach pattern from spec is absent. | n/a — Coach is not surfaced. |
| degraded | 4 (cost vs budget at a glance) | Cost section shows `TODAY $12.40 / TODAY BUDGET $50.00`. Two rows for one decision. No utilization bar, no remaining-headroom number. The 10-second read takes more than a glance. | Visually inspect COST section. |

### Notes

The Rail renders the right *categories* (active bets, blockers, cost) but not in a "10-second glance" format. The most-needed datum — "do I have blocking reviews waiting for me?" — is in the Submenu, not the Rail.

---

## Journey rank 6 — DL-05 — Approve high-risk action_summary

**Walked**: no — there is no `action_summary` artifact in the mock data.
**Steps actually possible**: none of the action_summary-specific steps. The page only renders a `text_diff` artifact.
**Screenshots**: `screenshots/A-DL-02-needs-review.png` (shows `text_diff` artifact label).

### Gaps

| Severity | Step | What's missing/broken | Repro |
|---|---|---|---|
| missing | 2 (action_summary renderer with structured fields) | `MOCK_REVIEWS` contains only `text_diff` and `data_metrics` artifacts. No `action_summary` shape is exercised in the live UI. | Read `packages/web/src/pages/ConversationsReview.tsx` — check artifact `shape` keys. |
| missing | 2 (what-changes / impact / rollback fields) | No structured impact list, no rollback-plan field, no checks-passed list. | n/a — no action_summary route to inspect. |
| missing | 2 (risk-tier badge) | No risk-tier badge anywhere on the live thread. Catalog calls for one. | Aria-label scan returned no `tier` / `risk` labels. |
| missing | 2 (reversibility tag) | No reversibility indicator (irreversible/reversible) on the active review. | n/a |
| missing | 2 (cost_estimate visible) | The Rail shows global cost; the per-thread cost_estimate (e.g. "this deploy will cost $X") is not surfaced. | n/a |
| missing | 4 (Approve with conditions) | "Approve with comments" exists in the More menu but no first-class "Approve with conditions" affordance for action_summary that captures a condition list. | Open More menu → no conditions UI. |

### Notes

Action_summary is one of the two highest-blast-radius artifact shapes (catalog rank 6 reason: "deploy, pricing change, ad campaign, Stripe live mode"). Currently there is no live surface for it. ArtifactView may have a stories variant — verify in `/designsystem` — but the consumer page does not feed it that shape.

---

## Journey rank 9 — DL-03 — Approve low-risk text_diff in 15s, keyboard-only

**Walked**: yes — happy path works.
**Steps actually possible**: 1, 2, 3.
**Screenshots**: `screenshots/A-DL-02-needs-review.png`, `screenshots/A-DL-09-cmdk.png` (shows pending banner after `X`).

### Gaps

| Severity | Step | What's missing/broken | Repro |
|---|---|---|---|
| degraded | 3 (one-key approve) | Pressing `A` does NOT approve immediately — it sets `Pending: approve — press Enter to confirm`. This is two keys (A then Enter), not one. The catalog says "one-key approve". The pending-confirm pattern is a defensible safety choice but conflicts with the 15-second target. Note: this also conflicts with RE-01 ("undo a fat-finger A") — pre-fill+confirm IS the undo. Trade-off needs explicit owner. | Press `KeyA` → "Pending: approve" appears. Press Enter → committed (mock). |
| missing | 3 (reversibility cue on the Approve button) | Approve button has no visual cue ("irreversible — confirm" vs "reversible — instant"). The same button is used for both. | Hover Approve — only `title="Approve (A)"` tooltip. |
| degraded | 2 (skim diff above the fold) | The diff is inline and short, but the reasoning block sits above it (5 steps shown). For a 15-second flow, reasoning above the diff pushes the artifact below the fold on smaller viewports. Comment in source confirms intentional ordering ("reasoning block renders before the artifact for every review") — designer call needed: is this right for low-risk text_diff? | Resize viewport to 1024×600 — diff scrolls. |

### Notes

The keyboard-only path is feasible but two keys, not one. The pending-confirm pattern needs a designer decision: instant-with-undo (matches catalog "one-key") vs pre-fill-confirm (current — slower but safer for fat-finger).

---

## Journey rank 10 — DL-06 — "Request changes" with inline-anchored direction

**Walked**: partial — Request Changes button exists but does not open a composer.
**Steps actually possible**: 1 (open thread). Step 2 (inline comments) and step 3 (bundled submit) cannot be completed.
**Screenshots**: `screenshots/A-DL-06-request-changes.png`, `screenshots/A-ADV-01-more-menu.png`.

### Gaps

| Severity | Step | What's missing/broken | Repro |
|---|---|---|---|
| broken | 3 (Request Changes commits without composer) | Clicking `Request changes` (or pressing `R` then Enter) commits the verdict immediately with **no opportunity to attach a one-line summary or inline comments**. The composer is missing. | Click Request changes → no modal, no textarea (`[role="dialog"]` count = 0, `textarea` count = 0). |
| missing | 2 (inline anchor on diff line) | No "comment on this line" gutter affordance in the diff. The `Inline comment` button exists in the More menu but it is not anchored to a specific line — it is a global thread action with no line-binding mechanism. | Hover a diff line → no gutter UI. Click `Inline comment` in More menu → see degraded item below. |
| broken | 2 (Inline comment menu item) | Clicking `Inline comment` in the More menu produces no visible composer or anchor cursor — the click is a no-op at this stage. | Open More menu → click `Inline comment` → no UI change. |
| degraded | (More menu layout) | The More overflow popover is **visually broken**: menu items overlap each other (e.g. "Inline comment" text overlays "C", "Edit" and "E" stack on the same row, "Escalate" overlaps "Reply"). This is a popover layout regression, not a content problem. | Open More menu (screenshot `A-ADV-01-more-menu.png`). |
| missing | 3 (verdict + feedback bundled in one submit) | Because no composer opens for Request Changes, the bundled-submit pattern can't be exercised. | n/a |

### Notes

This is the most-used non-approve verdict in the catalog and the trust mechanism for the whole proposal-review pattern. It is currently a stub. The More menu also has a layout bug that makes the secondary actions hard to read.

---

## Journey rank 11 — DL-19 / PU-18 — Approve skill change before it propagates

**Walked**: no — there is no skill_change artifact in the mock data.
**Steps actually possible**: none specific to skill changes.
**Screenshots**: n/a (no surface to capture).

### Gaps

| Severity | Step | What's missing/broken | Repro |
|---|---|---|---|
| missing | 1 (notification for skill-change) | No visual indication of skill-change pending. No "skill change" tag/category. | Search for "skill" / "SKILL" in DOM → 0 hits. |
| missing | 2 (SKILL.md diff renderer) | text_diff renderer exists but is not wired to a skill_change artifact. No way to view a SKILL.md diff in a live thread. | n/a |
| missing | 3 (impact / blast-radius list) | No "which agents will get this" panel, no agent-impact list, no blast-radius indicator. Search for `propagate|all agents|IMPACT|BLAST` → 0 hits. | Audit script output: `Blast/impact count: 0`. |
| missing | 3 (sandbox-test result) | No surface for sandbox/dry-run results that should accompany a skill change before approve. | n/a |
| missing | (always-blocking treatment) | No special handling — skill changes would render identically to a normal text_diff, which under-signals the blast radius. | n/a |

### Notes

This is the highest-blast-radius approval the founder produces. The artifact shape, the impact list, and the always-blocking treatment are all absent. Currently a skill change would render as an indistinguishable text_diff.

---

## Journey rank 12 — RE-01 — Reverse a fat-finger verdict before the agent acts

**Walked**: partial — there is no undo affordance, but the pending-confirm pattern serves as a substitute.
**Steps actually possible**: 1 (notice), 3 (re-approve only because no commit happened).
**Screenshots**: `screenshots/A-DL-02-after-X-reject.png` (shows `Pending: reject — press Enter to confirm`).

### Gaps

| Severity | Step | What's missing/broken | Repro |
|---|---|---|---|
| missing | 2 (Undo toast 5–10s after commit) | No toast appears after pressing Enter on a pending verdict. No 5-10 second undo window. | Press `A` → Enter → no toast, no banner, no transient affordance. |
| missing | 3 (verdict revert button while session not yet acted) | No "revert verdict" or "withdraw" button on the thread after a verdict is committed. | n/a — committed state is not visible (mock no-op). |
| missing | (audit entry showing flip) | No audit-trail surface on the thread to show "you approved at 09:15, reverted at 09:15:08". | n/a |
| degraded | (reliance on pending-confirm as substitute) | The pending-confirm pattern (press A → "Pending: approve" → Enter to commit) DOES give a brief reversal window (Esc to abandon). But this is *pre-commit*, not *post-commit*. RE-01's JTBD is "I already approved by accident and need to reverse before the agent acts" — the current UI cannot distinguish that case because the commit is a no-op. | Inspect handler — `commitVerdict` is a comment-only stub. |

### Notes

The pending-verdict pattern partially mitigates fat-finger but only **before** Enter. Once committed, there is no undo. For a real agent that starts acting on commit, the post-commit undo is the load-bearing affordance and it is missing.

---

## Journey rank 13 — DL-16 / PU-17 — Reply to / coach the Chief of Staff

**Walked**: partial — `/conversations/chat` renders one thread.
**Steps actually possible**: 1 (open chat tab/page), 2 (read), 3 (composer is visible). Cannot navigate threads.
**Screenshots**: `screenshots/A-DL-16-chat-page.png`, `screenshots/A-DL-16-after-Chats-tab.png`.

### Gaps

| Severity | Step | What's missing/broken | Repro |
|---|---|---|---|
| missing | 1 (unread indicator on pinned Coach thread) | The page shows one thread (`Sprint planning`, from `Architect` agent). No pinned-Coach thread, no unread dot. There is a small red dot on the IconRail Knowledge icon (left rail) but nothing in the chat surface itself. | Visual inspection of `/conversations/chat`. |
| missing | 1 (pinned-at-top placement) | No `pinned` section. Submenu shows `Chat 1` but no row list. | n/a |
| missing | 1 (Coach / Chief of Staff thread exists at all) | The single thread is `Sprint planning` from `Architect`. No "Chief of Staff" or "Coach" thread surfaced. | DOM scan: `Coach`/`Chief of Staff` mentions = 0. |
| missing | (monthly digest header — PU-17) | No "monthly digest" surface on a Coach thread because no Coach thread exists. | n/a |
| missing | (rule change inline action) | No "rule change" affordance to apply CoS-proposed changes inline. | n/a |
| degraded | (composer always-visible) | The composer footer ("Type a message…") is always visible, even when no thread is selected (currently the only one auto-selects). For the empty/no-thread case the composer should be hidden. | Visual inspection. |

### Notes

The Coach thread is the entire "trust compounding" mechanism per the catalog (rank 13 notes: "the only systemic-improvement surface; load-bearing for trust compounding"). It does not exist in the live UI.

---

## Journey rank 22 — DL-21 / DL-22 — Triage items routed to my domain

**Walked**: no — no per-founder routing exists.
**Steps actually possible**: none. The system has no notion of "current actor" so domain routing cannot be observed.
**Screenshots**: `screenshots/A-DL-02-needs-review.png` (no domain badge visible).

### Gaps

| Severity | Step | What's missing/broken | Repro |
|---|---|---|---|
| missing | 1 (open my queue) | No "filtered to me" toggle or actor-aware view. Submenu has `All / Needs review / Chats / Resolved` — no `Mine` / `Routed to CEO` / `Routed to CPO`. | DOM scan: `my queue|assigned to|routed to me` = 0 matches. |
| missing | 2 (per-founder routing surfaced) | Threads show `routing Backend Agent` (the *agent* that produced the artifact) but not "routed to CEO" / "routed to CPO". No domain badge. | Read metadata strip on active thread. |
| missing | 2 (product/domain badge on ThreadRow) | No ThreadRow rendered, and the active thread has no product or domain chip. | Visual inspection. |
| missing | 3 (hand-off to other founder) | No `Reassign to CPO` / `Hand off` affordance. See rank 32 below for full audit. | More menu inspection. |

### Notes

The two-founder model needs (a) actor identity, (b) routing metadata on each thread, (c) a "Mine" filter. None of these exist. The system is currently single-actor.

---

## Journey rank 32 — ADV-01 — Reassign verdict / chat to my co-founder

**Walked**: no — there is no reassign affordance anywhere.
**Steps actually possible**: open the More menu (which is the only plausible host).
**Screenshots**: `screenshots/A-ADV-01-more-menu.png`.

### Gaps

| Severity | Step | What's missing/broken | Repro |
|---|---|---|---|
| missing | (reassign affordance) | The More overflow menu contains: `Approve with comments / Comment / Inline comment / Edit / Reply / Escalate`. No `Reassign`, no `Hand off`, no `Send to co-founder`. | Open More menu, scan items. Audit output: `Reassign affordance count: 0`. |
| degraded | (Escalate as substitute) | `Escalate` exists as a verb but its target is undefined (escalate to whom? to which surface?). It is a generic action, not a co-founder hand-off. Clicking it triggers no visible UI change. | Aria-label `Escalate` exists. Clicking via `getByRole` was unable to locate the visible button (count = 0 outside the More menu — affordance is buried in the popover). |
| missing | (thread ownership transfer) | No concept of thread ownership. After a hypothetical reassign, there is no surface that shows "owned by CPO". | n/a |
| missing | (co-founder selector) | No actor list / picker UI that would surface "select co-founder". | n/a |
| missing | (audit of routing) | No "routed by Chief of Staff to CEO; reassigned by CEO to CPO" trail. | n/a |

### Notes

ADV-01 is the explicit safety valve for the two-founder routing model. Without it, a misrouted thread has no clean exit. The Escalate action is the closest verb but is undefined and not wired to co-founder hand-off.

---

## Bucket summary

### Counts

- **broken**: 4 (Request Changes commits without composer, Inline comment menu item is no-op, Blocker rows are not interactive, More menu popover layout overlaps items)
- **missing**: 38 (queue list, blocking filter, J/K nav, auto-advance, blocking badge, deep-link blocker→thread, per-blocker duration, action_summary renderer + risk tier + reversibility + cost_estimate + conditions, undo toast, post-commit revert, audit-trail surface, skill_change artifact + impact list + blast-radius + always-blocking, Coach thread, pinned thread, monthly digest, rule-change action, routed-to-me filter, domain badge, reassign action, co-founder selector, thread ownership, ten-second-glance strip, unread reviews count in Rail, pinned coach in glance, blocking-vs-non-blocking ThreadRow differentiation, composer hide-on-empty, inline anchor on diff line, gutter affordance, sandbox-test result panel, inline-anchor → verdict bundling, escalate target, etc.)
- **degraded**: 8 (Rail blocker has no duration, Cost section needs glance density, Approve takes 2 keys not 1, no reversibility cue on Approve, reasoning above text_diff hurts 15s flow, More menu items overlap, Escalate is undefined verb, composer always visible in chat)

### Top 5 most-impactful gaps

1. **No thread list / no queue rendering anywhere.** The Submenu has section headers `Review Queue 3` and `Chat 1` but never renders rows. Every triage journey (DL-02, DL-09, DL-21/22) is blocked at step 1. This is the literal core daily loop and there is nothing to triage.
2. **Request Changes has no composer.** Pressing the most-used non-approve verdict commits silently, with no inline-anchored feedback, no one-line summary, no bundled submit. The trust mechanism for proposal review (catalog rank 10) does not exist.
3. **Rail blockers are not interactive.** The "Rail → Conversations bridge" (catalog rank 2) is a label, not a link. Founders see "1 blocker" and can read what it is, but cannot act on it from the Rail. The whole point of ambient awareness made actionable is broken.
4. **No post-commit undo.** RE-01 (catalog rank 12) depends on a 5–10 second toast or revert button after a verdict. None exists. The pending-confirm pattern partially substitutes but only pre-commit. For irreversible-on-commit actions, this is a trust hazard.
5. **No Coach / Chief of Staff thread exists.** DL-16 / PU-17 (catalog rank 13) is the only systemic-improvement surface and is the load-bearing trust-compounding mechanism. The chat page renders one mock `Sprint planning` thread instead.

### Surprises

- The verdict grammar (A/R/X/S/P → pending → Enter) is implemented and feels coherent, but conflicts directly with the 15-second one-key approve target in DL-03. This is a real designer call: instant-with-undo (matches DL-03) vs pre-fill-confirm (current — better for high-risk, slower for low-risk). The current uniform treatment under-serves both.
- The Escalate aria-label exists in the More menu but the menu's popover layout is broken (items overlap visually). This is the closest thing to "reassign to co-founder" but is undefined.
- Cmd+K opens a global search but `/` does not. The catalog calls for a search-everywhere shortcut; only one of two common conventions is wired.

### Blockers / infrastructure

- None preventing the audit. Dev server stable across 6 navigations + 4 keyboard interactions. No 500s, no white screens, no console errors observed during automated walk.
- The audit had to rely on mock data (`MOCK_REVIEWS`) since the page is pre-implementation. Several journeys cannot be fully evaluated until real artifact shapes (`action_summary`, `skill_change`) are wired through the page.

### Driver scripts

- `docs/reviews/journey-gaps/_audit.mjs`, `docs/reviews/journey-gaps/_audit2.mjs` — Playwright walk used to gather evidence. Re-runnable against the running dev server.
