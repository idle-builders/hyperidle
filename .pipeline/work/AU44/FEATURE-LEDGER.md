# What the cleanup removed — a ledger for future work

Written at the close of AU43 (the delete pass) and AU44 (merge and simplify), for deciding later what
is worth rebuilding. Every claim below was checked against the running tree, not read off a report.

**This is a decision document, not a record of regret.** Most of what went had never worked. The few
things that did are called out, and three carry a recommendation.

## The shape of it

AU43 deleted (535 files, −34,096 lines). AU44 mostly *moved*: 21 framework packages became 7, and
nearly every symbol that left a package is alive inside the code that used it.

| | before | after |
|---|---|---|
| HTTP routes | 180 | 135 |
| agent tools | 22 | 19 |
| scheduler ticks | 8 | 5 |
| database tables | 44 | 38 |
| framework packages | 21 | 7 |

**34 distinct user- or agent-facing capabilities were removed. 26 of them had never functioned** — a
door nobody called, a table nobody wrote, a channel no install could enable, a badge showing the wrong
flag. Eight worked and are gone.

Two structural changes look like removals and are not: `@hyperidle/design-system` no longer exists but
every component lives at `layers/core-ui/src/ds/`; `team_members` no longer exists but every column
folded into `teams`.

---

## The one to rebuild

### Capture-back before the working directory is destroyed — AO2

`TRACK-AO.md:101` promised: *"The agent's changes to the working tree are captured rather than lost when
the working directory is `rm -rf`'d on destroy."*

`captureBack` (`run-orchestration/src/mounter.ts:239`) now returns `{ success: true, captured: false }`,
and the sandbox is still destroyed (`context.ts:564`, `fs.rmSync(dirPath, { recursive: true, force: true })`).

The audit convicted the `filesystem_captures` table and the git *bundle* as unreachable, and it was right
about both. But the deleted code ran `git add -A` and `git commit` onto an `agent/<sandbox>` branch
**before** bundling, and that commit landed in the repository's own object store — reachable with
`git log agent/…` long after the directory was gone. The reachable half died with the unreachable half.

An agent that does not push its own work now loses it silently. `worktreeRemove` is also no longer
called, so worktree registrations dangle.

**Recommendation: restore the commit-before-teardown for git-backed mounts.** Not the table, not the
bundle — a few lines, no storage, and the branch is its own record.

*Related:* AO5 (fork a session from a captured checkpoint) was never built and is now unbuildable as
specced — its acceptance criteria name `filesystem_captures` rows explicitly.

---

## Worth reconsidering

### The org chart is now decorative — AD1 / AH4

Review routing used to resolve named reviewers through `org_edges`. It now reads the agent's team and
falls back to all humans, which the audit argued is the honest unit of visibility for a flat org. Fine.

But the org-chart page, the `orgEdges` table and its CRUD were deleted **by mistake** during AU43 (a KEEP
row), then restored — while the thing that consumed the edges stayed deleted. Verified: `orgEdges` is
now written and read only by its own CRUD and `SettingsOrgChart.tsx`. **You can draw edges and they
change nothing.** That is the disease this audit set out to cure, newly manufactured.

**Either give the edges a consumer again or retire the page.** Leaving a control that does nothing is
the worst of the three options.

### Failed lifecycle propagation is no longer retried — L20

`propagation_log`, `recordPropagationHop`, `retryFailedPropagations` and the 30-second healing heartbeat
are gone (migration 0059). The `propagation_applied` / `propagation_failed` events survive as the
extension surface, so a stalled hop is announced and then stops. Repair is one manual click.

Low probability — the failure mode is a local Postgres write erroring — but the self-healing was real
and cheap, and nothing internal will now tell you a bet stalled.

### Knowledge signals — AF9 / AF13 / W3

Relevance scoring, the frequency and relevance sort pills, access counts, last-activity and
attention-sorted triage are gone; the knowledge list is recency-only. The attention engine,
`promote_knowledge` and the attention routes **survive** — they carry PLUGIN verdicts and were correctly
left alone.

"The company gets smarter over time" is a stated differentiator and this is the surface a user would see
it on. If it comes back, build on the retained `knowledge_accessed` event rather than the deleted code.

### Team run-config defaults — AV1 / AU26

An agent added to a team *after* creation no longer inherits the harness and model chosen at creation;
it lands on the builtin/sonnet fallback until edited. The initial roster is unaffected.

The audit already priced a better fix than restoring the table: inherit the most common harness among
existing teammates via the surviving `readAgentRunConfigs`. One line, no storage.

### The redetect throttle — I2 collateral

`POST /api/harnesses/redetect` spawns about ten CLI probes with fifteen-second timeouts and had a
dedicated one-call-per-five-seconds limiter. That limiter died with the global rate limiter, which was
convicted fairly — pre-auth, principal-blind, and behind a proxy it collapsed a whole team into one
bucket. The two uses were different in kind: one was a wall built first, this one is a fuse on a known
amplifier in the product's own design.

**Worth restoring as a single route-scoped guard.**

### A static authorization check — AF11

`requireBoundary` deserved to die: in production it only logged, and the source itself said "Lint is the
real gate." But the two `eslint-plugin-authz` rules keyed off that stamp, so **no mechanical check now
exists that a new data route wires authorization.** On a shared multi-team backend that matters.

**Should come back as a static rule** keyed on `authorize*` presence in route handlers — the audit
repriced it upward itself.

---

## A scope breach worth recording

**`POST /api/knowledge/:id/merge`, `/split` and `/flag` were deleted although all three carried PLUGIN
verdicts** — explicitly out of scope for both passes. Verified gone. Merge and split had no UI so no user
notices, but track BA now inherits three routes it was told it would inherit intact. The sibling PLUGIN
rows (`/promote`, `/attention-score`, both retro routes, `POST /api/org/team-routines`) were correctly
kept, which makes these three an inconsistency rather than a policy.

**Track BA must rebuild these rather than relocate them.**

---

## Retained on purpose, pending track BA

Deleted during this pass and restored, because the plugin that would re-provide them does not exist:

- **Bet-retro knowledge upsert** — `routes/bets.ts:697`. Recording a bet outcome still creates its retro item.
- **Facilitator roster seeding** — `bootstrap/factory-state.ts:95`. Fresh installs still get five facilitator agents.

Every PLUGIN verdict in the audit is a deletion with an IOU attached. **That plugin has no registered
work package yet.**

---

## Removed and never worked — no loss

Listed so the ledger is complete and so nobody rebuilds one by accident.

**Notifications (H2, E7, AF8)** — ntfy and console channels, the adapter abstraction, the delivery
lifecycle, flood cap, drain tick, flush/digest/queue doors. Neither channel was ever enabled in any
install and the config had no door that could write it. The in-app inbox, seen/read state and per-type
mutes survive. Outbound email remains unfinished work, not a rejected idea.

**Observability (H3)** — the telemetry pipeline had zero readers, zero operator surface and zero config
writers, and every event it mirrored was already logged by its source.

**Automatic post-task review (E2)** — `task_planning_signals` had zero production writers; the gate
always returned early. Confirmed dead by founder ruling.

**Capability badges (AM2/AM4)** — the sharpest line in the audit: the UI mapped `toolUse` to
`preCompactionTrigger` and `fileEditing` to `subAgents` under "rough proxy" comments. It displayed the
wrong flags indefinitely and nobody noticed. The honest replacement for wrong flags is no flags.

**Rate limiting and body cap (I2)** — pre-auth, keyed on API key or client address rather than the OIDC
principal; behind a proxy it turned one runaway agent into a team-wide outage. The timing-safe credential
compare was spared and relocated.

**Session notes, `read_inbox`, `commit_file`, daily digest, quiet hours, bare runs, the workers admin
door, invite/claim/logout doors, legacy conversations read API, user inbox messaging, manual task
mutation, explicit session-start doors, the lifecycle projection inbox, trigger-resolution history,
the Money library, TOON decode, drizzle-zod schemas, the factory knowledge seed, and six unused design
system components.** Each had no caller, no writer, or no reader. Two deletions closed real leaks: the
legacy conversations list returned every thread on the backend to any authenticated principal, and the
user inbox POST wrote messages the recipient's live UI could never see.

Two of these are worth a second thought rather than a shrug: **`read_inbox`** did function — an agent
could pull cross-thread context on its own initiative, and the replacement is the baked context bundle,
so widen that if agents start asking for context they cannot reach. **Trigger-resolution history** was
never written, but "which trigger caused this session" is a good question with no answer today.

**The lifecycle projection inbox was replaced, not lost** — projection now runs inline in the same
transaction as the terminal write, which is strictly better crash-safety.

---

## Convicted but still present

The audit condemned these and neither pass removed them. All verified alive today: session
effectiveness scoring, the `log_task` tool and `tasks.notes`, the Settings → Agent Behavior tab and the
plugin-configuration engine, `knowledge_access_log` (now unwritten), bet revision log and task audit
appends, `GET /api/threads/coach/`, the `session-reference` embed, and the builtin-routine mechanism
(AU39 is the registered work package that would remove it).

AU43's own accounting found **64 convicted symbols still declared in the package that convicted them**,
and its acceptance criterion was reported met when it was not. AU44's batch 0 closed that list.
