# Bucket C — Risk & Recovery (Wave 3)

Auditor lens: adversary. 8 Major journeys, all rare-but-mission-critical. Live UI at `http://localhost:5173`.

Severity:
- **broken** — surface present but does not work / dead-end
- **missing** — no UI surface at all
- **degraded** — present but lacks safety hallmarks (no audit trail, no blast-radius preview, no undo, no confirm)

Reachability legend:
- **walked** — every step in the journey spec has at least *something* to interact with
- **partial** — entry point exists, mid/late steps unreachable
- **unreachable** — no entry point, journey cannot be observed in the current build

Source-of-truth journeys: `docs/reviews/journeys/wave1-recovery-edge.md` rows referenced in `catalog.md` ranks 3, 4, 18, 21, 23, 24, 28, 30.

---

## RE-02 — Stop a runaway agent mid-session before it burns more budget (rank 3)

**Reachability: partial.** No way to view a live session, no way to see "cost-so-far" on a session, no way to abort.

| Severity | Step | What's missing/broken | Repro | Trust impact |
|---|---|---|---|---|
| missing | 1. Spot runaway cost in Rail | Rail has `Cost` section showing aggregate today/week spend only. No per-session cost, no per-team cost, no anomaly indicator, no "session burning" badge. The spec calls for a system-stability strip; Rail has Active Bets / Blockers / Cost only. | `/conversations/review` → Rail right side. See `C-rail-detail.png`. | Founder cannot detect a runaway in flight. |
| missing | 2. Open bet/task | TaskCard in Kanban / WorkBet table has no "live session" affordance. Task rows show status/owner/cost but no link to the active session. | `/work/bet/b1` → tasks table. See `C-RE-02-work-bet.png` and `C-task-clicked.png`. | Even if user suspects a runaway, there is no path to inspect it. |
| missing | 3. Pause agent (mid-session) | Zero Pause/Stop/Kill buttons on bet, task, or team views (`grep` count = 0). The only "Pause" verb in the entire app is (a) the verdict button on a *blocking review* (acts on the review thread, not the session), and (b) Settings → Agents → Pause (a global agent pause, not a session pause). | `/work/bet/b1`, `/work/team`, `/work/portfolio` — no Pause/Stop control on any session/task. | The mission-critical safety affordance is absent. |
| degraded | 3b. Settings → Agents → Pause | Pauses an *agent identity* via a checkbox toggle. No confirmation, no audit, no "this will abort N in-flight sessions and lose $X work-in-progress" preview, no per-skill / per-product scoping, no "stop new sessions only" semantic distinct from "kill running session". | `?settings=open` → Agents tab → Pause. See `C-RE-02-settings-agents.png`. | Founder cannot tell what they are about to break by pausing an agent. |
| missing | 4. Read session notes | No founder-facing surface for `session_notes` or `audit_trail` (per catalog ADV-07 / RE-14). No way to read what the agent was thinking before pausing. | n/a | Founder must "trust and pause" without context. |
| missing | 5. Redirect or kill | No "redirect with new instructions" affordance. No "kill session and roll back artifact" affordance. | n/a | Even after pausing, recovery has no path. |

---

## RE-03 — Roll back a shipped action (deploy / pricing / email blast) (rank 4)

**Reachability: unreachable.** No rollback UI exists anywhere in the app.

| Severity | Step | What's missing/broken | Repro | Trust impact |
|---|---|---|---|---|
| missing | 1. Find original review thread | `Resolved` tab exists in Submenu but cmdk global search returns `HTTP 500` ("Search failed"). | Press ⌘K, type "rollback". See `C-cmdk-rollback.png`. | Cannot locate what shipped without a working search. |
| broken | 1b. Global search | Search endpoint returns `HTTP 500` for any non-empty query. The audit-recovery path (RE-14) is broken too. | ⌘K → type any term → "Search failed HTTP 500". | The only audit path is non-functional. |
| missing | 2. Open action_summary artifact | `ArtifactView` renders `text_diff` artifacts only in fixtures. No `action_summary` artifact-kind renderer with rollback metadata visible. | `/conversations/review` → only TEXT_DIFF artifacts in fixture data. | Action artifacts not distinguishable from text changes — irreversibility flag never shown. |
| missing | 3. Trigger rollback plan | No "Rollback" / "Revert" / "Execute rollback" CTA anywhere. Source-grep for `rollback`, `revert` returns zero hits in components. | grep -ri rollback packages/web/src — no match. | Founders cannot recover from any irreversible action. |
| missing | 4. Confirm | n/a (no rollback to confirm). | | No blast-radius preview, no irreversibility flag. |
| missing | 5. Verify | No "post-rollback verification thread" surface. | | Founder has no way to know the rollback worked. |

---

## RE-05 — Resolve file-lease conflict between two agents racing on same artifact (rank 18)

**Reachability: unreachable.**

| Severity | Step | What's missing/broken | Repro | Trust impact |
|---|---|---|---|---|
| missing | 1. Open conflict thread | No "file-lease conflict" thread variant in `ConversationsReview`. Submenu sections are `Needs review / Chats / Resolved` only — no `Conflicts`. Source-grep for `file.?lease` returns zero hits. | `/conversations/review`. | Conflicts are silently lost; concurrent-agent system unsafe. |
| missing | 2. See both proposed changes | No side-by-side artifact diff renderer for two competing artifacts. | n/a | No basis for picking a winner. |
| missing | 3. Pick winner / merge / split | No "grant lease to X", "merge", or "ask both to coordinate" actions in the verdict toolbar (10 verdicts only: Approve / Request changes / Reject / Snooze / Pause / Approve-with-comments / Comment / Inline comment / Edit / Reply / Escalate). | See `C-review-more-menu.png`. | Founder has no resolution lever; agents will deadlock. |

---

## RE-25 — Resolve "permission denied" / autonomy-too-low blocked thread (rank 21)

**Reachability: partial.** Settings has autonomy levels but the blocked-thread → upgrade-or-deny flow is not in the review surface.

| Severity | Step | What's missing/broken | Repro | Trust impact |
|---|---|---|---|---|
| missing | 1. Agent posts blocked thread "want to do X, level too low" | No "blocked-by-autonomy" thread template / artifact-kind in fixtures or components. Review thread shows generic `text_diff` artifacts only. | `/conversations/review` — fixture has only generic review thread. | The L1–L4 trust model has no on-ramp; founder cannot grow agent autonomy in flight. |
| degraded | 2. Approve once | Review verdicts are `Approve / Request changes / Reject / Snooze / Pause / Approve-with-comments / Comment / Inline comment / Edit / Reply / Escalate` — no "approve once / one-shot" semantic distinct from "approve". | See `C-review-more-menu.png`. | Founder cannot grant a one-time exception without permanently raising autonomy. |
| missing | 3. Raise to L3 for this skill (inline) | No inline "raise autonomy" action in review verdicts. Autonomy level is a *global per-agent* dropdown in Settings → Agents (Manual / Supervised / Autonomous, three levels). | `?settings=open` → Agents. | The L1–L4 ladder is not actually four levels (only 3 in UI), and there is no per-skill scoping — contradicts the L1–L4 trust model. |
| missing | 3b. Per-skill autonomy | Settings → Agents has no Skills column. There is no per-agent-per-skill autonomy dial. | Settings → Agents tab. | Spec promises trust-compounding granularity; UI only has coarse global lever. |
| missing | 4. Reasoning field on deny | No reasoning textarea / mandatory rationale on Reject. Reject is one click → fires immediately on direct click. | Click Reject button. | Agents cannot learn from denials; calibration loop broken. |

---

## RE-06 — Triage a session crash without losing work-in-progress (rank 23)

**Reachability: unreachable.** No crash badge or crashed-session surface exists.

| Severity | Step | What's missing/broken | Repro | Trust impact |
|---|---|---|---|---|
| missing | 1. See "1 session crashed" | Rail has no `system stability` strip per spec. Source-grep for `crash` returns zero hits in components. | `/conversations/review` → Rail. See `C-rail-detail.png`. | Crashes are silent; founder discovers via missing output. |
| missing | 2. Open task with crash | TaskCard has no crash badge. Status enum is `done / healthy / behind / blocked` — no `crashed` variant. | `/work/bet/b1` table. | Cannot find which task crashed. |
| missing | 3. Read last session notes | No founder-facing session-notes surface (also flagged in ADV-07). | n/a | Founder cannot judge whether to resume vs restart. |
| missing | 4. Resume from notes vs restart fresh | No "resume from notes" / "restart fresh" actions. | n/a | All in-progress work effectively lost on crash. |

---

## RE-07 — Handle factory hitting daily/weekly cost cap mid-day (rank 24)

**Reachability: partial.** Cost tile shows spend vs budget; no cap-reached banner, no recovery actions.

| Severity | Step | What's missing/broken | Repro | Trust impact |
|---|---|---|---|---|
| degraded | 1. Notice cap-reached banner | Rail Cost section shows `TODAY $12.40 / $50.00`, `WEEK $84.20 / $350.00`. No banner, no color change at threshold, no "cap reached" badge — even when `spend >= budget`. Static fixture, no anomaly indicator. | `/conversations/review` → Rail Cost. See `C-rail-detail.png`. | Founder may not notice cap is hit; agents silently freeze. |
| missing | 2. Read what stopped | No "list of paused teams" UI per spec. Settings → Agents has a Pause toggle but does not show *why* an agent was paused (cap vs manual). | n/a | Founder cannot tell cap-paused from manually-paused. |
| missing | 3. Raise cap / defer / accept stop | Settings has *no Budgets / Caps tab at all*. `?settings=open` exposes Profile / Products / Agents / Notifications / Appearance — no place to set or raise a cost cap. The Cost values in the Rail are read-only. | `?settings=open` — see tab list. See `C-RE-07-settings-notifications.png`. | The recovery JTBD is impossible: founder cannot raise the cap. |
| missing | 3b. "Raise by $X today only" | n/a | n/a | Single-cycle exception not expressible. |
| missing | 3c. Time-to-reset indicator | Cost tile shows no reset time (when the day/week resets) | `/conversations/review` → Rail Cost. | Founder cannot decide "wait it out" without knowing the wait. |

---

## RE-04 — Recover from approving a skill change now causing repeated bad behavior (rank 28)

**Reachability: unreachable.** No skill management surface exists.

| Severity | Step | What's missing/broken | Repro | Trust impact |
|---|---|---|---|---|
| missing | 1. Notice pattern in review threads | No pattern-detection on resolved threads. cmdk global search broken (HTTP 500). | ⌘K. | Founder cannot find the offending approval. |
| missing | 2. Open skill | No `Skills` tab in Settings. No `/skills` route. Routes: `conversations/review`, `conversations/chat`, `work/portfolio`, `work/team`, `work/bet/:betId`, `knowledge`, `knowledge/:id` — that's it. | router.tsx. | Skills, the highest-blast-radius thing the founder approves, are invisible. |
| missing | 3. Pin previous version | No skill version history UI. Source-grep for `version.?history`, `previous version` returns zero hits in components. | grep. | Once a skill change is approved, it cannot be reverted. |
| missing | 4. Disable until fixed | No per-skill disable. No per-agent-per-skill pause (the spec calls for both). | Settings → Agents has only global agent pause. | The blast-radius asymmetry between approve (one click) and revert (impossible) destroys trust permanently. |

---

## FR-24 — Pause the entire factory (kill switch) (rank 30)

**Reachability: unreachable.** The kill switch the spec calls "ultimate safety affordance, users need to know it exists from day one" does not exist anywhere in the UI.

| Severity | Step | What's missing/broken | Repro | Trust impact |
|---|---|---|---|---|
| missing | Discoverability | IconRail items: Conversations, Work, Knowledge (+ avatar). No "Pause Factory" / kill-switch icon. No keyboard shortcut. Avatar opens Settings, which has no Factory tab. Settings → Products tab has per-product on/off toggles only. | `/` → IconRail. See `C-FR-24-settings-products.png`. | New users cannot find the kill switch — the one affordance whose discoverability matters most. |
| missing | Action surface | No "Pause all agents" / "Stop factory" / "Kill switch" button in Settings or anywhere. Settings → Products toggles are per-product *active* checkboxes (not pause; semantics undefined). | Settings → Products. | Even if a user manually toggles every Product off, it is unclear whether in-flight agent sessions are aborted. |
| missing | Confirmation + blast-radius preview | No confirm dialog, no "this will pause N agents across M products and abort K in-flight sessions costing $X" preview. | n/a | The most-destructive action has no safety chrome. |
| missing | Audit trail | No log of "factory paused at HH:MM by founder" entry. | n/a | Founder cannot prove (to themselves or co-founder) when the kill switch was last hit. |
| missing | Reactivation parity | Even if the toggle existed, there is no reactivation flow with "verify nothing was lost" preview (RE-20 dependency). | n/a | Hitting the kill switch is one-way. |

---

## Cross-cutting observations

These gaps appear across multiple journeys; listing once.

| Pattern | Affected journeys | Detail |
|---|---|---|
| **No undo toast on verdict commit** | RE-01 (rank 12, out of bucket), RE-02, RE-03, RE-04, RE-25 | Direct *click* on Approve/Reject button in `ReviewHeader` calls `commitVerdict` immediately. Only *keyboard* path pre-fills + Enter (J4 contract). Mouse fat-finger has zero recovery. See `C-RE-01-after-approve-click.png`. |
| **No artifact-kind renderers other than text_diff** | RE-03, RE-04, RE-25 | `action_summary`, `skill_change`, `permission_request`, `file_lease` artifact kinds not in fixtures or `ArtifactView`. All thread variants render as text_diff. |
| **Global search (⌘K) returns HTTP 500** | RE-03, RE-04, RE-14 | Search endpoint broken; the only audit-recovery path is dead. See `C-cmdk-rollback.png`. |
| **No founder-facing session inspection (notes/audit_trail)** | RE-02, RE-04, RE-06 | F-2 stores `session_notes` + `audit_trail`; no UI consumes them. RE-14 / ADV-07 dependency. |
| **Settings has no Budgets/Caps tab** | RE-07 | `Profile / Products / Agents / Notifications / Appearance` only. No way to set or raise the factory cost cap that the Rail itself displays. |
| **Settings has no Skills tab** | RE-04 | No skill version history, no per-skill disable, no per-agent-per-skill autonomy. |
| **Autonomy ladder is 3-level not 4-level** | RE-25 | UI: `Manual / Supervised / Autonomous`. Spec: L1–L4. UI label is misleading. |
| **No system-stability / cost-cap / crashed-session strip in Rail** | RE-02, RE-06, RE-07 | Rail sections: `Active Bets / Blockers / Cost` only. The whole "rare-but-critical" surface area has no rail entry. |
| **No `?` shortcut / help mode** | All recovery journeys (compounds confusion) | `?` keypress does nothing. ADV-06. Confirmed via `C-help-shortcut.png`. |

---

## Bucket summary

**Counts (severity totals across the 8 journeys + cross-cutting):**
- broken: 2 (global search ⌘K HTTP 500; Approve/Reject click commits with no undo)
- missing: 39 (the dominant category, as expected for recovery surfaces)
- degraded: 4 (Settings agent Pause; cost tile; one-shot approve; cap banner)

**Journeys completely unreachable (no entry point):**
1. RE-03 — Roll back a shipped action
2. RE-05 — File-lease conflict
3. RE-06 — Session crash triage
4. RE-04 — Skill-change rollback
5. FR-24 — Factory kill switch

That is **5 of 8 journeys** in this bucket with no entry point at all.

**Top 5 most-impactful gaps (trust standpoint):**
1. **FR-24 kill switch missing entirely** — the spec's "ultimate safety affordance, users need to know it exists from day one" is not in IconRail, Settings, or any keyboard shortcut. Without this, every other autonomy concession is unsafe to grant.
2. **No rollback UI for shipped actions (RE-03) and no skill-version revert (RE-04)** — the two highest-blast-radius approvals (action_summary, skill change) are one-way doors. Founders will refuse to approve high-risk, the system stalls.
3. **No mid-session pause / stop / kill button anywhere on bet, task, or team views (RE-02)** — runaway agents burn budget unboundedly. The only "pause" is at the agent-identity level (Settings) and the verdict-thread level (Pause verdict on blocking review) — neither aborts a running session.
4. **Direct mouse click on Approve/Reject commits immediately with no confirm and no undo toast (RE-01 cross-bucket; affects every approval-recovery journey)** — fat-finger destroys the audit trust foundation.
5. **Settings has no Budgets/Caps tab even though the Rail displays cost vs. budget (RE-07)** — when the cap is hit, founders cannot raise it without leaving the app. The recovery JTBD is structurally impossible.

**Most pervasively missing recovery affordances (across journeys):**
- **Rollback / revert** (RE-03, RE-04, RE-18, RE-13) — zero `revert`/`rollback` strings in components.
- **Audit trail / session notes surface** (RE-02, RE-04, RE-06, RE-14, ADV-07) — the underlying data exists but no UI consumes it.
- **Confirmation + blast-radius preview** (RE-02 pause, RE-03 rollback, FR-24 kill) — no destructive action has a "this will affect N agents / $X / Y sessions" preview.
- **Mandatory-rationale text fields** (RE-02 redirect, RE-25 deny, RE-23 override, RE-04 disable) — denials/destructive actions never capture reasoning.
- **Per-skill / per-agent-skill granularity** (RE-04, RE-25) — autonomy is global per agent only.
- **System-stability strip in Rail** (RE-02, RE-06, RE-07, RE-08) — Rail has Bets/Blockers/Cost, missing the spec's stability/crash/cap pane.

**Most underdeveloped recovery surfaces overall:**
1. **Settings panel.** Missing Budgets, Skills, Factory Pause, per-skill autonomy. Of the 8 journeys, 5 require a Settings surface that does not exist.
2. **Rail right column.** Spec calls for a "system stability" strip surfacing crashes / cap-reached / API-degraded; built UI has Bets / Blockers / Cost only.
3. **Bet / Task drilldown.** The actual spot where a runaway / crash happens has no recovery affordances on the row, no session link, no cost-so-far per session.
4. **Artifact renderer.** Only `text_diff` is implemented; `action_summary`, `skill_change`, `file_lease`, `permission_request` are absent — every recovery journey that depends on a special artifact-kind renderer is stranded.

## VERDICT

**STOP.** Recovery surfaces are the safety net for an autonomous-agent product. 5 of 8 Major recovery journeys in this bucket have no entry point at all. The factory kill switch — the single affordance the architecture explicitly calls "users need to know exists from day one" — is missing. Direct-click verdicts commit irreversibly. Global search returns HTTP 500. Implementation cannot proceed past the daily-loop happy path until this bucket is materially populated; otherwise the first runaway agent or bad skill approval will erase user trust permanently.
