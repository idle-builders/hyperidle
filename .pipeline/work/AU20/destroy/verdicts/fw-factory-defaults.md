# factory-defaults — destroyer verdict (framework)

## Where does this package go?

**Verdict: DISSOLVE → `layers/core-api`** (scaffold resolution into the org/teams service beside `persistScaffoldedAgents`; the roster seed inlined into `bootstrap/factory-state.ts`; the template reader beside its route). Package deleted.

The package is three unrelated things stapled together by the word "defaults":

1. **Scaffold-spec resolution** (`resolveAgentScaffoldSpecs`) — this is agent-identity logic. The org destroyer already ruled `persistScaffoldedAgents` the single writer of agent identity and keeps it in the teams service. The resolver is that writer's other half and belongs next to it. The only reason it sits in framework is that `tool-handlers` (agent-orchestration) calls it locally before pushing specs through the `persistScaffoldedAgents` seam — whose `specs` param is already opaque `Record<string, unknown>[]` (`tool-definitions.ts:1031-1049`). Widen the seam to accept the scaffold *request* and resolve inside core-api, and orchestration stops doing core-api's job (orchestration is a blind executor — it should hand over the request, not compose identity specs). After that, agent-orchestration imports **nothing** from this package.
2. **The factory roster seed** (`defaultFactoryRoster` + 4 types + `COMMUNITY_DISPLAY_NAMES`) — consumed by exactly one production file, `layers/core-api/src/bootstrap/factory-state.ts`, which **hardcodes** `const roster = defaultFactoryRoster`. The celebrated AK6 "registry-free roster injection seam" has never injected anything: one value, zero alternative rosters, the consumer reads the const directly. An abstraction with one value that is never passed is a literal wearing a seam costume. Inline what survives of the literal into `factory-state.ts`.
3. **System-prompt template reading** (`readSystemPromptTemplateForRole` + map) — consumed by core-api (`GET /api/agents/templates/:role` + scaffold), by agent-orchestration's bootstrap backfill (dies below), and by `tools/setup/demo-fixture.ts` (tooling importing a layer face is already the sanctioned pattern — `factory-state.ts`'s own header says so). Lands in core-api.

`tools/setup` and the desktop app reach everything through the core-api faces they already call (`applyFactoryCoreState`, `runFactoryBootstrap`). No consumer needs a framework package to exist.

## Consumers (measured, not assumed)

`rg -a -l "@hyperidle/factory-defaults" layers framework applications tools` — production files only:

| Consumer | What it imports | Could it own this? |
|---|---|---|
| `layers/core-api/src/bootstrap/factory-state.ts` | `COMMUNITY_DISPLAY_NAMES`, `defaultFactoryRoster`, `FactoryAgentRef` | Yes — sole consumer of all three; inline. |
| `layers/core-api/src/routes/users.ts` | `resolveAgentScaffoldSpecs`, `AgentScaffoldSpec` | Yes — core-api. |
| `layers/core-api/src/routes/teams-routes.ts` | `resolveAgentScaffoldSpecs` | Yes — core-api. |
| `layers/core-api/src/routes/assistant.ts` | `resolveAgentScaffoldSpecs` | Yes — core-api. |
| `layers/core-api/src/routes/agents.ts` | `readSystemPromptTemplateForRole` | Yes — core-api. |
| `layers/agent-orchestration/tool-handlers/src/tool-definitions.ts` | `resolveAgentScaffoldSpecs` | Doesn't need it — widen the `persistScaffoldedAgents` seam to take the request; resolution is core-api's job. |
| `layers/agent-orchestration/src/factory-run-config.ts` | `FactoryAgentRef`, `readSystemPromptTemplateForRole`, `SYSTEM_PROMPT_TEMPLATE_FILES` | Doesn't need it — the template backfill loop only ever matched facilitators (the assistant deliberately has no template); dies with the facilitator kill. `FactoryAgentRef` inlines as `{id, role}`. |
| `tools/setup/src/demo-fixture.ts` | `readSystemPromptTemplateForRole` | Imports the core-api face — same sanctioned tooling→layer-face reach `runFactoryBootstrap` already uses. |

Note `layers/core-api/org/src/scaffold-agents.ts` already **redeclares `AgentScaffoldSpec` locally** (its own header admits it: "structurally identical") — the package's export is a duplicate of a type the owning service already carries.

## If written today, from scratch

Three symbols, zero packages:

- `resolveAgentScaffoldSpecs` + `AgentScaffoldSpec` — inside the agent-identity (org/teams) service, behind the `persistScaffoldedAgents` seam.
- `readSystemPromptTemplateForRole` — in core-api beside its route; map module-internal.
- A six-line assistant seed literal inside `factory-state.ts`.

No roster spec types, no injection seam, no facilitators, no display-name table, no shared `{id, role}` interface.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 7 |
| MERGE | 2 |
| SIMPLIFY | 1 |
| KEEP | 1 |

Surface: 11 exports → 0 exports (package deleted; 3 symbols survive, relocated into core-api).

## Feature-level kills

**1. The 5-facilitator factory pre-seed — whole feature, DELETE.**
Every fresh install seeds five "facilitator" agents, one per "community of practice" (build/product/growth/ops/facilitation). Nobody asked for them and the concept has no product surface: `rg -i "community|communities"` across `applications/` and `layers/core-ui/` finds **zero** UI references (one unrelated comment). Their only production job is owning the two builtin knowledge sweeps (`routine-scheduler.ts:151,162`, `ownerRole: "facilitator"`) — the builtin-routine subsystem the **routine destroyer already convicted** (second execution path bypassing the agent-run architecture; per-team seeding of global sweeps firing N duplicate runs). The kills compound: their DELETE removes the facilitators' only job; this DELETE removes the orphaned owners. What breaks: `tools/eval` scenarios and the demo world hardcode `seed-agent-pf-facilitation` (`tools/eval/src/seeding.ts:520`, `tools/eval/src/scenarios/builtin-routines.ts:72`, `tools/setup/src/demo-world/ids.ts:22`) — tooling follows the product, repoint or seed locally. The `facilitator` *role* stays in `AGENT_ROLE_CATALOG` and its `facilitator.md` template stays servable — a user who wants a facilitator creates one; the factory stops force-installing five.

**2. The AK6 roster-injection seam — DELETE.**
`FactoryRosterSpec` / `FactoryFacilitatorSpec` / `FactorySystemAssistantSpec` have zero external importers (the one `FactoryRosterSpec` hit outside the package is a doc comment in `scaffold-agents.ts:24`). The "seam" was never injected — `factory-state.ts` hardcodes the default. Types that exist only to type one literal die with the literal's inlining.

**3. The run-config template backfill — DELETE (collateral).**
`factory-run-config.ts:49-56` iterates `SYSTEM_PROMPT_TEMPLATE_FILES` to backfill prompts onto roster agents. With facilitators gone the roster is one assistant, which is deliberately **not** in the map (the lore in `system-prompt-templates.ts:19-23` preserves that 404), so the loop writes nothing, ever. `applyFactoryRunConfigDefaults` shrinks to one AH2-defaults write for the assistant.

**4. Orchestration-side scaffold resolution — MERGE behind the seam.**
`create_team` / `add_agent` tool handlers resolve specs locally, spread-widen them to dodge the opaque seam type, then push them through `persistScaffoldedAgents` (`tool-definitions.ts:1036,1131`). Seam takes the request; core-api resolves. Deletes the widening dance and the AU21 F1 apology comments with it.

**Survives on evidence — the assistant seed.** `seed-agent-cos` is load-bearing: `coach.ts:43` hardcodes `COC_AGENT_ID = "seed-agent-cos"`, `knowledge/src/factory-seed.ts:31` stamps it as `updatedBy`, `builtin:portfolio-retro` runs as `ownerRole: "assistant"`. One seeded system agent is the honest factory state.

**Sibling cross-checks (as tasked):**
- **settings destroyer** (drop `plugins` + `plugin_configuration_defaults` tables): factory-defaults feeds neither — `rg -a -i "plugin" framework/factory-defaults/src/` = zero hits. No coupling; their kill and this one are independent.
- **routine destroyer** (per-team seeding of duplicate global sweeps): this package seeds no routines, but it seeds the two facilitator **owners** of the convicted sweeps. See feature kill 1 — the verdicts compound, in the same direction.

## Full export audit

| # | Export | Kind | Reach | Verdict | Reason |
|---|---|---|---|---|---|
| 1 | `resolveAgentScaffoldSpecs` | function | UI:POST /api/teams, UI:POST /api/users, UI:GET+PATCH /api/users/:userId/assistant, AGENT:create_team, AGENT:add_agent | MERGE | Agent-identity logic; folds into the org/teams service beside `persistScaffoldedAgents`, resolution moves behind the seam so orchestration hands over requests, not specs. |
| 2 | `readSystemPromptTemplateForRole` | function | UI:GET /api/agents/templates/:role (AgentEditor, AgentAddDialog, AgentDetailPane) + scaffold paths + demo fixture | KEEP | Core value: agent personas from `docs/system-prompts/` behind a live UI door; relocates to core-api, traversal-closed allowlist unchanged. |
| 3 | `AgentScaffoldRequest` | interface | INTERNAL — zero external importers; callers pass literals | DELETE | An exported request shape nobody imports; a 7-field union where every call null-pads 4 fields — fold into per-trigger parameters when the resolver moves. |
| 4 | `AgentScaffoldSpec` | interface | users.ts, tool-definitions.ts, org (redeclared locally) | MERGE | The owning service already carries a structurally identical local copy (`org/src/scaffold-agents.ts:75`); make that the single declaration, delete this duplicate. |
| 5 | `FactoryFacilitatorSpec` | interface | INTERNAL — types the literal only | DELETE | Dies with the facilitator pre-seed; zero external importers even today. |
| 6 | `FactorySystemAssistantSpec` | interface | INTERNAL — types the literal only | DELETE | Two fields typing one inlined literal; zero external importers. |
| 7 | `FactoryRosterSpec` | interface | INTERNAL — only non-package mention is a doc comment | DELETE | The AK6 injection seam that never injects; `factory-state.ts` hardcodes the value it pretends to receive. |
| 8 | `FactoryAgentRef` | interface | BOOTSTRAP (factory-state.ts → factory-run-config.ts handoff) | DELETE | A `{id, role}` pair does not justify a package hop — inline the structural type in each face; duplicating two fields beats importing them. |
| 9 | `COMMUNITY_DISPLAY_NAMES` | const | BOOTSTRAP (factory-state.ts only) | DELETE | Display names for a communities-of-practice concept with zero UI surface; dies with the facilitators. |
| 10 | `defaultFactoryRoster` | const | BOOTSTRAP (factory-state.ts only, hardcoded) | SIMPLIFY | Shrinks from 5 facilitators + assistant to the assistant singleton (`seed-agent-cos` is load-bearing: coach.ts:43, knowledge factory-seed:31) and inlines into `factory-state.ts`. |
| 11 | `SYSTEM_PROMPT_TEMPLATE_FILES` | const | factory-run-config.ts backfill loop (dead with facilitators) + tests | DELETE | Export dies: sole surviving caller is `readSystemPromptTemplateForRole` in-module; the backfill loop it feeds can never match the assistant-only roster by design. |

## Holes this leaves

- **Fresh installs seed 1 agent, not 6.** No facilitators in the agent list on first boot. Anyone who wanted one creates one from the role catalog — template intact.
- **If the founder rejects the routine destroyer's builtin-routine kill**, the two knowledge sweeps lose their owners. Repair is one line each: `ownerRole: "assistant"` in `routine-scheduler.ts:151,162`. Still no reason to seed five agents.
- **Seam signature change.** `persistScaffoldedAgents` (Mechanism C seam + its api-contract mirror) widens to accept the scaffold request; `tool-definitions.ts` create_team/add_agent shrink. Mechanical, and a net deletion.
- **Tooling repoints.** `tools/eval/src/seeding.ts` + `scenarios/builtin-routines.ts` and `tools/setup/src/demo-world/ids.ts` reference `seed-agent-pf-facilitation` — eval/demo must seed their own facilitator or repoint to the assistant.
- **Tests die with the package.** `framework/factory-defaults/src/__tests__/` (3 files) delete; roster/map assertions in `factory-and-demo`, `AF17-factory-bootstrap`, `X3-agent-config-bootstrap`, `X3-agents` integration tests shrink to the assistant-only seed.
- **One import-shape change for tooling.** `demo-fixture.ts` imports the template reader from a core-api face instead of a framework package — the pattern `runFactoryBootstrap` already uses.
