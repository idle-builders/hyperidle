# AU26 pass A — group 3 verdicts

Services: `routine`, `settings`, `users`, `work`. Method: requirements.md §2/§3. All sites re-traced with `rg -a` on branch `pipeline/AU26` (base `75d85687`).

---

## routine — STAYS (not charter-fixed; challenged properly)

**Domain owned:** the company's own recurring-work schedule — `routines` + `routineRuns` (`scripts/table-ownership-guard.ts:142-143`).

**One real core-side use:** `runPortfolioRetro` writes a core `items` row and a core `threads` row inside one transaction — `packages/core-api/routine/src/routine-scheduler.ts:355` (`ports.work.createItem`) and `:341` (`ports.conversation.insertThread`), then emits `item_created` at `:369`. No agent, no session, no LLM anywhere in that path.

**Verdict: stays.** Trigger 3 did not fire; the two things that looked like agent machinery are not.

Why it survives the challenge (the honest check, since the prior was weak here):

- Of the four builtin routines dispatched at `routine-scheduler.ts:466-485`, **all four are pure core maintenance**: `runPostBetRetro` (`:251` — writes `threads` + `items`), `runPortfolioRetro` (`:320`), `runKnowledgePromotion` (`:385` — `ports.knowledge.runAutoPromotionSweep`), `runKnowledgeDecay` (`:421` — `ports.knowledge.runStaleSweep`). Zero of them spawn an agent run.
- The one event-driven reaction, `bet_state_changed → post-bet-retro` (`routine-scheduler.ts:511-538`), is core reacting to its own bet lifecycle.
- `fireGenericRoutine` (`:566`) IS the agent-run emit path — but it is the **same emit-side shape every other core domain already uses** (`work/src/task-run-resolver.ts`, `conversation/src/assistant-turn-resolver.ts`, `review/src/proposed-call-workflow.ts`): resolve + bake + `enqueueWorkIntent` in one transaction. That is core deciding *that* work should happen; orchestration decides *how*. Not a misplacement, not a pass-B item.
- `selectRoutineDelegate` (`agent-delegation.ts:29`) picks *which teammate* takes the routine, over `userSkills` + a capacity check, both injected. Choosing an assignee is a core scheduling decision, not run machinery.

---

## settings — STAYS

**Domain owned:** factory-wide configuration — `serverConfig`, `plugins`, `pluginConfigurationDefaults`, `configurationOverrides` (`scripts/table-ownership-guard.ts:110-113`).

**One real core-side use:** `isSilenced` reads `serverConfig.notifications.silence` at `packages/core-api/notifications/src/silence-policy.ts:62` and returns `true` at `:66`/`:80`, **suppressing a notification core would otherwise deliver**. A core gate on core-owned config, no agent in the path. (Second, independent: `install.ts:900`/`:894` read+write `notifications.mutedTypes` on the same gate.)

**Verdict: stays.** Trigger 3 fires once — see below.

### Part-level: `plugin-configuration.ts:727`, the second connections consumer — CLASSIFIED: display-only projection, not an operational use

`backfillConfigurationDefaults` (`packages/core-api/settings/src/plugin-configuration.ts:638`) is a **boot-time snapshot projector**. It copies live rows — agents (`:645`), routines (`:673`), `userSkills` (`:710`), MCP connections (`:727`), the builtin tool catalog (`:746`), harness descriptors (`:663`) — into `pluginConfigurationDefaults` as opaque JSON, so the Settings configuration browser can list everything under one uniform shape.

The `serviceConnections` call is `deps.serviceConnections.listByAuthSource(db, "mcp")` at `:727`, port declared at `:65`, wired from `server-factory.ts`. It reads six fields (`id`, `userId`, `service`, `authSource`, `serverUrl`, `health`, `lastValidatedAt` — `:733-741`) and never the encrypted token.

**The projected rows are consumed by exactly one reader, and it renders:** `listConfiguration` (`plugin-configuration.ts:565`) → `packages/core-api/src/routes/agent-behavior-config-impl.ts:80` and `:100` → HTTP response. Nothing writes, gates, enqueues or emits off a `kind:"mcp_server"` entry — repo-wide, the only other `mcp_server` hits are the enum (`packages/shared/src/configuration.ts:7`), the CHECK constraint (`packages/db/drizzle/0044_AU2_plugin_configuration.sql:21`), and the unrelated TOML `[mcp_servers.*]` writer in `agent-orchestration/run-orchestration/src/connection-provisioning.ts:346`.

**Classification:** under §2 this is *rendering*, not a use. `settings` has **no operational dependence on connections data** — it needs a list of MCP servers to display, not the connections table. So this does not block Item A's "exactly one Service importer"; it is a port to re-point (or a projection kind to drop), and architecture should decide which. It is emphatically not a reason to keep `serviceConnections` core-side.

Note for architecture, same file, same shape: `:645-661` projects the **`users` agent-config columns** (`systemPrompt`, `harnessType`, `modelTierPreference`, `modelId`, `modelProvider`, `maxConcurrentSessions`) into the same display projection. Whatever Item C decides, this projector is a reader that must be re-pointed with it.

---

## users — STAYS (whole service); contains a real part-level finding

**Domain owned:** human + agent identity — `users`, `loginSessions`, `inviteCodes` (`scripts/table-ownership-guard.ts:100-102`), plus `hintProgress`.

**One real core-side use:** `validateBearerToken` (`packages/core-api/users/src/login-session.ts:82`) is called at `packages/core-api/src/middleware/auth.ts:112` and **gates every authenticated core request**. Core also creates the human founder row itself (`routes/users.ts:145-149`, `kind:"human"`, `status:"active"`) and claims invites into it (`invite-code.ts:112`).

**Verdict: stays, and contains something that moves** (trigger 3).

### Per-column verdicts (Item C)

Line numbers are `packages/db/src/schema.ts` at HEAD. "Core use" means §2's bar: core writes a core table off it, gates a core operation, emits, or enqueues — **not** renders it, **not** validates it on the way into its own config write, **not** bakes it onto a request for an agent.

| Col | Line | Who writes it | Who actually consumes it | Core use? | Verdict |
|---|---|---|---|---|---|
| `kind` | 50 | core: `routes/users.ts:145`, `invite-code.ts:112`, `routes/agents.ts:317` | core, everywhere: auth resolves the human at `middleware/auth.ts:167`; the conversation pin reaction gates on `sender.kind !== "ai"` at `conversation/src/assistant-thread-pin-reaction.ts:45`; recipient lists split on it at `routes/recipients.ts:48-50`; `requireRunnableAgent` gates emit at `users/src/runnable-agent.ts:36` | **yes** | **STAYS** — this is the human/agent discriminator; it *is* identity |
| `status` | 61 | core: `routes/users.ts:149`, `routes/agents.ts` | core: policy picks an active reviewer via `findUser(…, status:"active")` at `services/policy-bindings.ts:73`; `requireRunnableAgent:36` gates emit | **yes** | **STAYS** |
| `maxConcurrentSessions` | 62 | core config routes only (`routes/agents.ts`, `AgentEditor`) | baked at `shared/src/agent-work-intent-recorder.ts:232`; the only consumer is orchestration's admission check — `run-orchestration/src/provisioner.ts:890` throws `ConcurrencyLimitError` at `:892`; `concurrency.ts:57` | **no** | **MOVES** — pure run-admission bound |
| `harnessType` | 76 | core config routes only | baked at `agent-work-intent-recorder.ts:230`; consumed at `provisioner.ts:857` (adapter selection) / `:866` `NoEligibleHarnessError`. Core-side hits are render (`routes/agent-profile.ts:299,311,341`, `teams-routes.ts:274,771`) or config validation (`routes/agents.ts:133`) | **no** | **MOVES** |
| `modelTierPreference` | 78 | core config routes only | baked at `agent-work-intent-recorder.ts:229`; consumed at `provisioner.ts:842`. Core-side: render only | **no** | **MOVES** (the sixth column `plan.md` omitted — confirmed in scope) |
| `modelId` | 84 | core config routes only | baked separately at `conversation/src/assistant-turn-resolver.ts:200`; consumed by orchestration at `dispatch/src/service.ts:217`, `:253` | **no** | **MOVES** |
| `modelProvider` | 92 | core config routes only | baked at `agent-work-intent-recorder.ts:231` and `assistant-turn-resolver.ts:201`; consumed at `provisioner.ts:858-859`, `dispatch/src/service.ts:217` | **no** | **MOVES** |
| `systemPrompt` | 74 | core config routes: `routes/agents.ts:87`, `routes/assistant.ts:454` | baked at `agent-work-intent-recorder.ts:228`; **sole consumer** is `provisioner.ts:839` (`agentConfig.systemPrompt ?? ""` → the harness prompt). Core-side: rendered at `routes/agent-profile.ts:340`, and `routes/org.ts:121` deliberately *excludes* it from the public payload | **no** | **MOVES** — explicit in-call: same class as the five above, not adjacent-and-different. Largest column; needs its own migration cost line |
| `systemPromptPath` | 53 | seed fixtures only: `db/src/factory-bootstrap.ts:110,140`, `db/src/demo-fixture.ts:108` | **nobody.** Zero production readers repo-wide. The `systemPromptPath` on `harness-adapter.ts:83` / `provisioner.ts:1404` is a different field on the adapter spec, hardcoded `""` | n/a | **OUT of the relocation — DEAD.** Already marked deprecated at `schema.ts:53`. Disposition is `DROP COLUMN`, not a move. Do not carry it across |
| `skills` | 60 | seed only: `factory-bootstrap.ts:111,141` | **nobody.** Zero readers. The live skills feature is the separate `userSkills` table (`routes/users.ts:228`) | n/a | **OUT of the relocation — DEAD.** Same disposition as `systemPromptPath` |
| `agentCategory` | 98 | core: `routes/agents.ts:310,320` | core org taxonomy — `team \| strategy \| individual`, rendered in team composition (`routes/teams-routes.ts:705`, `routes/org.ts:73`) | render-only, but it is org structure, not run config | **STAYS** — flagged explicitly so it isn't swept up by shape-matching |

### Is a clean cut possible?

**Yes, structurally — and the cut line already exists in shipped code.**

AU21 already forced every one of the six moving columns through a single whitelist: core loads the row once via `requireRunnableAgent` (`users/src/runnable-agent.ts:34`), then `bakeAgentRunnableConfig` (`shared/src/agent-work-intent-recorder.ts:222`) picks exactly `{kind, status, role, teamId, systemPrompt, modelTierPreference, harnessType, modelProvider, maxConcurrentSessions}` onto the emitted request. Four core emit resolvers call it — `work/src/task-run-resolver.ts:154`... `session-start-resolver.ts:154`, `conversation/src/assistant-turn-resolver.ts:202`, `review/src/proposed-call-workflow.ts:408`. `modelId`/`modelProvider` ride a parallel bake (`assistant-turn-resolver.ts:200-201` → `dispatch/src/service.ts:217`).

So the relocation is **exactly**: the six run-config fields leave the bake (orchestration reads them from its own table at drain — an in-layer read, not a boundary crossing), while `kind`/`status`/`role`/`teamId` stay on the bake because they are identity and core genuinely uses them. **`users` survives intact as the single human+agent identity record** — the row keeps `id`, `kind`, `name`, `role`, `teamId`, `status`, `email`, `avatarUrl`, `agentCategory`, `createdAt`. Nothing that makes a `users` row an identity leaves.

**What it costs, stated rather than waved (§4 Item C's requirement):**

1. **A schema change, therefore a migration + backfill.** A new orchestration-owned table keyed by `users.id` (six columns), plus `DROP COLUMN` × 6 on `users`, plus a backfill of every existing agent row. `plan.md`'s "no data migration" constraint must be read as *this must not become one silently* — here it is explicit, costed, and unavoidable. Two of the ten columns examined (`skills`, `systemPromptPath`) are dead and should be dropped in the same migration rather than carried.
2. **Every reader re-pointed.** Config write path: `routes/agents.ts:87-91,320-341,406,474-515` (POST/PATCH agent), `routes/assistant.ts:392-476` (assistant PATCH). Read/render path: `routes/agent-profile.ts:299-341`, `routes/teams-routes.ts:274,361-362,498-509,771-778`, `routes/agents.ts:250-255`. Bake path: the four resolvers above + `bakeAgentRunnableConfig`'s shape. Seed path: `db/src/factory-bootstrap.ts`, `org/src/scaffold-agents.ts:183`, `eval/src/seeding.ts`, `db/src/demo-fixture.ts`. Projection path: `settings/src/plugin-configuration.ts:645-661`.
3. **The config UI needs a legal host.** Writing agent run-config becomes an orchestration-owned mutation, so `Settings → Agents` and the assistant PATCH must dial orchestration-api. That makes Item C **ordered after** the §5 app skeleton, same as connections.
4. **Validation follows the data.** `validateAgentConfig` (`routes/agents.ts:118`) already validates against the `AdapterPool` (agent-execution) and `MODEL_CATALOG`; it has no core dependency and moves with the columns.
5. **`agentCategory` and the `users`-`teamMembers` FK are untouched.**

Per AC #8's human gate, each of these six is a relocate verdict and needs founder confirmation before its build increment.

---

## work — STAYS; contains two part-level `sessions` findings

**Domain owned:** bets / tasks / items / artifacts + the task dispatch-attempt ledger (`scripts/table-ownership-guard.ts:71-80`, `:142`).

**One real core-side use:** `cascadeBetKill` — the human `/kill` route (`routes/bets.ts:669`) → `bet-kill-cascade.ts:88` transitions each non-terminal task to `killed` and writes a `propagation_log` row at `:118`. Core writing core tables for core's own reason.

**Verdict: stays, and contains something that moves** (trigger 3). Two `sessions` touches, and they are **not the same finding** — chasing §9 item 4's lead for `work`:

### Finding W1 — `work-service.ts:384`, the `latestSessionOutcome` subquery — a decoration, not a use

`list(db, "task", { include: "latestSessionOutcome" })` runs a correlated subquery over `sessions` (`work-service.ts:384`, import at `:50`). Its **only** non-test caller is `routes/bets.ts:378`, which puts the value straight into the bet-detail response (`schemas/bet.schema.ts:43`), where `web/src/shell/TaskSheet.tsx:422` and `web/src/pages/WorkBet.tsx:105` render it as a status chip. Nothing in core branches on it.

Under §2 that is **rendering, and rendering is not a use** — this is the exact "a core route returns it" trap. `work` reaches into the agent-run record purely to decorate a response. **Part-level verdict: this read does not belong in `work`.** The file's own `@lore` (`work-service.ts:36`) already concedes it as a grandfathered "foreign-import ceiling" exception — and the standing founder ruling is zero exceptions.

### Finding W2 — `bet-kill-cascade.ts:58-70`, the cascade's session stop — a real core need, an illegal mechanism

`cascadeBetKill` selects active sessions for each task (`:58-61`) and writes `state:"stopped", outcome:"stopped", endedAt` (`:66-70`), CAS-guarded on `state='active'`, then logs the hop (`:76`).

The **need is genuinely core's**: a human kills a bet, and runs under it must stop. But the mechanism is a raw cross-domain write into the agent-run record from a `core-api` Service. `run-orchestration` is the de-facto owner of that table's lifecycle — it inserts (`runtime.ts:67`, `provisioner.ts:965`) and transitions (`transition-run.ts:371`, `start-runtime.ts:37`, `runtime-reapers.ts:193`). `work` is writing terminal state behind orchestration's back, and the `@lore` at `bet-kill-cascade.ts:24` documents that it deliberately suppresses `session_ended` to keep that write invisible.

**Part-level verdict: the need stays in `work`, the direct write does not.** How it is re-expressed is architecture's call (this is a stop *request* to orchestration, and AU21's rule that orchestration is request-driven applies), and it interacts with Job 2's session-lifecycle work — flag the ordering.

### Root cause behind both, for the architecture pass

`sessions` has **no owner at all**: `scripts/table-ownership-guard.ts:349-353` puts it in `UNOWNED_SHARED_TABLES`, which exempts it from **both** the ACL and the completeness check. That is why `policy`, `review`, `work` and `realtime` can all import it with zero guard noise. The `@lore` at `:300` says outright that a `TABLE_OWNER` row was withheld because no real owner had migrated yet, and to revisit per-table. Post-AU21 the owner is `agent-orchestration/run-orchestration`. Assigning it is the mechanical guard that makes W1/W2 (and the `policy`/`review`/`realtime` siblings) stay fixed.

### Checked and cleared (so nobody re-derives it)

`taskDispatchAttempts` (`task-state-machine.ts:120`, `work-service.ts:66-113`) is **not** an agent-run record — it is the task's own attempt ledger, written by `work`'s state machine when a task becomes dispatchable and finalized by a core-api event subscriber (AU21 H1). Stays in `work`. The emit-side resolvers (`task-run-resolver.ts`, `session-start-resolver.ts`) bake and enqueue; they read no agent table and are the sanctioned core-side emit shape.

---

## Summary

| Service | Domain | Evidence (core-side use) | Verdict |
|---|---|---|---|
| `routine` | recurring core work — `routines`/`routineRuns` | `routine-scheduler.ts:355` writes a core `items` row (portfolio retro), no agent involved | **stays** |
| `settings` | factory config — `serverConfig` + plugin config | `notifications/src/silence-policy.ts:62,66` gates notification delivery on `serverConfig` | **stays**, contains a display-only connections projection (`plugin-configuration.ts:727`) |
| `users` | human + agent identity | `login-session.ts:82` → `middleware/auth.ts:112` gates every authenticated request | **stays**, 6 run-config columns move |
| `work` | bets/tasks/items/artifacts | `bet-kill-cascade.ts:88,118` — human bet-kill transitions tasks + writes `propagation_log` | **stays**, 2 `sessions` findings |
