# agent-run-config — destroyer verdict

## Should this service exist?

**KILL THE PACKAGE.** This is not a service — it is two small store files (5 functions, ~200 lines) whose only operational consumer is `run-orchestration` (session admission reads the config live at `layers/agent-orchestration/run-orchestration/src/provisioner.ts:923`). Because it is a separate Service, that one consumer cannot import it and instead carries a whole indirection built solely to route around the boundary: the `SessionLifecycleAgentRunConfigReader` mirror port (`provisioner.ts:484–495`, the comment says outright it exists because "Mechanism C forbids a Service importing another Service") plus its wiring (`layers/agent-orchestration/src/services/run-orchestration-composition.ts:26,388`). The package boundary is the *cause* of that ceremony.

**Fold the surviving store into `run-orchestration`.** Run config's operational moment is session admission, which run-orchestration owns. Not `harness-registry` — the registry maps harnessType→adapter and never consumes per-agent config. Table ownership rows (`agent_run_config`) move to run-orchestration in the governance manifest; reads and writes stay exclusive to exactly one service, no ACL exception. The intake routes (`layers/agent-orchestration/src/routes/agent-orchestration-intake.ts`) stay where they are and import from run-orchestration instead.

Deleted by the fold alone, before any method verdict: the package (`package.json`, barrel `src/index.ts`, tsconfig), the `SessionLifecycleAgentRunConfigReader` port + mirror type, the composition wiring line.

## If written today, from scratch

Two functions inside run-orchestration, owning one table:

1. `readAgentRunConfigs(db, ids) → Map<id, AgentRunConfig>` — the one reader; a single read is a batch of one.
2. `writeAgentRunConfig(db, id, patch)` — the one writer, upsert with PATCH field semantics.

No team-defaults table at all. Team creation already stamps the initial roster directly from the request's `primaryHarness` (`teams-routes.ts:310–316`) — the table is a memo of one form field, written once at creation (`teams-routes.ts:282`) and replayed in exactly one place (`teams-routes.ts:543`, stamping a late-added agent). A 3-column table, 2 functions, 1 type, 1 const, 2 intake routes, and 2 seam methods to replay one dropdown is not a feature, it is furniture.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 2 |
| MERGE | 1 |
| SIMPLIFY | 0 |
| KEEP | 2 |

Surface: 5 methods → 2 methods (60% cut). Package: 1 → 0 (folded into run-orchestration). Tables: 2 → 1.

## Feature-level kills

**Team run-config defaults (whole capability — table `team_run_config_defaults`, both functions, type, const).** The feature: an agent added to a team *after* creation inherits the harness/model picked in the create-team form. What breaks: that late-added agent lands on the builtin/sonnet fallback (`org/src/scaffold-agents.ts:194–202`) instead of the team's chosen harness, until edited in Settings → Agents. Why acceptable: the initial roster is unaffected (stamped directly from the request, not the table); the repair is one Settings edit; and the current design already ships broken-by-design here — the table write is deliberately non-transactional with team creation (`teams-routes.ts:256–262`, founder-ruled RELINQUISHED), so a failed write produces exactly the fallback behavior this kill makes universal, and the sanctioned repair is already "the team settings edit". If the hole ever hurts, the one-line fix is to inherit the most common harness among existing teammates via the surviving `readAgentRunConfigs` — better product than replaying a stale creation-time choice, and zero new storage. Collateral kills: `GET/PATCH /api/agent-orchestration/team-run-config-defaults/:teamId` intake routes, seam methods `runConfig.readTeamDefaults`/`writeTeamDefaults` + their api-contract mirrors (`framework/api-contract/src/agent-orchestration-port.ts:288`), the post-commit write at `teams-routes.ts:282–286`, the read at `teams-routes.ts:543`, `team-harness-default-propagation.integration.test.ts`, one drop migration.

**Single-read seam (with the MERGE below).** `GET /api/agent-orchestration/run-config/:agentId` and seam method `runConfig.read` die; the four core-api callers (agent profile, PATCH agents, assistant GET/PATCH) and the provisioner use batch-of-one. Nothing user-visible breaks.

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `readAgentRunConfig` | UI:GET /api/agents/:id/profile (+PATCH /api/agents/:id, GET+PATCH /api/users/:userId/assistant); BOOTSTRAP DI → session admission `provisioner.ts:923` | MERGE | Batch-of-one of `readAgentRunConfigs` — two readers are one idea; callers take `.get(id)`. |
| 2 | `readAgentRunConfigs` | UI:GET /api/agents/ (+GET /api/teams/:teamId; config-projection port `boot.ts:360` → `plugin-configuration.ts:674`) | KEEP | The one reader. Core value: sessions launch on the agent's configured harness/model/prompt — that IS agent execution; door named: session admission after merge, plus GET /api/agents/. |
| 3 | `writeAgentRunConfig` | UI:PATCH /api/agents/:id (+POST /api/agents/, users/teams/assistant creation); AGENT:create_team, AGENT:add_agent | KEEP | The one writer. Core value: choosing which harness/model an agent runs is how a founder shapes the team; PATCH field semantics require the patch-key upsert as-is. |
| 4 | `readTeamRunConfigDefaults` | UI:POST /api/teams/:teamId/agents (sole production reader, `teams-routes.ts:543`) | DELETE | One-reader memo table replaying a create-form dropdown; late-added agents take the existing builtin fallback — see feature kill. |
| 5 | `writeTeamRunConfigDefaults` | UI:POST /api/teams/ (`teams-routes.ts:282`, deliberately non-atomic) | DELETE | Writes a memo nobody needs once #4 dies; creation-time stamping already bypasses the table entirely. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `AgentRunConfig` (interface) | KEEP | The value shape the seam contract mirrors and the session reads; survives the fold into run-orchestration. |
| `AgentRunConfigPatch` (type) | KEEP | Real semantic type — PATCH "present key is written, absent key untouched"; not a Deps/Ports mirror. |
| `TeamRunConfigDefaults` (interface) | DELETE | Dies with the feature kill; api-contract mirror at `agent-orchestration-port.ts:288` dies too. |
| `DEFAULT_AGENT_RUN_CONFIG` (const) | SIMPLIFY | Unexport — module-private map-fill default; sole external use is a type-only import (`agent-orchestration-intake.ts:22,344`) replaceable with `AgentRunConfig`. |
| `EMPTY_TEAM_RUN_CONFIG_DEFAULTS` (const) | DELETE | Zero external production consumers (confirmed `rg -a`); dies with the feature kill. |
| `SessionLifecycleAgentRunConfigReader` (port, in run-orchestration — not in input but killed by this verdict) | DELETE | Exists only because Service→Service import is forbidden; the fold makes it a direct import. |

## Holes this leaves

1. **Late-added agents don't inherit the team's harness choice.** They land on builtin/sonnet fallback until edited in Settings — the same state today's design already produces when the non-atomic defaults write fails, with the same sanctioned repair. Priced fix if it hurts: inherit the most common teammate harness via `readAgentRunConfigs` (one line, no storage).
2. **Single-read callers get batch-of-one ergonomics** — `(await readAgentRunConfigs(db, [id])).get(id)` plus a non-null assert or `?? default` at four core-api sites and the provisioner. Cosmetic.
3. **Governance churn, not a hole:** table-ownership manifest rows for `agent_run_config` move to run-orchestration; `team_run_config_defaults` needs a drop migration; api-contract seam surface shrinks by three methods (`runConfig.read`, `readTeamDefaults`, `writeTeamDefaults`) and one intake route file loses three routes.
4. **Tests that die with their subjects:** `team-harness-default-propagation.integration.test.ts`, the team-defaults halves of `agent-run-config-store.integration.test.ts`, and any intake-route tests for the three deleted routes.
