# factory-defaults — destroyer verdict (framework) — REVISED after founder rulings

## What changed after the rulings

| Row | Export | Old verdict | New verdict | Ruling | Why it moved |
|---|---|---|---|---|---|
| 5 | `FactoryFacilitatorSpec` | DELETE | **PLUGIN** | Ruling 3 | A facilitator-per-community-of-practice is a legitimate knowledge-management ritual — exactly "preconfigure agents, skills, routines and triggers". It leaves core and ships as a plugin's agent declaration, in plugin-manifest terms. |
| 9 | `COMMUNITY_DISPLAY_NAMES` | DELETE | **PLUGIN** | Ruling 3 | The community vocabulary (build/product/growth/ops/facilitation) is the ritual's naming, not garbage. Travels with the plugin. |
| 10 | `defaultFactoryRoster` | SIMPLIFY | SIMPLIFY (re-reasoned) | Ruling 3 | Verdict value unchanged — core still shrinks to the assistant singleton, inlined. But the five facilitator entries are no longer discarded: they become the plugin's preconfigured roster. The removed half's fate flipped DELETE → PLUGIN. |
| Feature kill 1 | 5-facilitator factory pre-seed | DELETE (whole feature) | **PLUGIN** (whole feature) | Ruling 3 | See "What leaves core and becomes a plugin". |

**Rows changed: 3** (2 verdict flips DELETE → PLUGIN, 1 SIMPLIFY re-reasoned). Everything else re-checked against Rulings 1–3 and confirmed unchanged — the reasons below say where Ruling 1 was re-applied.

**What did NOT move, and why the structural findings stand:**

- `FactoryRosterSpec` stays **DELETE**. Ruling 3 rescues the ritual, not the fiction around it. A "registry-free injection seam" whose one consumer hardcodes `const roster = defaultFactoryRoster` has never injected anything; the plugin surface declares agents through the plugin mechanism, not through a roster-spec interface in core. Nobody would want this seam in any form.
- `AgentScaffoldSpec` stays **MERGE**. A duplicated scaffold type is still a duplicate — `layers/core-api/org/src/scaffold-agents.ts:75` already redeclares it locally and admits it in its own header.
- `FactorySystemAssistantSpec`, `FactoryAgentRef`, `AgentScaffoldRequest`, `SYSTEM_PROMPT_TEMPLATE_FILES` stay **DELETE**. The assistant is machinery, not ritual — Ruling 3 does not touch it — and these are two-field types and an export-shape nobody imports. No ruling protects indirection.
- **Ruling 1 re-check** (shared backend, team, OIDC): the first-wave case against the facilitators never rested on a single-user premise — it rested on zero UI surface and their only job being the convicted knowledge sweeps. Re-judged as "what does a *team* get on first run": a team-shaped install has a *stronger* claim to a preconfigured practice roster than a solo founder — which is precisely why the ritual is worth re-providing as a plugin (possibly installed by default on team setups) instead of dying outright. Ruling 1 moved the fate from DELETE toward PLUGIN; it does not move it back into core. Meanwhile Ruling 1 *strengthens* the survivors: `resolveAgentScaffoldSpecs`' three triggers are the multi-user paths — `user_assistant` mints a per-human assistant (`ast-<userId>`, "<name>'s Assistant") which is what OIDC user provisioning will call per teammate, and `team_scaffold` builds a roster per created team in an org of several teams. The package's surviving symbols are exactly the team-shaped code.
- **Ruling 2**: not applicable — this package defines no event types and no row was killed on subscriber count.

### What leaves core and becomes a plugin

**The practice-communities ritual, whole.** One "knowledge-management practice communities" plugin providing:

- **Five facilitator agents**, one per community of practice (build, product, growth, ops, facilitation), with their ids (`seed-agent-pf-<community>`), display names (the `COMMUNITY_DISPLAY_NAMES` vocabulary), and the facilitator persona template.
- **The two knowledge sweeps they own** — `builtin:knowledge-decay` and `builtin:knowledge-promotion` (`routine-scheduler.ts:149-169`, both `ownerRole: "facilitator"`). These are knowledge-management ceremony by name and belong in the same plugin as their owners. This intersects the routine destroyer's builtin-routine conviction: under Ruling 3 those two sweeps are not merely deleted, they are re-provided as plugin routines+triggers — the two revised verdicts must land the same way.
- **Boundary note for other verdicts:** the `facilitator` entry in `AGENT_ROLE_CATALOG` and `facilitator.md` in `docs/system-prompts/` (served via the map row in `SYSTEM_PROMPT_TEMPLATE_FILES`) are the role's core-side residue. If the plugin carries its own persona, both are candidates to leave with it — that call belongs to the domain-model verdict, not this package's. Until then they stay: the map is a closed allowlist and the row is harmless.

What stays in core is the machinery of working: the assistant singleton seed, per-user assistant scaffolding, per-team roster scaffolding, template serving. None of it is ritual *about* the work.

**No work package exists for the plugin yet** (per the rulings file) — the extraction above is scope for the one that needs writing.

---

## Where does this package go?

**Verdict: DISSOLVE → `layers/core-api`** (unchanged). Scaffold resolution into the org/teams service beside `persistScaffoldedAgents`; the assistant seed inlined into `bootstrap/factory-state.ts`; the template reader beside its route. The facilitator/community content leaves for the plugin. Package deleted.

The package is three unrelated things stapled together by the word "defaults":

1. **Scaffold-spec resolution** (`resolveAgentScaffoldSpecs`) — agent-identity logic; belongs beside `persistScaffoldedAgents` in the org/teams service. Widen the seam to accept the scaffold *request* and resolve inside core-api; orchestration (a blind executor) hands over requests, not composed identity specs. After that, agent-orchestration imports **nothing** from this package. Under Ruling 1 this is the most load-bearing code here: it is the per-user (OIDC provisioning → assistant) and per-team (team creation → roster) path of a shared backend.
2. **The factory roster seed** — the AK6 "injection seam" is fiction (one hardcoded value, zero alternative rosters, consumer reads the const directly). The assistant half inlines into `factory-state.ts`; the facilitator half is the plugin's roster (Ruling 3).
3. **System-prompt template reading** (`readSystemPromptTemplateForRole` + map) — lands in core-api beside `GET /api/agents/templates/:role`.

`tools/setup` and the desktop app reach everything through the core-api faces they already call (`applyFactoryCoreState`, `runFactoryBootstrap`). No consumer needs a framework package to exist.

## Consumers (measured, not assumed)

`rg -a -l "@hyperidle/factory-defaults" layers framework applications tools` — re-run against the current tree, list unchanged since the first wave; production files only:

| Consumer | What it imports | Could it own this? |
|---|---|---|
| `layers/core-api/src/bootstrap/factory-state.ts` | `COMMUNITY_DISPLAY_NAMES`, `defaultFactoryRoster`, `FactoryAgentRef` | Yes — sole consumer of all three; assistant seed inlines, facilitator/community content leaves for the plugin. |
| `layers/core-api/src/routes/users.ts` | `resolveAgentScaffoldSpecs`, `AgentScaffoldSpec` | Yes — core-api. |
| `layers/core-api/src/routes/teams-routes.ts` | `resolveAgentScaffoldSpecs` | Yes — core-api. |
| `layers/core-api/src/routes/assistant.ts` | `resolveAgentScaffoldSpecs` | Yes — core-api. |
| `layers/core-api/src/routes/agents.ts` | `readSystemPromptTemplateForRole` | Yes — core-api. |
| `layers/agent-orchestration/tool-handlers/src/tool-definitions.ts` | `resolveAgentScaffoldSpecs` | Doesn't need it — widen the `persistScaffoldedAgents` seam to take the request; resolution is core-api's job. |
| `layers/agent-orchestration/src/factory-run-config.ts` | `FactoryAgentRef`, `readSystemPromptTemplateForRole`, `SYSTEM_PROMPT_TEMPLATE_FILES` | Doesn't need it — the template backfill loop only ever matched facilitators; with facilitators out of core the loop is dead. `FactoryAgentRef` inlines as `{id, role}`. |
| `tools/setup/src/demo-fixture.ts` | `readSystemPromptTemplateForRole` | Imports the core-api face — same sanctioned tooling→layer-face reach `runFactoryBootstrap` already uses. |

`layers/core-api/org/src/scaffold-agents.ts` still redeclares `AgentScaffoldSpec` locally ("structurally identical" per its own header) — the package's export duplicates a type the owning service already carries.

## If written today, from scratch — against the corrected premise

A shared backend for a team and an organisation of several teams, identity from OIDC, an event stream plugins hang off. First boot of that system seeds:

- **One org-wide system assistant** (`seed-agent-cos`) — inlined literal in `factory-state.ts`. Load-bearing: `coach.ts:43` hardcodes it, `knowledge/src/factory-seed.ts:31` stamps it as `updatedBy`, `builtin:portfolio-retro` runs as `ownerRole: "assistant"`.
- **A per-human assistant minted at OIDC provisioning** — the `user_assistant` trigger of `resolveAgentScaffoldSpecs`, living in the org/teams service behind the `persistScaffoldedAgents` seam. Every teammate who arrives via the identity provider gets one.
- **A per-team roster minted at team creation** — the `team_scaffold` trigger, same home.
- **Template serving** — `readSystemPromptTemplateForRole` in core-api beside its route; map module-internal.
- **Ritual comes from plugins** — the practice-communities plugin preconfigures facilitators + knowledge sweeps for installs that want the ceremony. Core seeds none of it.

Three symbols, zero packages, no roster spec types, no injection seam, no shared `{id, role}` interface.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 5 |
| PLUGIN | 2 |
| MERGE | 2 |
| SIMPLIFY | 1 |
| FINISH | 0 |
| KEEP | 1 |

Surface: 11 exports → 0 exports (package deleted; 3 symbols survive relocated into core-api; the facilitator roster + community vocabulary re-provide as a plugin).

## Feature-level kills

**1. The 5-facilitator factory pre-seed — whole feature, PLUGIN (was DELETE; Ruling 3).**
Every fresh install seeds five "facilitator" agents, one per community of practice. Zero UI surface (`rg -a -i "communit"` across `applications/` and `layers/core-ui/` production files: one unrelated comment in `SettingsConnections.tsx:13` — re-confirmed on the current tree). Their only production job is owning the two builtin knowledge sweeps (`routine-scheduler.ts:151,162`, `ownerRole: "facilitator"` — the sweeps are `knowledge-decay` and `knowledge-promotion`, knowledge-management ceremony by name). Under Ruling 3 the whole cluster — five facilitators, the community vocabulary, the two sweeps, their triggers — leaves core and ships as one plugin. Judged under Ruling 1 as "what does a team get on first run": the ritual is *more* plausible for a team than a solo founder, which argues for the plugin existing and perhaps installing by default on team setups — not for the ritual staying in core tables and bootstrap code. What breaks in core: `tools/eval/src/seeding.ts:520`, `tools/eval/src/scenarios/builtin-routines.ts:72`, `tools/setup/src/demo-world/ids.ts:22` hardcode `seed-agent-pf-facilitation` — eval/demo install the plugin or seed locally.

**2. The AK6 roster-injection seam — DELETE (unchanged).**
`FactoryRosterSpec` / `FactorySystemAssistantSpec` have zero external importers (the one `FactoryRosterSpec` hit outside the package is a doc comment in `scaffold-agents.ts:24`). The seam was never injected — `factory-state.ts` hardcodes the value it pretends to receive. A seam that hardcodes the value it claims to inject is fiction; the plugin surface, not a core interface, is how alternative rosters arrive. Nobody wants this in any form.

**3. The run-config template backfill — DELETE (unchanged, collateral).**
`factory-run-config.ts:49-56` iterates `SYSTEM_PROMPT_TEMPLATE_FILES` to backfill prompts onto roster agents. With facilitators out of core the roster is one assistant, which is deliberately **not** in the map (lore in `system-prompt-templates.ts:19-23` preserves that 404), so the loop writes nothing, ever. `applyFactoryRunConfigDefaults` shrinks to one AH2-defaults write for the assistant.

**4. Orchestration-side scaffold resolution — MERGE behind the seam (unchanged, strengthened by Ruling 1).**
`create_team` / `add_agent` tool handlers resolve specs locally, spread-widen them past the opaque seam type, then push through `persistScaffoldedAgents` (`tool-definitions.ts:1036,1131`). Seam takes the request; core-api resolves. On a shared backend the resolver is identity-minting for real teams and real humans — one owner, one home, in the org/teams service.

**Survives on evidence — the assistant seed.** `seed-agent-cos` is load-bearing (coach.ts:43, knowledge factory-seed:31, `builtin:portfolio-retro`). One seeded org-wide system agent is the honest factory state of a shared backend.

**Sibling cross-checks:**
- **routine destroyer**: the convicted builtin-routine subsystem contains the two facilitator-owned knowledge sweeps. Under Ruling 3 both revised verdicts must converge on PLUGIN for that pair (and the retro builtins are the same shape — theirs to rule). The kills still compound, now into the same plugin.
- **settings destroyer** (drop `plugins` + `plugin_configuration_defaults` tables): factory-defaults feeds neither (`rg -a -i "plugin" framework/factory-defaults/src/` = zero hits). But Ruling 3 makes the plugin surface the designated landing zone for the ritual — the settings verdict on those tables should be re-read against that before the tables die.

## Full export audit

| # | Export | Kind | Reach | Verdict | Reason |
|---|---|---|---|---|---|
| 1 | `resolveAgentScaffoldSpecs` | function | UI:POST /api/teams, UI:POST /api/users, UI:GET+PATCH /api/users/:userId/assistant, AGENT:create_team, AGENT:add_agent | MERGE | Agent-identity logic; folds into the org/teams service behind `persistScaffoldedAgents`. Ruling 1 strengthens: `user_assistant` is the per-teammate path OIDC provisioning calls, `team_scaffold` the per-team path of a multi-team org. |
| 2 | `readSystemPromptTemplateForRole` | function | UI:GET /api/agents/templates/:role (AgentEditor, AgentAddDialog, AgentDetailPane) + scaffold paths + demo fixture | KEEP | Core value: agent personas from `docs/system-prompts/` behind a live UI door; relocates to core-api, traversal-closed allowlist unchanged. |
| 3 | `AgentScaffoldRequest` | interface | INTERNAL — zero external importers; callers pass literals | DELETE | An exported request shape nobody imports; a 7-field union where every call null-pads 4 fields — fold into per-trigger parameters when the resolver moves. |
| 4 | `AgentScaffoldSpec` | interface | users.ts, tool-definitions.ts, org (redeclared locally) | MERGE | The owning service already carries a structurally identical local copy (`org/src/scaffold-agents.ts:75`); make that the single declaration, delete this duplicate. Ruling 3 does not launder duplicates. |
| 5 | `FactoryFacilitatorSpec` | interface | INTERNAL — types the literal only | PLUGIN | Ruling 3: a facilitator per community of practice is legitimate knowledge-management ritual — re-provide as the plugin's agent declaration (plugin-manifest terms, not this core interface). Leaves core either way; zero external importers even today. |
| 6 | `FactorySystemAssistantSpec` | interface | INTERNAL — types the literal only | DELETE | The assistant is machinery, not ritual — Ruling 3 does not apply. Two fields typing one inlined literal; zero external importers. |
| 7 | `FactoryRosterSpec` | interface | INTERNAL — only non-package mention is a doc comment | DELETE | The AK6 injection seam that never injects; `factory-state.ts` hardcodes the value it pretends to receive. A hardcoded seam is fiction — the plugin surface replaces it; nobody wants this shape in any form. |
| 8 | `FactoryAgentRef` | interface | BOOTSTRAP (factory-state.ts → factory-run-config.ts handoff) | DELETE | A `{id, role}` pair does not justify a package hop — inline the structural type in each face; duplicating two fields beats importing them. |
| 9 | `COMMUNITY_DISPLAY_NAMES` | const | BOOTSTRAP (factory-state.ts only) | PLUGIN | Ruling 3: the community vocabulary (Build/Product/Growth/Ops/Facilitation) is the ritual's naming and travels with the plugin. Leaves core; no UI surface in core remains. |
| 10 | `defaultFactoryRoster` | const | BOOTSTRAP (factory-state.ts only, hardcoded) | SIMPLIFY | Core shrinks to the assistant singleton inlined into `factory-state.ts` (`seed-agent-cos` load-bearing: coach.ts:43, knowledge factory-seed:31). The five facilitator entries are the plugin's preconfigured roster (Ruling 3), not discarded. |
| 11 | `SYSTEM_PROMPT_TEMPLATE_FILES` | const | factory-run-config.ts backfill loop (dead with facilitators out of core) + tests | DELETE | Export dies: sole surviving caller is `readSystemPromptTemplateForRole` in-module; the backfill loop it feeds can never match the assistant-only core roster by design. Map becomes module-internal; the `facilitator` row's fate rides the domain-model verdict on the role catalog. |

## Holes this leaves

- **Fresh core installs seed 1 agent, not 6.** Facilitators arrive by installing the practice-communities plugin. Ruling 1 framing: an org onboarding a team can install the plugin at setup; core stays clean.
- **The plugin does not exist yet, and no work package exists for it.** Until it is written, landing these deletes removes the ritual with no replacement. Sequencing call for the founder: extract-to-plugin in one move, or accept a gap. The rulings file already flags that a WP needs writing.
- **If the routine destroyer's revised verdict lands the sweeps as PLUGIN too** (it must, same ruling), the plugin carries agents + routines + triggers together and the `ownerRole: "facilitator"` orphaning problem disappears — owners and sweeps travel as one unit.
- **Seam signature change.** `persistScaffoldedAgents` (Mechanism C seam + its api-contract mirror) widens to accept the scaffold request; `tool-definitions.ts` create_team/add_agent shrink. Mechanical, net deletion.
- **Tooling repoints.** `tools/eval/src/seeding.ts:520` + `scenarios/builtin-routines.ts:72` and `tools/setup/src/demo-world/ids.ts:22` reference `seed-agent-pf-facilitation` — eval/demo install the plugin or seed their own facilitator.
- **Tests die with the package.** `framework/factory-defaults/src/__tests__/` (3 files) delete; roster/map assertions in `factory-and-demo`, `AF17-factory-bootstrap`, `X3-agent-config-bootstrap`, `X3-agents` integration tests shrink to the assistant-only seed; plugin-side seeding gets its own tests in the plugin's WP.
- **One import-shape change for tooling.** `demo-fixture.ts` imports the template reader from a core-api face instead of a framework package — the pattern `runFactoryBootstrap` already uses.
