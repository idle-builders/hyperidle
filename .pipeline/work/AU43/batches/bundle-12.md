# Delete bundle 12 — run-orchestration, agent-run-config, fw-factory-defaults

16 convicted rows across 3 package(s).

| # | Package | Symbol | Reach | Why convicted |
|---|---|---|---|---|
| 1 | run-orchestration | `createBareRun` | UI:POST /api/sessions (legacy branch) + seam POST /runs/bare | Second way to start a session, kept for tests/back-compat; kill callers, seam route, and port method with it. |
| 2 | run-orchestration | `recordSessionMetadata` | UI:PATCH /api/sessions/:id (effectiveness-only branch) | Its only door branch serves effectiveness scoring, which has no production writer; dies with the feature, branch and all. |
| 3 | run-orchestration | `RunTransitionResult` |  | Alias of Awaited<ReturnType<transitionRun>> = unknown. A named type for unknown with zero production consumers. |
| 4 | run-orchestration | `AgentTerminationReason` |  | Zero external consumers, and transition-run.ts:30 declares its own private duplicate — the export is a stale mirror. |
| 5 | run-orchestration | `CreateBareRunInput` |  | Dies with createBareRun. |
| 6 | run-orchestration | `FileWatcherConfig` |  | No external consumer (composition imports only the function); becomes file-internal after the de-loop. |
| 7 | run-orchestration | `FileWatcher` |  | Same — the one-member (stop) handle type stays file-internal. |
| 8 | agent-run-config | `readTeamRunConfigDefaults` | UI:POST /api/teams/:teamId/agents (sole production reader, teams-routes.ts:543) | One-reader memo table replaying a create-form dropdown; late-added agents take the existing builtin fallback — see feature kill. |
| 9 | agent-run-config | `writeTeamRunConfigDefaults` | UI:POST /api/teams/ (teams-routes.ts:282, deliberately non-atomic) | Writes a memo nobody needs once #4 dies; creation-time stamping already bypasses the table entirely. |
| 10 | agent-run-config | `TeamRunConfigDefaults (interface)` |  | Dies with the feature kill; api-contract mirror at agent-orchestration-port.ts:288 dies too. |
| 11 | agent-run-config | `EMPTY_TEAM_RUN_CONFIG_DEFAULTS (const)` |  | Zero external production consumers (confirmed rg -a); dies with the feature kill. |
| 12 | agent-run-config | `SessionLifecycleAgentRunConfigReader (port, in run-orchestration — not in input but killed by this verdict)` |  | Exists only because Service→Service import is forbidden; the fold makes it a direct import. |
| 13 | fw-factory-defaults | `AgentScaffoldRequest` | interface · INTERNAL — zero external importers; callers pass literals | An exported request shape nobody imports; a 7-field union where every call null-pads 4 fields — fold into per-trigger parameters when the resolver moves. |
| 14 | fw-factory-defaults | `FactorySystemAssistantSpec` | interface · INTERNAL — types the literal only | The assistant is machinery, not ritual — Ruling 3 does not apply. Two fields typing one inlined literal; zero external importers. |
| 15 | fw-factory-defaults | `FactoryRosterSpec` | interface · INTERNAL — only non-package mention is a doc comment | The AK6 injection seam that never injects; factory-state.ts hardcodes the value it pretends to receive. A hardcoded seam is fiction — the plugin surface replaces it; nobody wants this shape in any form. |
| 16 | fw-factory-defaults | `FactoryAgentRef` | interface · BOOTSTRAP (factory-state.ts → factory-run-config.ts handoff) | A {id, role} pair does not justify a package hop — inline the structural type in each face; duplicating two fields beats importing them. |
