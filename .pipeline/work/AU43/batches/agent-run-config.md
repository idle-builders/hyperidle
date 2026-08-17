# Delete batch — `agent-run-config`

5 convicted rows. Delete every one, or record it as a survivor with a reason.

| # | Symbol | Reach | Why it was convicted |
|---|---|---|---|
| 1 | `readTeamRunConfigDefaults` | UI:POST /api/teams/:teamId/agents (sole production reader, teams-routes.ts:543) | One-reader memo table replaying a create-form dropdown; late-added agents take the existing builtin fallback — see feature kill. |
| 2 | `writeTeamRunConfigDefaults` | UI:POST /api/teams/ (teams-routes.ts:282, deliberately non-atomic) | Writes a memo nobody needs once #4 dies; creation-time stamping already bypasses the table entirely. |
| 3 | `TeamRunConfigDefaults (interface)` |  | Dies with the feature kill; api-contract mirror at agent-orchestration-port.ts:288 dies too. |
| 4 | `EMPTY_TEAM_RUN_CONFIG_DEFAULTS (const)` |  | Zero external production consumers (confirmed rg -a); dies with the feature kill. |
| 5 | `SessionLifecycleAgentRunConfigReader (port, in run-orchestration — not in input but killed by this verdict)` |  | Exists only because Service→Service import is forbidden; the fold makes it a direct import. |
