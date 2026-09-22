# facts-user.md — the "user" side of HyperIdle as it stands

Census 2026-09-22, worktree `pipeline-bc5-user-subscriptions`, branch `feature/user-subscriptions` at `84b4626fb`. Facts only.

## 0. The action pattern as it exists today

### 0.1 Declarations — `framework/domain-model/src/actions/*.ts`

| File | Lines | Action names |
|---|---:|---|
| `action.ts` | 32 | shared `ActionDeclaration` type |
| `task.ts` | 286 | `search_tasks`, `open_task`, `edit_task` |
| `thread.ts` | 517 | `search_threads`, `open_thread`, `send_message`, `adjust_thread` |
| `document.ts` | 650 | `search_documents`, `open_document`, `edit_document` |
| `session.ts` | 202 | `search_sessions`, `watch_session`, `stop_session` |
| `platform.ts` | 190 | `search_plugins`, `edit_plugin` |
| **total** | **1877** | **15 actions, 5 modules** |

### 0.2 Module implementations

| File | Lines | Package |
|---|---:|---|
| `layers/core-api/task/src/task-actions.ts` | 865 | `@hyperidle/task` |
| `layers/core-api/thread/src/thread-actions.ts` | 1468 | `@hyperidle/thread` |
| `layers/core-api/document/src/document-actions.ts` | 882 | `@hyperidle/document` |
| `layers/core-api/settings/src/platform-actions.ts` | 862 | `@hyperidle/settings` |
| `layers/agent-orchestration/run-orchestration/src/session-actions.ts` | 162 | `@hyperidle/run-orchestration` |

### 0.3 Composition — `layers/core-api/src/actions/`

| File | Lines | Role |
|---|---:|---|
| `actions/action.ts` | 92 | `ActionContext {actor, db, eventBus, now, caller?, internal?}`, structural `Action<I,O>` |
| `actions/compose.ts` | 362 | `buildCoreActions` (270–294), the dep-bag builders |
| `actions/actions-router.ts` | 46 | HTTP loop `POST /<name>`, mounted at `/api/actions` (`app.ts:442`) |
| `actions/actions-as-tools.ts` | 42 | MCP loop, `actor = ctx.agentId` |

Deps bag: one `buildXActionsDeps(...)` per module returning that module's `XActionsDeps` — each field a lambda binding another SQL-owning service's typed function. Ports seen: `changes: { appendChange }`, `users: { getUserById, listByIds, listByTeamIds, listOwnedBy, soleHumanForAgent }`, `org: { getTeam }`, `settings: { readServerConfig }`, `agents: { requireRunnableAgent, getAgentIdentity }`, `agentOrchestration: {...}`, `searchDocuments`, `openParent`, `systemParentExists`, `onBodyChanged`, optional `wsPush`. Build order: thread → task → document → platform. Cycle break `lazySearchDocuments` (151); `runnerFor<I,O>(actions, name)` (133). Two standalone compositions for pre-auth callers: `buildStandaloneDocumentRunners()` (337, used by `routes/users.ts` first-run setup) and `createStandaloneSearchDocuments()` (360, `service-bootstrap.ts`).

### 0.4 UI door — `layers/core-ui/src/services/call.ts` (38 lines)

`Actions = TASK & THREAD & DOCUMENT & SESSION & PLATFORM`; `call(name, input, signal?) -> apiFetch('/api/actions/<name>', POST)`. No user/team/org action exists.

### 0.5 `changes` rows

`appendChange` lives in `layers/core-api/changes/src/changes-repository.ts:18` (`@hyperidle/changes`, 46 lines), same-transaction insert; `listChanges(db, {object?, objectId?, after?})`. Table `framework/db/src/schema.ts:574–598`: CHECK `changes_object_ck: object in ('task','thread','document','user')` — **`user` already admitted**; `changes_kind_ck: kind in ('created','changed','message')`.

## 1. Packages

### 1.1 `layers/core-api/users` — `@hyperidle/users` — production 736 lines

`index.ts` 38 · `user-store.ts` 177 · `invite-code.ts` 138 · `upgrade-token-store.ts` 137 · `login-session.ts` 125 · `factory-writers.ts` 66 · `runnable-agent.ts` 55. Tests 175.

Tables owned (`tools/governance/table-owners.json`): `users`, `loginSessions`, `inviteCodes`.

Exports (20): `insertUserIfAbsent`, `listFactoryAgents`, `setAgentsStatus`, `claimInvite`, `createInvite`, `createLoginSession`, `revokeLoginSession`, `validateBearerToken`, `AgentNotRunnableError`, `requireRunnableAgent`, `createUpgradeTokenStore`, `findUser`, `getOrCreateUser`, `insertUser`, `listUsers`, `updateUser`; types `UserFilter` (`id, ids, kind, teamIds, role, status, nameContains, excludeId, ownerUserId, orderById`), `UpgradeTokenStore`.

Production importers (20): `core-api/src/{app, boot, middleware/auth, bootstrap/factory-state, actions/compose}.ts`, `routes/{users, org, teams-routes, agents, agent-profile, auth, recipients, routines-routes, filesystems, ws}.ts`, `services/{agent-health-session-end-reactions, agent-run-admission-reactions, routine-scheduler-bindings, task-run-resolver-bindings}.ts`, `tools/eval/src/provision-harness.ts`. Test importers 20.

### 1.2 `layers/core-api/org` — `@hyperidle/org` — production 675 lines

`index.ts` 54 · `scaffold-agents.ts` 205 · `team-lookup.ts` 129 · `org-edges.ts` 104 · `resolve-scaffold-specs.ts` 84 · `ports.ts` 57 · `org-routing.ts` 42. Test `org-routing.integration.test.ts` 231.

Tables owned: `teams`, `orgEdges`. Exports: `listOrgEdges`, `upsertOrgEdge`, `deleteOrgEdge`; `resolveReviewRecipients`; `OrgUserDirectory`; `resolveAgentScaffoldSpecs`; `persistScaffoldedAgents`; `createTeam`, `getTeam`, `listTeams`, `updateTeam`.

Production importers (10): `actions/compose.ts`, `routes/{org, teams-routes, users, agents, agent-profile, routines-routes, search}.ts`, `services/{agent-health-session-end-reactions, agent-orchestration-port-composition, routine-scheduler-bindings, task-run-resolver-bindings}.ts`, `tools/eval/src/provision-harness.ts`. Test importers 5.

### 1.3 `layers/core-api/settings` — `@hyperidle/settings` — production 3173 lines

`platform-actions.ts` 862 · `plugin-installer.ts` 701 · `plugin-manifest.ts` 602 · `plugin-configuration.ts` 406 · `server-config.ts` 235 · `plugin-contributions.ts` 174 · `plugin-fetch.ts` 121 · `index.ts` 72. Tests 1898.

Tables owned: `serverConfig`, `plugins`, `pluginConfigurationDefaults`, `pluginContributions`, `configurationOverrides`. Production importers (7): `core-api/src/{app, boot, actions/compose}.ts`, `routes/{harnesses, agent-behavior-config-impl}.ts`, `services/{routine-scheduler-bindings, task-run-resolver-bindings}.ts`, `tools/eval/src/provision-harness.ts`.

**No separate "setup" package.** Setup = `routes/users.ts` `createUserSetupRoute` (pre-auth), `routes/teams-routes.ts` `POST /`, `bootstrap/factory-state.ts` (64), and UI `SetupFlow.tsx`.

### 1.4 Registration

`vitest.config.ts` PROJECTS includes `layers/core-api/org` (28), `users` (29), `settings` (31). `knip.json` no explicit entries (glob). `table-owners.json`: 28 tables, all owned, owner = package name.

## 2. Tables (`framework/db/src/schema.ts`, 1459 lines)

### 2.1 `teams` (27–51) — owner `org`
`id` PK (`team-<uuid>`) · `name` NOT NULL · `phase` NOT NULL (`build`; `archive` = dissolved) · `briefPath`, `architecturePath`, `brandPath`, `principlesPath`, `factoryDbPath` (only `factoryDbPath` written = repoPath from setup) · `createdAt` · `leadAgentId` (folded from dissolved `team_members`, AU44 B1) · `capacity` int NOT NULL DEFAULT 5 (WIP limit) · `formedAt`.

### 2.2 `users` (53–94) — owner `users`
`id` PK · `kind` NOT NULL DEFAULT `'ai'` (`human`|`ai`) · `name` NOT NULL · `teamId` → `teams.id` RESTRICT, **nullable** · `role` NOT NULL free string · `status` NOT NULL (`active`/`retired`) · `email` · `avatarUrl` · `createdAt` · `agentCategory` (`team`|`individual`, NULL for humans/system) · `ownerUserId` → `users.id` SET NULL.
CHECK `users_belonging_ck`: `ownerUserId IS NULL OR (kind='ai' AND teamId IS NULL)` — **an owned agent may never have a team.** No column for harness, model, prompt, skills, settings, subscriptions, password.

### 2.3 `agent_run_config` (126–147) — owner `run-orchestration` (other layer)
`agentUserId` PK → users CASCADE · `harnessType` · `modelId` · `modelProvider` · `maxConcurrentSessions` int DEFAULT 1 · `modelOptionsJson`. Absent row ≡ all-null. `system_prompt_path` and `skills` dropped, not moved (AU26 G1 lore: do not resurrect).

### 2.4 `org_edges` (837–853) — owner `org`
`id` · `fromUserId` → users CASCADE · `mechanism` (`direct`|`function`|`team`) · `target` (no FK; user id / role string / team id) · `createdAt`. Unique `(fromUserId, mechanism, target)`.

### 2.5 `filesystems` (1037–1066) / `filesystem_injections` (1076–1098) — owner `filesystems`
`filesystems`: `id` · `teamId` NOT NULL → teams RESTRICT · `source` · `kind` · `connectionId` (plain text) · `resourceRef` JSON · `writeback` · `state` DEFAULT `attached` · `createdAt`. **Team-scoped.** `filesystem_injections`: PK `(agentUserId, filesystemId)` + `createdAt`. Per-agent.

### 2.6 `service_connections` (1387–1417) — owner `connections`
`id` (`sc-<uuid>`) · **`userId` NOT NULL → users CASCADE** · `service` · `authSource` (`token`|`mcp`) · `encryptedToken` (AES-256-GCM) · `serverUrl` · `health` DEFAULT `needs-attention` · `lastValidatedAt` · timestamps. Unique `(userId, service, authSource)`. **The only per-user table in the census.**

### 2.7 `server_config` (1112–1119) — owner `settings`
Singleton `id="default"` · `config` JSON blob. Zod: `{ notifications: { mutedTypes: string[], delivery: { enabled, smtpHost, smtpPort, smtpSecure, smtpUsername, smtpFrom } }, harnessDisabled: string[] }`. **Mutes are global.**

### 2.8 Plugin tables (1122–1268) — owner `settings`
`plugins` (`state`, `scopeKind` factory|team DEFAULT factory, `scopeTeamId`, …) · `plugin_configuration_defaults` (kind `agent|skill|routine|tool|mcp_server|harness_descriptor`) · `plugin_contributions` (kind `agent|routine|document|configuration_default`, `entityId`, `detachedAt`) · `configuration_overrides` (`defaultId`, `kind`, `key`, `userValueJson`, `state`, `createdByUserId` → users SET NULL; **UNIQUE `(kind, key)` — global despite the user column**).

### 2.9 Auth tables — owner `users`
`login_sessions` (1271–1293): `id`, `userId` CASCADE, `tokenHash` UNIQUE, `expiresAt`, `createdAt`, `revokedAt`. `invite_codes` (1297–1315): `id`, `code` UNIQUE, `createdBy`, `claimedBy`, `role` DEFAULT `member`, `expiresAt`, `createdAt`.

### 2.10 Where `teamId` appears
`tasks.teamId` NOT NULL RESTRICT (171–173, indexed) · `agentSessionRequests.teamId` nullable (340) · `filesystems.teamId` NOT NULL (1043) · `plugins.scopeTeamId` (1130) · `users.teamId` nullable (62). **threads, messages, documents, sessions carry no teamId.** Documents scope via `scopeKind`/`scopeId` (default `factory`) + `parentKind`/`parentId`.

### 2.11 Column vs table summary

| Concept | Shape today |
|---|---|
| user identity | columns on `users` |
| team membership | `users.teamId` column |
| agent belongs to a person | `users.ownerUserId` |
| agent run config (harness/model/options/concurrency) | separate table `agent_run_config`, other layer |
| agent prompt/identity | a document row (`slot='agent_file'`, `parentKind='agent'`) |
| agent skills | document rows (`slot='skill'`/`'rule'`) |
| org edges | `org_edges` |
| connections | `service_connections`, per user |
| filesystems | per team + per-agent injection table |
| plugin contributions | separate table |
| user settings | **do not exist** — only global `server_config` + global `configuration_overrides` |

## 3. Live routes (all under `/api`)

| Route | file:line | UI production callers | UI tests | e2e | api tests |
|---|---|---|---:|---:|---:|
| `POST /users` (setup, pre-auth, app.ts:326) | `routes/users.ts:86` | `SetupFlow.tsx:251` | 6 | 5 | 10 |
| `GET /users` | `users.ts:214` | — | | | |
| `GET /users/:id` | `users.ts:227` | — | | | |
| `PATCH /users/:id` | `users.ts:241` | `SettingsProfile.tsx:67` | | | |
| `GET /agents/:id/profile` | `agents.ts:156` | `useAgentProfile.ts:39` | 12 | 13 | 15 |
| `GET /agents` | `agents.ts:167` | `useAgents.ts:36`, `SettingsAgents.tsx:186`, `AssistantOverlay.tsx`, `useTeamAgents`, `AgentDetailPane` | | | |
| `POST /agents` | `agents.ts:220` | `SettingsAgents.tsx:340`, `AgentAddDialog.tsx:97` | | | |
| `PATCH /agents/:id` | `agents.ts:329` | `SettingsAgents.tsx:271` | | | |
| `DELETE /agents/:id` | `agents.ts:416` | `SettingsAgents.tsx:393` | | | |
| `GET /org` | `org.ts:99` | `SettingsOrgChart.tsx:111`, `SettingsAgents.tsx:188`, `SettingsFilesystems.tsx:77` | 7 | 3 | 4 |
| `PUT /org/edges` | `org.ts:121` | `SettingsOrgChart.tsx:153` | | | |
| `DELETE /org/edges/:id` | `org.ts:177` | `SettingsOrgChart.tsx:129` | | | |
| `GET /org/teams/:teamId` | `org.ts:190` | — (CoreApiPort seam) | | | |
| `GET /org/teams/:teamId/membership` | `org.ts:200` | — (seam) | | | |
| `POST /org/teams` | `org.ts:217` | — (seam) | | | |
| `POST /org/scaffold-request` | `org.ts:230` | — (seam) | | | |
| `GET /teams` | `teams-routes.ts:144` | `useTeams.ts:34`, `FirstRunRedirect.tsx:27` | 14 | 30 | 13 |
| `POST /teams` | `teams-routes.ts:239` | `SetupFlow.tsx:286` | | | |
| `PATCH /teams/:teamId` | `teams-routes.ts:448` | — | | | |
| `GET /teams/:teamId` | `teams-routes.ts:495` | `useTeam.ts:47` | | | |
| `GET /recipients` | `recipients.ts:39` | `useRecipients.ts:114` | 1 | 1 | 1 |
| `GET /connections` | `agent-orchestration/src/routes/connections.ts:218` | `SettingsConnections.tsx:370` | 1 | 1 | 2 |
| `POST /connections` | `connections.ts:252` | `SettingsConnections.tsx:106` | | | |
| `DELETE /connections/:id` | `connections.ts:352` | `SettingsConnections.tsx:392` | | | |
| `POST /connections/:id/validate` | `connections.ts:386` | — | | | |
| `POST /filesystems` | `agent-orchestration/src/routes/filesystems.ts:171` | `SetupFlow.tsx:350` | 5 | 1 | 2 |
| `POST /filesystems/inspect-path` | `filesystems.ts:234` | `SetupFlow.tsx:218,325` | | | |
| `GET /filesystems` | `filesystems.ts:244` | `SettingsFilesystems.tsx:94`, `SettingsAgents.tsx:172,233` | | | |
| `GET /filesystems/:id` | `filesystems.ts:277` | — | | | |
| `DELETE /filesystems/:id` | `filesystems.ts:291` | — | | | |
| `DELETE /filesystems/:id/injections/:agentUserId` | `filesystems.ts:306` | `SettingsAgents.tsx:312` | | | |
| `POST /filesystems/:id/injections` | `core-api/src/routes/filesystems.ts:59` | `SettingsAgents.tsx:304` | | | |
| `GET /harnesses` | `harnesses.ts:80` | `SettingsHarnesses.tsx:177`, `SettingsAgents.tsx:187`, `SetupFlow.tsx:165`, `AgentEditor` | 12 | 3 | 5 |
| `POST /harnesses/redetect` | `harnesses.ts:87` | `SettingsHarnesses.tsx:196` | | | |
| `GET /settings/agent-behavior/config` | `settings-agent-behavior.ts:26` | `SettingsAgentBehavior.tsx:78` | 1 | 1 | 1 |
| `PATCH /settings/agent-behavior/config/:id` | `settings-agent-behavior.ts:38` | `SettingsAgentBehavior.tsx:133` | | | |
| `GET /auth/me` (PLUMBING) | `auth.ts:57` | `useCurrentUser.ts:48`, `FirstRunRedirect.tsx:26` | 20 | 9 | 4 |
| `POST /auth/ws-token` (PLUMBING) | `auth.ts:85` | ws client | | | 4 |
| `POST /auth/worker-token` (PLUMBING) | `auth.ts:112` | — | | | 2 |

Consumer totals: **192 files repo-wide** contain one of these URL strings; ~25 core-ui production files; **74 Playwright specs** under `layers/core-ui/__e2e__/` and ~60 integration tests hit routes by URL string. Heaviest: `AO1-filesystems.integration.test.ts` (60 hits), `AN1-connections` (55), `X3-agents` (52), `P2-org-routes` (33), `AH4-org-edge` (30).

### 3.1 `LEGACY_ROUTES` verbatim (`tools/governance/src/rules/actions-projected.ts:145–198`, 51 entries)

```
layers/agent-execution/harness-registry/src/mcp/mcp-route.ts|ALL /mcp/:token
layers/agent-orchestration/run-orchestration/src/worker-ingress.ts|GET /ws/worker
layers/agent-orchestration/src/routes/connections.ts|GET /
layers/agent-orchestration/src/routes/connections.ts|POST /
layers/agent-orchestration/src/routes/connections.ts|DELETE /:id
layers/agent-orchestration/src/routes/connections.ts|POST /:id/validate
layers/agent-orchestration/src/routes/filesystems.ts|POST /
layers/agent-orchestration/src/routes/filesystems.ts|POST /inspect-path
layers/agent-orchestration/src/routes/filesystems.ts|GET /
layers/agent-orchestration/src/routes/filesystems.ts|GET /:id
layers/agent-orchestration/src/routes/filesystems.ts|DELETE /:id
layers/agent-orchestration/src/routes/filesystems.ts|DELETE /:id/injections/:agentUserId
layers/core-api/src/routes/agents.ts|GET /:id/profile
layers/core-api/src/routes/agents.ts|GET /
layers/core-api/src/routes/agents.ts|POST /
layers/core-api/src/routes/agents.ts|PATCH /:id
layers/core-api/src/routes/agents.ts|DELETE /:id
layers/core-api/src/routes/filesystems.ts|POST /:id/injections
layers/core-api/src/routes/harnesses.ts|GET /
layers/core-api/src/routes/harnesses.ts|POST /redetect
layers/core-api/src/routes/notifications-routes.ts|GET /inbox
layers/core-api/src/routes/notifications-routes.ts|POST /seen
layers/core-api/src/routes/notifications-routes.ts|POST /:id/read
layers/core-api/src/routes/notifications-routes.ts|GET /mute
layers/core-api/src/routes/notifications-routes.ts|PUT /mute/:key
layers/core-api/src/routes/org.ts|GET /
layers/core-api/src/routes/org.ts|PUT /edges
layers/core-api/src/routes/org.ts|DELETE /edges/:id
layers/core-api/src/routes/org.ts|GET /teams/:teamId
layers/core-api/src/routes/org.ts|GET /teams/:teamId/membership
layers/core-api/src/routes/org.ts|POST /teams
layers/core-api/src/routes/org.ts|POST /scaffold-request
layers/core-api/src/routes/recipients.ts|GET /
layers/core-api/src/routes/routines-routes.ts|GET /event-types
layers/core-api/src/routes/routines-routes.ts|POST /
layers/core-api/src/routes/routines-routes.ts|GET /
layers/core-api/src/routes/routines-routes.ts|DELETE /:id
layers/core-api/src/routes/routines-routes.ts|GET /:id
layers/core-api/src/routes/routines-routes.ts|PATCH /:id
layers/core-api/src/routes/routines-routes.ts|POST /:id/trigger
layers/core-api/src/routes/search.ts|GET /
layers/core-api/src/routes/settings-agent-behavior.ts|GET /config
layers/core-api/src/routes/settings-agent-behavior.ts|PATCH /config/:id
layers/core-api/src/routes/teams-routes.ts|GET /
layers/core-api/src/routes/teams-routes.ts|POST /
layers/core-api/src/routes/teams-routes.ts|PATCH /:teamId
layers/core-api/src/routes/teams-routes.ts|GET /:teamId
layers/core-api/src/routes/users.ts|POST /
layers/core-api/src/routes/users.ts|GET /
layers/core-api/src/routes/users.ts|GET /:id
layers/core-api/src/routes/users.ts|PATCH /:id
layers/core-api/src/routes/ws.ts|GET /ws
```

`PLUMBING_ROUTES` (82–104, 19 entries): `auth.ts|GET /me`, `POST /ws-token`, `POST /worker-token`, the two `/health` pairs, 14 agent-orchestration seam doors incl. `GET /run-config/:agentId`, `POST /run-config/batch`, `PATCH /run-config/:agentId`, `GET /filesystems/:id/team`.

## 4. Legacy agent tools

`LEGACY_TOOLS` (`actions-projected.ts:209–215`): `add_agent`, `create_routine`, `create_team`, `update_routine`, `return_status`.

| Tool | Declared at |
|---|---|
| `create_team` | `layers/agent-orchestration/tool-handlers/src/tool-definitions.ts:57` |
| `add_agent` | `tool-definitions.ts:146` |
| `create_routine` | `tool-definitions.ts:225` |
| `update_routine` | `tool-definitions.ts:324` |
| `return_status` | `layers/agent-execution/harness-registry/src/return-status-tool.ts:110` (157 lines; plumbing twin, never an object action) |

`tool-handlers` production: `tool-definitions.ts` 400, `ports.ts` 207, `tool-types.ts` 80, `tool-registry.ts` 78, `index.ts` 35 = **800 lines**. Tests: `create-team.integration.test.ts` 226, `return-actions.closure.test.ts` 172, `tool-handlers-completeness-contract.test.ts` 148, `tool-registry.test.ts` 70, helpers 106. Wiring: `layers/agent-orchestration/src/services/tool-handlers-bindings.ts`. `create_team` reaches core through `CoreApiPort.org.*` seams (`POST /org/teams`, `POST /org/scaffold-request`, `PATCH /teams/:teamId`).

## 5. UI surfaces

### 5.1 Setup / onboarding
`pages/SetupFlow.tsx` 612 — `GET /harnesses` (165), `POST /filesystems/inspect-path` (218, 325), `POST /users` (251), `POST /teams` (286), `POST /filesystems` (350). `pages/FirstRunRedirect.tsx` 55 — `GET /auth/me`, `GET /teams`. `router.tsx` 120 — `/setup` at 48, `FirstRunRedirect` as index at 55.

### 5.2 Settings — `pages/SettingsPage.tsx` (181), 12 stacked sections

| # | Section | Component | Lines | Routes | Category |
|---:|---|---|---:|---|---|
| 1 | Profile | `SettingsProfile.tsx` | 132 | `PATCH /users/:id` | pure user attribute |
| 2 | Org chart | `SettingsOrgChart.tsx` | 502 | `GET /org`, `PUT /org/edges`, `DELETE /org/edges/:id` | user/org |
| 3 | Agents | `SettingsAgents.tsx` | 557 | agents CRUD, `/harnesses`, `/org`, `/filesystems?…`, injections | agents |
| 4 | Skills & rules | `SettingsSkillsAndRules.tsx` 28 + `DocumentSlotList.tsx` 255 | | `call(search_documents/edit_document)` | **already on actions** |
| 5 | Agent behavior | `SettingsAgentBehavior.tsx` | 379 | `GET/PATCH /settings/agent-behavior/config` | platform |
| 6 | Plugins | `SettingsPlugins.tsx` | 463 | `call(search_plugins/edit_plugin)` | **already on actions** |
| 7 | Filesystems | `SettingsFilesystems.tsx` | 180 | `GET /org`, `GET /filesystems?teamId=` | team-scoped |
| 8 | Agent backends | `SettingsHarnesses.tsx` | 342 | `GET /harnesses`, `POST /harnesses/redetect` | platform/machine |
| 9 | Connections | `SettingsConnections.tsx` | 480 | connections CRUD | pure user attribute |
| 10 | Appearance | `SettingsAppearance.tsx` | 107 | none (localStorage) | client-local |
| 11 | Notifications | `SettingsNotifications.tsx` 66 + `useNotificationMute.ts` 66 | | `GET/PUT /notifications/mute` | **global** server_config |
| 12 | Backend + Worker | `SettingsBackend.tsx` 63 + `SettingsWorker.tsx` 278 | | none (Electron bridge) | desktop-only |

Supporting: `AgentEditor.tsx` 479, `harness-presentation.ts` 188, `settings-types.ts` 127, `agent-model-options.ts` 101, `model-options-for-harness.ts` 60, `role-options.ts` 24. Stories 7 files / 1811 lines.

`SETTINGS_SECTIONS` (`settings-types.ts:58`) is dead: 9 stale ids, 0 production consumers (`grep -a` on AppShell = 0), only `pages/__tests__/settings-agent-behavior.test.tsx:221`.

### 5.3 Team / org / agent / people surfaces
`pages/WorkTeam.tsx` 850 (`useTeam`, `useTeamAgents` 44, `useRosterRunState`) · `pages/AgentProfile.tsx` 745 (`useAgentProfile`, `useAgentRunState` 331, `useCurrentUser`) · `pages/AgentAddDialog.tsx` 239 (`POST /agents`) · `pages/work/AgentDetailPane.tsx` 240 · `components/RecipientPicker.tsx` 231 (`useRecipients` 157 → `GET /recipients`; sends via `call("send_message")`) · hooks `useTeams` 60 / `useTeam` 73 / `useTeamAgents` 44 / `useAgents` 66 / `useAgentProfile` 74 / `useCurrentUser` 91 / `useRecipients` 157 · `ds/Avatar.tsx` 84 · `shell/AssistantOverlay.tsx` 665 (`GET /agents` for `ownerUserId === me`) · `layouts/AppShell.tsx` 1059.
`useCurrentUser` consumers (11 files): AppShell, WorkTaskPage, DocumentDetail, AgentProfile, Conversations, AssistantOverlay, ReviewPage, DocumentCreate, ScopeChangeDialog, SettingsProfile.

## 6. Auth / identity

`layers/core-api/src/middleware/auth.ts` (262), `createAuthMiddleware({db, sharedMode, apiKey?})`:
1. shared mode: `Authorization: Bearer` → `validateBearerToken` → `userId`, `authMethod="login_session"`.
2. API key: `X-API-Key` constant-time vs `HYPERIDLE_API_KEY`; actor = header `x-hyperidle-actor-id` **verbatim, no lookup** (`CORE_API_ACTOR_OVERRIDE_HEADER`, `framework/api-contract/src/core-api-port.ts:257`) else `findUser(db, {kind:"human"})` first human else `"u-founder"`.
3. local mode: X-API-Key only.
MCP: `actions-as-tools.ts` `actor = ctx.agentId` + `caller {sessionId, taskId, threadId}`; token → sessionId in `mcp-route.ts:82–108`. WS: `POST /auth/ws-token` mints a 60 s single-shot token (in-memory store).
Desktop sign-in: none. `main.ts:838 readOrGenerateApiKey` → `process.env.HYPERIDLE_API_KEY` (436) → `--api-key=` into renderer (495), `preload.ts:14`. Local mode = "the one human row is you".

`GET /auth/me` (`auth.ts:57–80`) returns `{id, name, email, avatarUrl, teamId}` — **teamId is sent** (`userRow?.teamId ?? null`). No-db branch returns literal Founder.

**Does a human have a team? No, on no path.** `POST /users` (users.ts:134–142) inserts no teamId; `POST /teams` writes a founder→team **org edge** (312–320) but never `users.teamId`; `PATCH /users/:id` accepts only name/email; `updateUser` "deliberately not extended" for belonging (schema lore 77–84); demo seed `tools/setup/src/demo-world/cast.ts:39–50` Maya Chen has no teamId; agent specs do (line 89). Live consequences: `compose.ts:53–63` `soleHumanForAgent` always falls to "any human, oldest first"; `org-routing.ts` always falls to "all humans".

## 7. Team

### 7.1 Dependencies beyond membership
| Dependency | Where | Strength |
|---|---|---|
| `tasks.teamId` | schema:171 NOT NULL RESTRICT | hard |
| `filesystems.teamId` | schema:1043 NOT NULL RESTRICT | hard |
| `agentSessionRequests.teamId` | schema:340 nullable | soft |
| `plugins.scopeKind='team'` + `scopeTeamId` | `plugin-installer.ts:282, 357, 469, 501, 515` | live |
| `users.teamId` | schema:62 | membership |
| org edge `mechanism='team'` | `org_edges` | written by `POST /teams` |
| `document.openParent` reads `task.teamId` | `compose.ts:175` | via task |
| threads / messages / documents / sessions | no teamId | none |
`ThreadActionsDeps`, `TaskActionsDeps`, `DocumentActionsDeps` each take `org: { getTeam }` (compose.ts:84, 117, 211).

### 7.2 What `POST /teams` does (`teams-routes.ts:239–435`)
1. same-name guard → 200 existing; 2. `createTeam` (phase `build`, `factoryDbPath`=repoPath, capacity 5); 3. `resolveAgentScaffoldSpecs({trigger:"team_scaffold"})` → **one spec** `{role:"agent", name:"<Team> Agent", agentCategory:"team", systemPrompt:null}`; 4. `persistScaffoldedAgents` → user row + `agent_run_config` (via seam) + identity document; 5. `updateTeam({leadAgentId})`; 6. best-effort founder→team org edge; 7. `team_created` event; 8. best-effort welcome message via `sendMessage` (ensures `ast-<userId>` assistant).

**`AGENT_ROLE_CATALOG` no longer exists** (deleted BA9g). Role is a free string; `role-options.ts` (24) and `AgentAddDialog.tsx:54` carry tombstones. System-prompt templates gone from org: `resolve-scaffold-specs.ts` sets `systemPrompt:null` except `user_assistant` (one-sentence `APP_ASSISTANT_SYSTEM_PROMPT`, line 28). `docs/system-prompts/*.md` moved to a `role-personas` plugin. `org/src/index.ts:44` advertises a non-existent `readSystemPromptTemplateForRole`.

### 7.3 What breaks if team became "a column on users + a filter"
`tasks.teamId` and `filesystems.teamId` NOT NULL RESTRICT FKs to `teams.id`; plugin team scope keys on a team id; `teams.capacity` is the WIP limit read by `deriveTeamStatus` (`teams-routes.ts:84`); `leadAgentId`, `phase`, `factoryDbPath` have no user home; `users_belonging_ck` makes owner and team mutually exclusive; 30 e2e specs + 13 api tests hit `/api/teams` by URL.

## 8. Org edges
Module `org/src/org-edges.ts` 104 (`listOrgEdges`, idempotent `upsertOrgEdge`, `deleteOrgEdge`). Readers: `routes/org.ts:100` (org chart payload `{edges, users, teams}`), `SettingsOrgChart.tsx` (only UI, only human writer), `teams-routes.ts:315` (founder→team edge on create).
**`resolveReviewRecipients` (`org-routing.ts`, 42) no longer reads edges** (edge matrix deleted AU20) — "humans on this agent's team, else all humans" via `listHumans` port — and has **zero production callers** (route deleted BC3, tool call sites deleted with `create_item`/`submit_review`); kept alive only by barrel + its 231-line test.

## 9. Desktop and composition roots
`applications/desktop`: `main.ts` 842 (`readOrGenerateApiKey`, `bootLocalMode` 392, `--backend-mode=local`), `create-server.ts` 416 (`bootAgentExecution` 190 → `bootCoreApi` 228 → `bootAgentOrchestration` 260 → `composeApiApplication` 308–315), `boot-server.ts` 80, `migrate.ts` 65 ("does NOT seed — desktop starts with empty database", line 48). **First boot seeds no user/team.** Only server-side seed: `bootstrap/factory-state.ts` (64) — `system:propagation` user and System Agent singleton `seed-agent-cos`. `/setup` is entirely client-driven (§5.1). `applications/remote-server/src/create-server.ts` (565) mirrors the boot triple; user composition happens inside `bootCoreApi` (`layers/core-api/src/boot.ts`, 374; `createUpgradeTokenStore` 57–61; `listUsers(db,{kind:"human"})` 203).

## 10. Docs describing setup, teams, org, users, settings
`docs/guides/user/{getting-started, settings, agents, running-your-team, connections, the-interface, three-core-views, deployment, index}.md` · `docs/process-layer/{teams, the-four-primitives, wip-and-cost-limits, index}.md` · `docs/requirements/{users-and-their-modes-of-engagement, functional-requirements, usability-requirements, system-requirements}.md` · `docs/architecture/{authorization-model, as-implemented-domain-architecture, system-overview, system-boundary, credential-model, connection-model, decisions, plugins}.md` · `docs/agent-layer/{agent-model, index}.md` · `docs/ui-design/{settings-consistency, page-anatomy}.md` · `docs/information-architecture/{app-shell-always-present, index}.md` · `docs/system-prompts/{index, assistant}.md` · `docs/product/{human-ai-collaboration, index}.md` · `docs/deployment/{laptop, shared-backend, self-hosting}.md` · `docs/guides/developer/getting-started.md` · `docs/archive/{facilitators, kernel-strategy-split}.md`.

## Surprises (census agent's summary)
1. `appendChange` is `@hyperidle/changes`, not `framework/db`.
2. `changes.object` CHECK already admits `'user'`; `user.created`/`user.changed` already in the rule's `OBJECT_EVENTS`.
3. `/auth/me` sends `teamId` but **no code path ever sets `users.teamId` for a human** — always null.
4. `POST /teams` writes a founder→team org edge instead of membership.
5. `resolveReviewRecipients` has zero production callers.
6. `org_edges` read by one UI file, written by one route besides it.
7. `AGENT_ROLE_CATALOG` already deleted; a team scaffolds one nameless agent with a null prompt.
8. `SETTINGS_SECTIONS` is dead (0 consumers).
9. Of 12 Settings sections: two already on actions, three call no API, Notifications writes a global mute.
10. No per-user settings storage exists anywhere.
11. `service_connections.userId` is the only per-user FK.
12. `agent_run_config` is owned by orchestration (other layer) — reachable only via the seam; `system_prompt_path`/`skills` dropped with "do not resurrect" lore.
13. `users_belonging_ck` makes team and owner mutually exclusive.
14. Grep undercounts blast radius ~8×: 192 files carry these URLs, 74 Playwright specs, ~60 integration tests.
