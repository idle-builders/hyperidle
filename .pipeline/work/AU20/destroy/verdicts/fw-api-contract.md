# api-contract — destroyer verdict (framework)

## Where does this package go?

**Verdict: STAYS SHARED — but gutted to the one thing it really is: the core-api ↔ agent-orchestration seam contract.**

The package's own header claims it exists so "server and client stay in sync." That is fiction. **Zero UI consumers exist** — `rg -a -l "@hyperidle/api-contract"` finds no file under `layers/core-ui` or `applications/web`. The web client types its API calls with its own local copies (`useCurrentUser.ts` declares its own `CurrentUser`; its test declares its own private `AuthMeResponse`). The three files written for that charter — `auth.ts`, `session.ts`, `settings.ts` — have **zero production consumers anywhere**, including the package's only function. They are kept alive solely by the package's own `contracts.test.ts`, which tests nothing but them.

What the package actually is: the two-sided port contract across the core-api ↔ agent-orchestration boundary. Both layers import overlapping symbol sets from it, both are forbidden to import each other (founder ruling quoted in `layers/agent-orchestration/src/routes/agent-orchestration-sessions.ts:7-9`; governance `architecture.json` declares `surfaces/framework/api-contract` with `reach: ["layer"]`), and the contract carries live runtime traffic in both directions:

- core-api consumes `AgentOrchestrationPort` (34 production files) → agent-orchestration's routes serve it with `satisfies` on the same types.
- agent-orchestration consumes `CoreApiPort` via its HTTP client (`core-api-port-composition.ts`) → core-api's routes type the same request/response shapes (`reviews.ts` imports `CaptureProposedCallRequest` etc.).
- `CORE_API_ACTOR_OVERRIDE_HEADER` is *sent* by agent-orchestration (`core-api-port-composition.ts:878`) and *read* by core-api (`middleware/auth.ts:146`) — a genuinely shared runtime constant.

Dissolving into either layer would force the other layer to import it, which the governance model forbids by construction. This is the one framework-package shape that earns its existence: two independent consumers on opposite ends of a machine-enforced boundary. DISSOLVE is not honest here.

But two whole port members are dead wire — client method, backing HTTP route, and types, none of it called by anything — and three of the five source files plus the package's only test file are corpses.

## Consumers (measured, not assumed)

`rg -a -l "@hyperidle/api-contract" layers framework applications tools`:

| Consumer | What it imports | Could it own this? |
|---|---|---|
| `layers/core-api` (12 prod files) | `AgentOrchestrationPort` + its req/resp/view types, `CoreApi*` req types in `routes/reviews.ts`, `CORE_API_ACTOR_OVERRIDE_HEADER` | No — it would have to import agent-orchestration for the port, forbidden |
| `layers/agent-orchestration` (5 prod files) | `CoreApiPort`, `CoreApiTransport`, all `CoreApi*` req/resp types (client impl), `AgentOrchestration*` wire types (`satisfies` on serving routes) | No — it would have to import core-api, explicitly ruled out (lore in `agent-orchestration-sessions.ts`) |
| `tools/eval` | `AgentOrchestrationPort`, `AgentOrchestrationTransport` (fixture) | Dev world, follows wherever the type lives |
| `tools/governance` | `AuthMeResponse` as an attack-fixture import string only | Incidental — any exported type name works |
| `applications/desktop`, `applications/remote-server`, `run-orchestration/session-store`, `tool-handlers/ports.ts` | **Comments only** — zero imports (`tool-handlers/ports.ts` deliberately mirrors `TaskView` structurally, "Mechanism C: no import") | n/a |
| `layers/core-ui` / web | **Nothing. Ever.** | The "client sync" charter never happened |

## If written today, from scratch

One package, two files, one honest name: the seam contract between the two layers.

- `core-api-port.ts` — `CoreApiPort` + the req/resp types its 44 live members carry (all 44 verified live: every member has ≥1 caller in agent-orchestration outside the client impl — this is the agents' tool traffic, core value).
- `agent-orchestration-port.ts` — `AgentOrchestrationPort` shrunk by the two dead session members, + the wire types its live members carry.
- `CORE_API_ACTOR_OVERRIDE_HEADER`.
- No `auth.ts`, no `session.ts`, no `settings.ts`, no `contracts.test.ts`, no sub-port exports from the index — sub-ports are reachable as members of the two parent ports.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 13 |
| MERGE | 0 |
| SIMPLIFY | 13 |
| KEEP | 72 |

Surface: 98 exports → 72 exports (27% cut). Files: 5 source files → 2 (+index), package test file deleted, plus ~100 LOC of dead client/route code in the two layers.

## Feature-level kills

1. **The "server/client sync" charter — dead on arrival, delete the remains.** `auth.ts`, `session.ts`, `settings.ts`: 13 exports including the package's ONLY function (`isPendingSessionStart` — zero references outside its own file, confirmed `rg -a` repo-wide). The serving routes don't import them (`routes/auth.ts` types its own response), the web client doesn't import them (writes its own local types). `AutonomyLevel` here (`"manual"|"supervised"|"autonomous"`) even **contradicts** the real `AutonomyLevel` in `framework/domain-model/src/knowledge.ts:69` (`1|2|3|4`) — a stale duplicate of a retired concept waiting to be imported by mistake.
2. **Two dead seam reads: session history + session activity.** `AgentOrchestrationPort.sessions.listSessionHistoryBySource` and `.getRecentActivity` have **zero callers** in core-api production. Kill the port members, their client impls (`agent-orchestration-port-composition.ts:218-260`), their backing wire routes (`agent-orchestration-sessions.ts:64-89` GET `/agent-orchestration/sessions`, `:108-114` GET `/agent-orchestration/sessions/:sessionId/activity`), the `getRecentActivity` DI parameter threaded through that route factory and boot, and the two entry types. The UI gets session activity through agent-orchestration's own REST door (`routes/sessions.ts` GET `/api/sessions/:id/activity`, hit by `core-ui/hooks/useSessionActivity.ts`) — the seam copy is a parallel second door nobody walks through.
3. **`src/__tests__/contracts.test.ts` — delete whole.** It exercises only the dead auth/settings types, and it is exactly the kind of type-shape "test" the repo's own testing rules reject. It is the only thing keeping the corpses warm. The `vitest` devDependency goes with it.

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `isPendingSessionStart` | DEAD | DELETE | The package's only function; zero references outside its own file, repo-wide `rg -a` confirmed. |

## Full export audit (types + const)

| # | Export | Kind | Reach | Verdict | Reason |
|---|---|---|---|---|---|
| 1 | `AgentOrchestrationSessionHistoryEntry` | interface | DEAD | DELETE | Only the never-called `listSessionHistoryBySource` client impl names it. |
| 2 | `AgentOrchestrationSessionActivityEntry` | interface | DEAD | DELETE | Only the never-called `getRecentActivity` client impl names it; UI reads activity via the REST door instead. |
| 3 | `AgentOrchestrationSessionWireRow` | interface | UI:POST /api/sessions (202 branch) | KEEP | Live wire row: served with `satisfies` by the owning layer, read through `sessions.getById` by core-api routes. |
| 4 | `AgentOrchestrationSessionsPort` | interface | INTERNAL | SIMPLIFY | 2 of 3 members die (rows 1-2's methods); shrink to `getById` and stop exporting — reachable as `AgentOrchestrationPort["sessions"]`. |
| 5 | `AgentOrchestrationWorkIntentKind` | type | UI + SCHED + intake route | KEEP | Live both ends: intake route + composition + scheduler bindings. |
| 6 | `AgentOrchestrationWorkIntentInput` | interface | UI:POST /api/knowledge… + SCHED:routine-scheduler | KEEP | Payload of `intents.submit`, called from 4 core-api prod files. |
| 7 | `AgentOrchestrationWorkIntentReceipt` | interface | same as 6 | KEEP | Return of live `intents.submit`. |
| 8 | `AgentOrchestrationExplicitStartRequest` | interface | UI:POST /api/sessions | KEEP | Payload of live `createExplicitStart`; typed on both ends of the seam. |
| 9 | `AgentOrchestrationExplicitStartView` | interface | UI:POST /api/sessions, GET /api/sessions/starts/:id | KEEP | Live on 3 prod files incl. `sessions-routes.ts`. |
| 10 | `AgentOrchestrationExplicitStartResult` | interface | same as 8 | KEEP | Return of live `createExplicitStart`. |
| 11 | `AgentOrchestrationIntentsPort` | interface | INTERNAL | SIMPLIFY | Zero name-importers; un-export, reachable as `AgentOrchestrationPort["intents"]`. |
| 12 | `AgentOrchestrationRequestsPort` | interface | INTERNAL | SIMPLIFY | Zero name-importers; all 3 members live; un-export. |
| 13 | `AgentOrchestrationStoppedRun` | interface | UI:tasks route via `runs.stopForTasks` | KEEP | Return of live member. |
| 14 | `AgentOrchestrationCreateBareRunRequest` | interface | UI via `runs.createBareRun` | KEEP | Payload of live member, typed on both ends. |
| 15 | `AgentOrchestrationRunsPort` | interface | INTERNAL | SIMPLIFY | Zero name-importers; all 5 members live (`stopForTasks`, `endForHandoff`, `createBareRun`, `abort`, `failExplicitStart`); un-export. |
| 16 | `AgentOrchestrationRunConfigView` | interface | UI:GET /api/agents/:id, /api/assistant | KEEP | Return of live `runConfig.read`/`readBatch`. |
| 17 | `AgentOrchestrationRunConfigPatch` | type | UI:PATCH /api/agents/:id, /api/assistant | KEEP | 4 prod importers; live write traffic. |
| 18 | `AgentOrchestrationTeamRunConfigDefaultsView` | interface | UI:teams routes | KEEP | Live `readTeamDefaults`/`writeTeamDefaults` both called. |
| 19 | `AgentOrchestrationRunConfigPort` | interface | INTERNAL | SIMPLIFY | Zero name-importers; all 5 members live; un-export. |
| 20 | `AgentOrchestrationFilesystemInjectionView` | interface | INTERNAL | SIMPLIFY | Zero name-importers; rides live `persistInjection` return; un-export. |
| 21 | `AgentOrchestrationPersistInjectionResult` | type | INTERNAL | SIMPLIFY | Same — un-export. |
| 22 | `AgentOrchestrationFilesystemsPort` | interface | INTERNAL | SIMPLIFY | Zero name-importers; both members live (`filesystems.ts:79,105`); un-export. |
| 23 | `AgentOrchestrationPort` | interface | UI + SCHED + EVENT — 34 prod files | KEEP | The seam itself. Core value: core-api's only legal door into orchestration. Loses the two dead session members. |
| 24 | `AgentOrchestrationTransport` | type | BOOTSTRAP both layers + eval | KEEP | Selects in-process vs HTTP wiring at boot on both sides. |
| 25 | `AuthMeResponse` | interface | TEST-ONLY/TOOLING | DELETE | Serving route and web hook both use private local copies; only real references are governance attack-fixture strings. |
| 26 | `CreateBetRequest` | interface | AGENT:create_bet tool | KEEP | Live `createBet` traffic, typed both ends. |
| 27 | `CreateBetResponse` | interface | AGENT:create_bet tool | KEEP | Return of live member. |
| 28 | `TaskView` | interface | AGENT:task tools | KEEP | Live `getTaskById`; deliberately mirrored (not imported) by `tool-handlers/ports.ts` — the contract copy is the master. |
| 29 | `BetView` | interface | AGENT:bet tools | KEEP | Live `getBetById`. |
| 30 | `UpdateBetRequest` | interface | AGENT:update_bet | KEEP | Live `updateBetById`. |
| 31 | `CreateTaskRequest` | interface | AGENT:create_task | KEEP | Live `createTask`. |
| 32 | `CreateTaskResponse` | interface | AGENT:create_task | KEEP | Return of live member. |
| 33 | `ItemView` | interface | AGENT:item tools | KEEP | Live `getItemById`/`updateItemById`. |
| 34 | `UpdateItemRequest` | interface | AGENT:item tools | KEEP | Live `updateItemById`. |
| 35 | `CreateItemRequest` | interface | AGENT:create_item + EVENT reactions | KEEP | Live `createItem`, imported by both `tool-handlers-bindings` and the client. |
| 36 | `CreateItemResponse` | interface | same | KEEP | Return of live member. |
| 37 | `CreateArtifactRequest` | interface | AGENT:create_artifact | KEEP | Live `createArtifact`. |
| 38 | `CreateArtifactResponse` | interface | same | KEEP | Return of live member. |
| 39 | `UserView` | interface | AGENT:user reads | KEEP | Live `getUserById`/`listUsersByTeam`/`findSoleHumanUser`. |
| 40 | `HandoffTaskRequest` | interface | AGENT:handoff tool | KEEP | Live `handoffTask`. |
| 41 | `HandoffTaskResponse` | interface | same | KEEP | Return of live member. |
| 42 | `CoreApiWorkPort` | interface | agent-orchestration imports name | KEEP | All 12 members verified live from the orchestration side. |
| 43 | `CoreApiUsersPort` | interface | agent-orchestration imports name | KEEP | All 3 members live. |
| 44 | `ConversationThreadView` | interface | AGENT:conversation tools | KEEP | Live `getThreadById`; mirrored by design in `tool-handlers/ports.ts`. |
| 45 | `InsertThreadRequest` | interface | AGENT:conversation tools | KEEP | Live `insertThread`. |
| 46 | `InsertThreadResponse` | interface | same | KEEP | Return of live member. |
| 47 | `UpdateThreadRequest` | interface | AGENT:conversation tools | KEEP | Live `updateThread`. |
| 48 | `ConversationMessageType` | type | AGENT:messaging | KEEP | Field of live `InsertMessageRequest`. |
| 49 | `InsertMessageRequest` | interface | AGENT:send_message | KEEP | Live `insertMessage` — the agents-talk-in-conversations core loop. |
| 50 | `InsertMessageResponse` | interface | same | KEEP | Return of live member. |
| 51 | `ConversationInboxMessageView` | interface | INTERNAL | SIMPLIFY | Zero name-importers; only a field of `ConversationInboxRowView`; un-export. |
| 52 | `ConversationInboxRowView` | interface | AGENT:inbox reads | KEEP | Return of live `listInboxBySenderExclusion`. |
| 53 | `DirectThreadResponse` | interface | AGENT:direct threads | KEEP | Return of live `findOrCreateDirectThread`. |
| 54 | `CoreApiConversationPort` | interface | agent-orchestration imports name | KEEP | All 7 members live. |
| 55 | `OrgTeamView` | interface | AGENT:team reads | KEEP | Live `getTeamById`. |
| 56 | `OrgTeamMembershipView` | interface | AGENT:team reads | KEEP | Live `getTeamMembersByTeamId`. |
| 57 | `OrgTeamMembersByIdView` | interface | AGENT:team reads | KEEP | Live `getTeamMembersById`. |
| 58 | `CreateOrgTeamRequest` | interface | AGENT:team scaffolding | KEEP | Live `createTeam`. |
| 59 | `UpdateOrgTeamRequest` | interface | AGENT:team updates | KEEP | Live `updateTeam`. |
| 60 | `ReviewRecipientsQuery` | interface | INTERNAL | SIMPLIFY | Zero name-importers; param of live `resolveReviewRecipientsForItem`; un-export. |
| 61 | `PersistScaffoldedAgentsResponse` | interface | AGENT:team scaffolding | KEEP | Return of live `persistScaffoldedAgents`. |
| 62 | `ProvisionTeamRoutinesRequest` | interface | AGENT:team scaffolding | KEEP | Live `provisionTeamRoutines`. |
| 63 | `CoreApiOrgPort` | interface | agent-orchestration imports name | KEEP | All 8 members live. |
| 64 | `InsertRoutineRequest` | interface | AGENT:routine tools | KEEP | Live `insertRoutine`, imported by `tool-handlers-bindings`. |
| 65 | `RoutineView` | interface | AGENT:routine tools | KEEP | Live `getRoutineById`. |
| 66 | `UpdateRoutineRequest` | interface | AGENT:routine tools | KEEP | Live `updateRoutineById`. |
| 67 | `CoreApiRoutinePort` | interface | INTERNAL | SIMPLIFY | Zero name-importers; all 3 members live; un-export, reachable as `CoreApiPort["routine"]`. |
| 68 | `CreateKnowledgeItemRequest` | interface | AGENT:knowledge tools | KEEP | Live `knowledge.create` — shared-knowledge core loop. |
| 69 | `CreateKnowledgeItemResponse` | interface | same | KEEP | Return of live member. |
| 70 | `UpdateKnowledgeItemContentRequest` | interface | AGENT:knowledge tools | KEEP | Live `updateKnowledgeItemContent`. |
| 71 | `UpdateKnowledgeItemContentResponse` | interface | same | KEEP | Return of live member. |
| 72 | `UpdateKnowledgeItemContentResult` | type | same | KEEP | Discriminated result of live member. |
| 73 | `KnowledgeItemVersionView` | interface | AGENT:knowledge reads | KEEP | Live `findKnowledgeItemVersionById`. |
| 74 | `KnowledgeItemStatusView` | interface | AGENT:knowledge reads | KEEP | Live `findKnowledgeItemStatusById`. |
| 75 | `KnowledgeConflictView` | interface | AGENT:knowledge conflicts | KEEP | Live `findOpenConflictByItemAndProposer`. |
| 76 | `CreateKnowledgeConflictRequest` | interface | AGENT:knowledge conflicts | KEEP | Live `createKnowledgeConflict` (3 callers). |
| 77 | `PromoteKnowledgeItemRequest` | interface | AGENT:knowledge promotion | KEEP | Live `promoteKnowledgeItem`. |
| 78 | `PromoteKnowledgeItemResult` | type | same | KEEP | Return of live member, 2 prod importers. |
| 79 | `CoreApiKnowledgePort` | interface | INTERNAL | SIMPLIFY | Zero name-importers; all 10 members live; un-export. |
| 80 | `CaptureProposedCallRequest` | interface | AGENT:AL7 review loop | KEEP | Live `captureProposedCall`, typed on the serving route too (`reviews.ts`). |
| 81 | `CaptureProposedCallResponse` | interface | same | KEEP | Return of live member. |
| 82 | `ConsumeTailoredGrantRequest` | interface | AGENT:AL7 review loop | KEEP | Live `consumeTailoredGrant`, both ends. |
| 83 | `ConsumeTailoredGrantResponse` | interface | same | KEEP | Return of live member. |
| 84 | `ProposedCallOutcomeResult` | type | AGENT:AL7 review loop | KEEP | Live `recordOutcome`, both ends. |
| 85 | `CoreApiReviewPort` | interface | INTERNAL | SIMPLIFY | Zero name-importers; all 3 members live; un-export. |
| 86 | `CoreApiPort` | interface | AGENT — 25 prod files | KEEP | The other half of the seam: agent-orchestration's only legal door into core-api. Core value: every agent tool call rides it. |
| 87 | `CoreApiTransport` | type | BOOTSTRAP both layers | KEEP | 6 prod importers; boot-time wiring selector. |
| 88 | `PendingSessionStart` | interface | DEAD | DELETE | Zero references outside `session.ts`. The 202 flow types its wire rows elsewhere. |
| 89 | `CreateSessionAcceptedResponse` | type | DEAD | DELETE | Zero references outside `session.ts`. |
| 90 | `AutonomyLevel` | type | DEAD | DELETE | Zero consumers, and it contradicts the real `AutonomyLevel` (`1\|2\|3\|4`) in `domain-model/knowledge.ts:69` — a booby trap, not a contract. |
| 91 | `SettingsProfile` | interface | TEST-ONLY | DELETE | Only the package's own test imports it; core-ui hits are React components sharing the name, zero api-contract imports in core-ui. |
| 92 | `SettingsTeam` | interface | TEST-ONLY | DELETE | Same corpse pile. |
| 93 | `SettingsUser` | interface | TEST-ONLY | DELETE | Same. |
| 94 | `SettingsAgent` | type | TEST-ONLY | DELETE | Same. |
| 95 | `SettingsNotifications` | interface | TEST-ONLY | DELETE | Same; the real notifications UI never imported it. |
| 96 | `SettingsResponse` | interface | DEAD | DELETE | Zero references anywhere outside the package. |
| 97 | `CORE_API_ACTOR_OVERRIDE_HEADER` | const | seam runtime value, both layers | KEEP | Sent by orchestration's client (`core-api-port-composition.ts:878`), read by core-api auth (`auth.ts:146`). The one legitimate runtime export. |

## Types / DI ports

Covered above — this package is nothing but types and one const; rows 1-97 are the complete surface.

## Holes this leaves

- **None at runtime.** Every DELETE has zero production callers, verified with `rg -a` repo-wide. No UI, agent, or scheduler door reaches any of it.
- Deleting the two dead port members also deletes their backing wire routes and client impls (~100 LOC across `agent-orchestration-port-composition.ts` and `agent-orchestration-sessions.ts`) plus the `getRecentActivity` DI thread through agent-orchestration boot; the port-readonly integration test loses the cases covering those two routes.
- `tools/governance` attack fixtures use `import type { AuthMeResponse } from "@hyperidle/api-contract"` as their probe string (3 sites in `governance-attacks.ts`, 1 mention in `no-laundered-re-exports.ts`) — respell to any surviving export, e.g. `CoreApiTransport`. Tooling-world, five-minute fix.
- If the founder ever actually wants typed web↔server contracts, that is a new decision to make deliberately — not a reason to keep 13 dead exports that pretended to be one for the entire life of this package.
- Deleting `contracts.test.ts` removes the package's only test. Nothing of value is lost: it tested only the deleted types, with type-shape assertions the repo's testing rules already reject.
