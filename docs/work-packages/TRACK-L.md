# Track L: Journey Gap Closure

Closes the highest-leverage gaps surfaced by the wave-1–4 user-journey audit (April 2026). Stories are derived from `docs/reviews/journey-gaps/registry.md` (top-tier clusters) plus the two structural data-shape mismatches (autonomy ladder, founder/actor routing) that the audit flagged as "fix before building dependent UI."

**Source documents:**
- `docs/reviews/journeys/catalog.md` — ranked journey catalog (32 Major / 36 Minor / 18 Auxiliary)
- `docs/reviews/journey-gaps/registry.md` — 28 ranked clusters from 169 raw audit gaps
- `docs/reviews/journey-gaps/bucket-{A,B,C,D}.md` — per-bucket audit reports with screenshots
- `docs/reviews/journey-gaps/pruned.md` — cuts kept for inspection

**Track sequencing:** L1 + L2 are pure data-shape changes that unblock dependent UI; ship them first. L3–L10 can run in parallel within their action class once schemas are in place. L5 (mobile) and L10 (first-run) are full-stack flows — assign their own owner.

**Action class taxonomy** (from registry.md):
- `data-shape` — schema/contract change
- `route-add` — new route + page shell
- `affordance` — UI element + handler on existing surface
- `flow` — multi-step orchestration / wizard / draft state
- `recovery` — safety / undo / kill-switch
- `responsive` — breakpoint / viewport

See `docs/work-packages/SHARED.md` for tech stack, shared contracts, and dependency graph.

---

### L1 — Autonomy Schema: L1–L4 per Agent per Skill

**Story.** As a founder gradually handing more rope to agents, I want autonomy stored as the L1–L4 ladder per `(agent, skill)` pair (not a single 3-state global flag), so that the trust-compounding mechanism the spec depends on can actually be expressed and the UI built on top of it doesn't have to be replaced.

**Depends on.** A2 (database schema), UI-50 (settings panel surface).

**Acceptance criteria.**
- `AutonomyLevel` type changed from `"manual" | "supervised" | "autonomous"` (current `SettingsPanel.tsx:18`) to a discriminated `L1 | L2 | L3 | L4` ladder with explicit semantics documented in `packages/shared/src/types/autonomy.ts`.
- Persistence: per-`(agent_id, skill_id)` row, not per-agent. Drizzle migration adds `agent_skill_autonomy` table; existing rows backfilled from the 3-state value with a documented mapping.
- API: `GET /api/agents/:id/autonomy` returns `{ skill_id, level, updated_at, updated_by }[]`. `PATCH /api/agents/:id/autonomy` accepts `{ skill_id, level, rationale }`.
- All existing reads of `agent.autonomy` updated to consume the new shape; no callers of the deleted 3-state field remain (`grep` returns 0 hits).
- `bun run check` + `bun run lint` + `bun run test` green; existing autonomy tests rewritten against the new schema.

**Validation scenarios.**
- Given an agent with no per-skill rows, when the autonomy editor opens, then every skill defaults to L1 with a "not yet trusted" hint.
- Given a `PATCH` lifting `(architect, deploy)` from L2 to L3, when re-fetched, then the row reflects L3 and `updated_by` is set.
- Given the migration runs against a seeded DB with `autonomy = "supervised"`, when complete, then every `(agent, skill)` pair lands at L2 (documented mapping).

**Contracts / constraints.**
- Levels: L1 (asks every step) / L2 (asks before commit) / L3 (commits low-risk, asks high-risk) / L4 (autonomous, retro). Definitions live in `packages/shared/src/types/autonomy.ts` as the single source of truth.
- Skill axis is required — single-axis (per-agent) autonomy is rejected at the type level.
- No UI work in this story beyond keeping existing surfaces compiling. The interactive editor (in-context "raise autonomy" affordance) ships in a follow-up under TRACK-F or TRACK-J.

**Effort.** M (~3d)

---

### L2 — Founder/Actor Routing Schema (Identity, Domain, Reassign)

**Story.** As a CEO or CPO operating a two-founder factory, I want the system to know who I am, route work to me by domain, and let me reassign threads to my co-founder, so that the two-founder model in `F-6.4` actually works instead of silently single-actor.

**Depends on.** A2, E2 (auth surface).

**Acceptance criteria.**
- `actor` type added to `packages/shared/src/types/actor.ts`: `{ id, role: 'CEO' | 'CPO', domain_tags: string[] }`.
- Threads gain `routed_to_actor_id?: string` and `domain_tag?: string` fields. Migration adds columns; existing threads default `routed_to_actor_id = null` (treat as "either founder").
- API: `GET /api/me` returns the current actor. `PATCH /api/threads/:id/route` accepts `{ to_actor_id, reason }` and writes an audit row.
- `Reassign to <co-founder>` becomes a defined verb (no longer "Escalate"); audit trail records every routing change.
- Conflict semantics: when both founders verdict the same thread, the second verdict is rejected with a `409 founder_conflict` error and a payload that includes the first verdict — UI consumers can show a resolution prompt (UI work in a follow-up story).
- `bun run check` + `bun run lint` + `bun run test` green; new tests cover `/me`, route patch, and the 409 case.

**Validation scenarios.**
- Given the CEO is logged in and a thread is routed to CPO, when the CEO opens it, then the UI surface (consuming `/me` + `routed_to_actor_id`) can show "Routed to CPO" — no UI assertion in this story; assert from API alone.
- Given a thread is reassigned from CEO to CPO with reason "needs design judgment," when the audit log is queried, then a row exists with `from_actor_id`, `to_actor_id`, `reason`, `at`.
- Given founder A has approved a thread, when founder B attempts to approve, then the API returns `409 founder_conflict` with the existing verdict.

**Contracts / constraints.**
- `domain_tag` is free-form text; canonical values (`market`, `growth`, `portfolio`, `product`, `design`, `tech`, `content`) live in `packages/shared/src/constants/domains.ts`.
- `routed_to_actor_id = null` is valid and means "either" — UI MUST treat null as "anyone."
- No "owner transfer" semantics — reassignment is routing only; both founders retain visibility. The owner concept is out of scope for L2.

**Effort.** M (~3d)

---

### L3 — Thread List / Queue Rendering

**Story.** As a founder triaging overnight work, I want the Conversations submenu to actually render thread rows under its section headers (Pinned / Blocking / Reviews / Chats / Resolved) with J/K nav, blocking-first sort, and a queue-position counter, so that the literal core daily loop is no longer blocked at step 1.

**Depends on.** L2, J4 (Conversations surface).

**Acceptance criteria.**
- Submenu sections render `ThreadRow` items under each header. Counts in the header (`Review Queue 3`) match rendered rows.
- Section ordering: Pinned → Blocking → Reviews → Chats → Resolved (last 24h). Within each section, blocking-flagged threads sort first, then by `updated_at` desc.
- Keyboard: `J` / `K` move selection down/up across all sections; `Enter` opens the selected thread; `[` / `]` jump between sections.
- "X of N blocking" counter visible at the top of the Conversations view.
- Pinned Coach / Chief-of-Staff thread is sticky-pinned at the top of the Pinned section (depends on L9 if Coach data not yet seeded — gate the visual on real data).
- Mine / Routed-to-CEO / Routed-to-CPO filter chips visible above the list when L2 has shipped; default selection: "All."
- `bun run test` + Playwright E2E asserting: 3 seeded threads render, J/K moves selection, `Enter` opens.

**Validation scenarios.**
- Given the seeded fixture has 3 reviews and 1 chat, when Conversations loads, then 4 rows render and the `Review Queue` header shows "3."
- Given the selected row is row 1 of section A, when `K` is pressed at row 1 of section B, then selection moves to the last row of section A (cross-section nav).
- Given a thread is `blocking: true` in the Reviews section, when the section renders, then it sorts above non-blocking reviews.

**Contracts / constraints.**
- Existing `useConversations` hook is the data source; do NOT add a new fetch. Section grouping is computed client-side.
- Filter state is local (URL-persistent only via existing query-param pattern in router).
- Empty section: render the header with "(none)" muted text; never hide the header — honesty over cleanliness.

**Effort.** M (~3d)

---

### L4 — Verdict Undo + Click/Keyboard Parity

**Story.** As a founder approving 50+ items a day, I want the mouse-click verdict to require the same pre-fill confirm as the keyboard path, AND a 5–10s undo toast on every committed verdict, so that a fat-finger doesn't ship something irreversible and trust on the highest-frequency action stays intact.

**Depends on.** J4.

**Acceptance criteria.**
- Mouse-click on Approve / Reject in `ReviewHeader` enters the same pre-fill confirm state as the keyboard path. First click pre-fills; second click confirms. (Configurable via Settings → Appearance: `verdict_double_click: true` default; advanced users can set to single-click with a written warning.)
- After commit, a toast renders for 8 seconds with `Undo` action. `Undo` calls a `POST /api/threads/:id/verdict/undo` endpoint that reverses the verdict iff the agent has not yet acted on it; if the agent acted, the undo button is replaced with `View what shipped` linking to the audit row.
- Audit trail: every commit AND every undo writes a row with `actor_id`, `at`, `prior_state`, `new_state`.
- Reversibility cue: Approve button shows a small `↶ undoable` chip when the artifact is reversible; absent when not (consumed from `artifact.reversibility` field — gate visually on artifact metadata).
- Keyboard parity: `U` triggers undo while the toast is visible. `Esc` dismisses the toast without undoing.
- `bun run test` + Playwright E2E: click-click commits, single-click does not commit, toast appears, `U` undoes, undo audit row is written.

**Validation scenarios.**
- Given a fresh page, when the user clicks Approve once, then the button shows "Confirm Approve" pre-filled state and no API call is made.
- Given the user has clicked Approve twice and the toast is visible, when `U` is pressed within 8s, then the verdict is reversed and a follow-up toast confirms the undo.
- Given the agent has already acted on the verdict, when the user opens the toast at 7s, then the `Undo` button is replaced by `View what shipped` linking to the audit row.

**Contracts / constraints.**
- Undo window is 8s by default; configurable in Settings → Appearance (`undo_window_seconds`, range 3–15).
- Undo MUST fail closed if the agent has already acted — never silently ignore.
- `POST /api/threads/:threadId/verdict/undo` response codes:
  - `200 OK` — undo recorded; body: `{ undo_response_id, reverted_response_id, prior_decision, at }`.
  - `400 Bad Request` — invalid body. The schema is `.strict()`; sending an `actorId` body field is rejected (identity is server-derived from the `X-Actor-Id` header).
  - `401 Unauthorized` — no actor identified (no `X-Actor-Id` header and no env fallback).
  - `403 Forbidden` — `{ error: "actor_mismatch" }`. The requesting actor does not match the original `approver_id`. (Cross-founder undo blocked.)
  - `404 Not Found` — `{ error: "no_recent_verdict" }`. Either thread/item missing OR the latest row is not a `transition='commit'` row (idempotent: a second undo on the same item returns 404).
  - `409 Conflict` — `{ error: "agent_already_acted", audit_row_id }`. The predicate is `items.agent_acted_at > responses.responded_at` (the commit being undone).
  - `410 Gone` — `{ error: "undo_window_expired", expired_at }`. Now is past `responded_at + undo_window_seconds` (snapshotted per row).
- Identity sourcing: the request is authenticated by the global API-key middleware; the actor identity is taken from the `X-Actor-Id` header (or `HYPERIDLE_DEFAULT_ACTOR_ID` env fallback). The body MUST NOT contain an `actorId` field — see the L4 review (security CRIT) for the spoofing class this prevents.
- This story does NOT add the artifact-reversibility metadata field; that ships in L9 (artifact-kind renderers). Until L9, the `↶ undoable` chip stays hidden.

**Effort.** S (~2d)

---

### L5 — Mobile Breakpoint + Phone-First Verdict Surface

**Story.** As a founder doing the morning rhythm on my phone, I want a real mobile layout with a thumb-reachable verdict surface and bottom-tab nav, so that the rank-8 phone-first daily-core journey (DL-26/DL-27) actually completes in <60s instead of being blocked by a clipped desktop layout at 390px.

**Depends on.** L3, J2 (shell navigation).

**Acceptance criteria.**
- `useViewportBreakpoint` extended with `mobile` (<768px) and `tablet` (768–1023px). Three breakpoints replace the current two-state desktop-only check.
- Mobile shell: bottom-tab nav (Conversations / Work / Knowledge / Settings) with the Coach/CoS thread accessed from a top-bar avatar. IconRail and Submenu collapse into the bottom tabs; expanded Rail is unavailable on mobile (replaced by a Rail-glance strip at the top).
- Verdict surface on mobile: Approve / Request Changes / Reject as a bottom sticky bar; tap targets ≥44px; labels not truncated. Snooze and overflow accessible via a "More" sheet.
- Rail-glance strip (mobile only): one line — `Blocking N · Burn $X · Anomalies 0` — tap to expand into a full-screen sheet with the desktop Rail content.
- Thread row tap → full-screen reading view; back-swipe / back-button returns to list with scroll position preserved.
- Connection-loss handling (ADV-03): an offline banner appears when network is unreachable; verdict commit attempts queue and replay on reconnect with a single "Synced N items" toast.
- Playwright E2E at 390×844 viewport: morning-glance journey completes (open app → see blocking count → open one → approve → return to list) in deterministic steps; no element clips off-screen at any step.

**Validation scenarios.**
- Given the viewport is 390×844, when the app loads, then the bottom-tab nav is visible and the Rail-glance strip renders the blocking count without clipping.
- Given the user is on a thread and loses network mid-approve, when `Approve` is tapped, then an offline indicator appears and the verdict queues; on reconnect within 60s the verdict commits and a "Synced 1 item" toast appears.
- Given the user is mid-thread, when the back button is pressed, then the list view returns with the same scroll position (within 20px tolerance).

**Contracts / constraints.**
- Tap target minimum: 44×44px enforced by a Tailwind utility on every interactive element in the mobile bar.
- No new font sizes — reuse the design-token type scale; only spacing and arrangement change.
- Quiet-hours and per-product mute editors are NOT in scope for L5 (they ship in a notification-surface follow-up under TRACK-F).
- Bottom-tab nav uses `MobileTabBar` as a new component; do not reuse `IconRail` rendered horizontally.

**Effort.** L (~5d)

---

### L6 — Request-Changes Composer + Inline Anchor

**Story.** As a founder asking an agent to revise a proposal, I want clicking Request Changes to open a composer (one-line summary + optional inline-anchored comments on diff lines) instead of silently committing the verdict, so that the most-used non-approve verb actually delivers the inline-anchored direction the trust mechanism depends on.

**Depends on.** J4.

**Acceptance criteria.**
- Clicking Request Changes opens a modal composer with: (a) one-line summary input (required, ≤140 chars), (b) optional list of inline-anchored comments (added by clicking diff-gutter affordances, not yet via a separate flow), (c) Submit / Cancel.
- Diff gutter: each diff line gets a subtle hover-state `+ Comment` affordance; clicking adds a comment row tied to that line index. Comments persist with the verdict.
- Submit posts a `request_changes` verdict with `summary` and `inline_comments[]` to `POST /api/threads/:id/verdict`. Server stores both and emits an event the agent's runtime consumes.
- Cancel discards composer state with no API call. Pressing `Esc` cancels.
- More-actions popover layout bug fixed (current items overlap visually per `A-ADV-01-more-menu.png`).
- Keyboard: `R` opens the composer; `Cmd/Ctrl+Enter` submits; `Esc` cancels.
- `bun run test` + Playwright E2E: open composer, type summary, anchor 2 comments, submit, verify API payload shape.

**Validation scenarios.**
- Given a review thread with a `text_diff`, when `R` is pressed, then the composer opens with the summary field focused.
- Given the composer is open with summary "tighten the wording" and 2 anchored comments, when `Cmd+Enter` is pressed, then the verdict commits and the toast confirms "Changes requested with 2 inline comments."
- Given the composer is open and `Esc` is pressed, then it closes with no API call and the verdict bar returns to default state.

**Contracts / constraints.**
- Inline comments are line-anchored (line index in the diff), not character-anchored — keep storage simple.
- Summary is required; submission without summary is rejected at the form level (no API call).
- Inline comments on non-diff artifact kinds are out of scope for L6 — defer to artifact-specific stories under L9 if/when needed.

**Effort.** M (~3d)

---

### L7 — Recovery Verbs (Kill Switch / Rollback / Mid-Session Pause)

**Story.** As a founder who has granted autonomy to agents, I want a factory-wide kill switch, a rollback verb on shipped actions, and a mid-session pause/stop on running agents, so that the safety net the architecture explicitly requires "from day one" actually exists and trust compounding can begin.

**Depends on.** L2 (audit needs `actor_id`), UI-50.

**Acceptance criteria.**
- Factory kill switch: a `Pause Factory` action accessible from (a) the avatar menu in the top bar (always visible), (b) the keyboard shortcut `Cmd+Shift+.`, (c) Settings → Safety. Triggering it pauses every running session, blocks every queued task, and renders a factory-wide banner. Resuming requires explicit confirm.
- Rollback verb: every committed verdict on a reversible artifact (per `artifact.reversibility` from L9, or always-true placeholder until L9 ships) gets a `Rollback` action in the thread's overflow menu. Rollback writes an audit row, attempts to reverse the action server-side, and shows a `Rollback succeeded / partially / failed` outcome.
- Mid-session pause: bet detail and team detail pages get a `Pause` button per running agent session. Pausing freezes the session at its next checkpoint; resume is a separate verb. Distinct from kill (kill terminates and discards in-progress work; pause preserves).
- Confirmation dialogs: every destructive verb shows a blast-radius preview ("this will pause 4 agents across 2 products") and requires typing the factory name OR pressing-and-holding for 1.5s, configurable per Settings → Safety.
- Mandatory rationale: rollback, kill-switch, and mid-session-stop all require a non-empty `reason` field captured in the audit row.
- `bun run test` + Playwright E2E: kill switch triggered from each entry point pauses sessions; rollback on a fixture verdict writes the expected audit row; mid-session pause leaves session resumable.

**Validation scenarios.**
- Given 3 sessions are running, when the kill switch is triggered with reason "spotted bad output," then all 3 sessions move to `paused` within 2s and the factory-wide banner is visible across every page.
- Given a verdict was committed 5 minutes ago and the artifact is reversible, when `Rollback` is selected with reason "agent ignored my comments," then the audit row records the rollback and the agent session is signaled.
- Given the user attempts a kill-switch without a reason, when `Confirm` is pressed, then the dialog blocks submission and highlights the empty rationale field.

**Contracts / constraints.**
- Kill switch is global (factory scope) — there is no per-product kill in L7. Per-product "pause all" ships under a follow-up if demanded.
- The `reason` field is plain text, max 500 chars, persisted in the audit row.
- Rollback is best-effort: if the underlying action is non-reversible (e.g., email already sent), the audit records `rollback_failed` and the UI surfaces it clearly. Never silently succeed when the action did not reverse.
- This story does NOT add the artifact-reversibility metadata field — until L9 ships, treat all verdicts as nominally reversible at the audit-row level (server may refuse to act).

**Effort.** L (~5d)

---

### L8 — Rail Interactivity (Bridge to Conversations + System-Stability Strip)

**Story.** As a founder taking a 10-second morning glance, I want the Rail's blockers, active bets, and cost rows to be clickable (deep-link to the source thread or detail), and a system-stability strip showing crashed sessions / cap-reached / API-degraded indicators, so that ambient awareness becomes actionable navigation.

**Depends on.** L3, J2.

**Acceptance criteria.**
- Each Rail blocker row is a button/link wrapping the existing layout. Clicking deep-links to the source thread (`/conversations/review?thread=<id>`). Hover reveals duration ("for 47m") and source agent.
- Each Active Bet row deep-links to `/work/bet/:betId`. Each Cost row deep-links to a cost-drill view (or, until L13/cost-drill ships, opens Settings → Caps with the relevant scope highlighted).
- System-stability strip: a fourth Rail section rendering `crashed_sessions`, `cap_reached_products`, `api_degraded` flags. Each row deep-links to the relevant detail surface. Strip is hidden when all three are 0.
- Minimized 10s-glance: when the Rail is collapsed, the system-stability strip surfaces its non-zero counts as red BLK-style pills next to the existing pill cluster.
- ARIA: every now-interactive Rail row has an accessible label describing the destination.
- `bun run test` + Playwright E2E: clicking a blocker row navigates to the right thread; system-stability strip renders the right counts from a seeded fixture.

**Validation scenarios.**
- Given a Rail blocker row "Developer / Waiting for API spec / BLOCKED 47m," when clicked, then the URL becomes `/conversations/review?thread=<source-thread-id>` and the thread opens.
- Given the seeded fixture has 1 crashed session, when the page loads, then the system-stability strip renders "1 crashed session" as a red row.
- Given all stability counts are 0, when the page loads, then the strip is not rendered at all.

**Contracts / constraints.**
- Deep-link query-param contract is already established by `?thread=<id>`; reuse, don't invent.
- The system-stability strip data source is a new aggregated endpoint `GET /api/system/stability` returning `{ crashed_sessions, cap_reached, api_degraded }`. Do NOT poll faster than every 30s.
- Cost-drill view is out of scope for L8; until that ships, the cost-row deep-link goes to Settings → Caps. Document this explicitly in the row's title attribute.

**Effort.** S (~2d)

---

### L9 — Artifact-Kind Renderers (action_summary / skill_change / file_lease / permission_request)

**Story.** As a founder reviewing high-blast-radius work, I want distinct renderers for each artifact kind (with risk-tier badge, blast-radius / impact list, reversibility tag, cost estimate, sandbox-test result) so that approving a deploy or a skill change never visually collapses into the same surface as approving a typo fix.

**Depends on.** A2 (artifact schema), L1 (autonomy schema for permission_request).

**Acceptance criteria.**
- `Artifact` schema gains: `risk_tier: 'low' | 'medium' | 'high' | 'critical'`, `reversibility: boolean`, `cost_estimate: number | null`, `blast_radius: { agents: string[], teams: string[], products: string[] }`, `sandbox_result: 'passed' | 'failed' | 'n/a' | null`. Migration ships.
- Four new renderers in `packages/web/src/components/artifacts/`:
  - `ActionSummaryView` — deploy / pricing / email blast with explicit one-shot confirm and impact list.
  - `SkillChangeView` — skill diff + per-agent impact list ("this changes how Architect, Developer, Builder behave"); requires explicit pin-version OR rollback-window selector before approve.
  - `FileLeaseView` — side-by-side competing artifacts from two agents with `Grant lease to A / Grant lease to B / Ask both to coordinate` verdict variants.
  - `PermissionRequestView` — current autonomy level, requested level, justification text, `Approve once / Raise level / Deny + reason` verdicts.
- Metadata strip at the top of every artifact view: kind badge, risk-tier badge (colored), reversibility tag, cost-estimate chip, SLA, routing.
- All four renderers honor the L4 verdict-undo + audit-trail contract.
- `bun run test` + Playwright E2E for each renderer with seeded fixtures of each kind.

**Validation scenarios.**
- Given an artifact with `kind: skill_change`, when the thread opens, then `SkillChangeView` renders with the per-agent impact list visible above the verdict bar.
- Given an `action_summary` with `risk_tier: critical`, when the thread opens, then the metadata strip shows a red `CRITICAL` badge and the Approve button shows the type-to-confirm pattern from L7.
- Given a `permission_request` from agent X to raise (deploy, L2→L3), when `Approve once` is selected, then the autonomy table is unchanged and a one-shot grant is recorded for the request.

**Contracts / constraints.**
- The four renderers MUST share a single `<ArtifactShell>` wrapper that renders the metadata strip — no duplication of badge logic.
- `blast_radius` is render-only in L9 — surface for the founder to read; an editable / agent-supplied surface is not in scope.
- Risk-tier mapping (low/medium/high/critical) is per-artifact-kind defaults, override-able per-instance. Defaults live in `packages/shared/src/constants/artifact-risk.ts`.

**Effort.** L (~5d)

---

### L10 — First-Run Flow (Factory Bootstrap + API Key + North Star + Verdict Coach)

**Story.** As a founder installing HyperIdle for the first time, I want a guided first-run flow (factory bootstrap → API key → North Star seed → first-team scaffold → verdict-grammar coach) so that a fresh install is actually usable instead of only-functional-because-of-seeded-fixtures.

**Depends on.** L1, L2, A2, E1.

**Acceptance criteria.**
- "No factory" empty state: when the app boots and no factory exists, render a `Create your factory` flow instead of the populated UI. Reuses the bottom-tab / desktop split from L5.
- Factory bootstrap step: factory-name field, profile picker (CEO / CPO), data-dir confirmation (default OS-appropriate), `Create` button. Persists a factory + actor row.
- API-key step: Settings → Models & Keys tab populated with key entry, test-key button (calls a real provider ping), masked-secret pattern (show last 4 chars only), model-tier mapping (`opus`, `sonnet`, `haiku` mapped to spec-defined fallback chain). Until a key tests green, the user cannot leave this step.
- North Star step: PRINCIPLES / FOCUS / PORTFOLIO three-doc seeding wizard. Each doc has a non-empty placeholder + an `I'll do this later` skip with a follow-up reminder thread from the Coach.
- First-team scaffold (optional, skippable): create one product + first team (PM/Builder/Growth/Ops roles, default L2 across the autonomy table from L1) + a brief stub.
- Verdict-grammar coach: on the first thread the founder opens, an inline coach mark walks A / R / X / S keys with a "see agent acknowledge" follow-up after the first verdict. `?` shortcut opens this coach mark anytime.
- Skipping any optional step does not break downstream surfaces — empty states render gracefully.
- `bun run test` + Playwright E2E: complete the full flow end-to-end against a wiped DB; all subsequent surfaces (Conversations, Work, Knowledge) load without errors.

**Validation scenarios.**
- Given a wiped DB, when the app loads, then the first-run flow renders with the factory-name step focused; the populated UI is unreachable until the flow is completed or skipped.
- Given the user has typed a factory name, picked CEO, and clicked Create, when the flow advances, then a factory + actor row exists and `/api/me` returns the new actor.
- Given the user is on the API-key step with a known-bad key, when `Test key` is pressed, then a clear error message renders and the user cannot advance.
- Given the user has completed bootstrap and opens a seeded thread, when the verdict bar renders, then the coach mark is visible on the first viewing only and does not reappear after dismissal.

**Contracts / constraints.**
- Provider-ping for `Test key` MUST hit a real endpoint with a `usage: 1 token` minimal request and never store the response body.
- API key is stored at-rest using the same secret-handling pattern as `H1` (review SHARED.md for the canonical approach); never log the key.
- The optional first-team step is the only step that may be skipped; all other steps (factory, API key, North Star) must complete for the app to leave the first-run flow.
- Re-onboarding after multi-week absence (ADV-08) is NOT in scope for L10 — that ships under a separate story when the journey audit revisits it.

**Effort.** L (~5d)

---

## Track summary

| Story | Action class | Effort | Unblocks (registry rank) |
|---|---|---|---|
| L1 | data-shape | M | rank 12 (autonomy schema), most of TRACK-F autonomy UI |
| L2 | data-shape | M | rank 14 (founder routing), L3, L7 audit, L8 deep-links |
| L3 | affordance | M | rank 1 (thread list) — every triage journey |
| L4 | recovery | S | rank 2 (verdict undo) |
| L5 | responsive | L | rank 3 (mobile) — DL-26/27 |
| L6 | affordance | M | rank 4 (request-changes composer) |
| L7 | recovery | L | rank 5 (kill switch / rollback) |
| L8 | affordance | S | rank 6 (Rail interactivity) |
| L9 | data-shape + flow | L | rank 7 (artifact renderers) — 6 Major journeys |
| L10 | flow | L | rank 8 (first-run) |

**Critical path within track:** L1 + L2 → (L3, L4, L6, L8) parallel → L9 → L7 → L10. L5 is independent and can ship at any point after L3.

**Out of scope (kept in `docs/reviews/journey-gaps/registry.md` for future tracks):** Tier 3 clusters (knowledge versioning, sunset wizard, skill management UI, session inspection, ⌘K fix, team-roster authoring, file-lease conflict UI, mandatory-rationale generalization) and all Tier 4 polish items.
