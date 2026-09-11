# BA5 — phase-1 seams (repository evidence, 2026-09-11)

Working material for `## How it works`. Gathered by a planner pass at origin/main `f88b71434`. Every
claim was checked against the code; re-verify any line number before building on it.

## 1. Which agents get which filesystems
- `filesystems` (team_id, connection_id plain text no FK, resource_ref, writeback, state) and
  `filesystem_injections` keyed (agent_user_id, filesystem_id), cascade — `framework/db/src/schema.ts:1109-1164`.
- Writers: `saveInjection`/`deleteInjection` (`filesystems/src/filesystem-registry.ts:58-80`); POST via core-api
  `routes/filesystems.ts:59` (refuses agents with null teamId, :78-80) → intake `persistInjection`
  (`agent-orchestration-intake.ts:306`, port `framework/api-contract/src/agent-orchestration-port.ts:247-248`);
  DELETE `agent-orchestration/src/routes/filesystems.ts:306`.
- Readers: `listFilesystems({agentId})` join (`filesystem-registry.ts:32-38`) → spawn via
  `injected-filesystems-for-provisioning.ts:36`, wired `boot.ts:331-334`.
- UI: one component, `SettingsAgents.tsx` (:214 GET, :285 POST, :293 DELETE). Onboarding never injects.
- Team agents carry `users.team_id` (`schema.ts:62`); onboarding creates one "team" agent
  (`resolve-scaffold-specs.ts:46-57`, `teams-routes.ts:284-288`). The assistant carries `ownerUserId`
  (`schema.ts:84`) and a check constraint forces its team_id null (`:92`) — it can hold no team filesystem.
- The spawn already knows the agent's team: `BakedAgentRunnableConfig.teamId` (`work-intent.ts:132`), read at
  `provisioner.ts:1084`. `listFilesystems({teamId})` exists (`filesystem-registry.ts:40-41`).
- Team-reach would delete: the injections table, save/delete injection, the core-api injection route, the intake
  persist route and its two port members, the `?agentUserId` branch, the SettingsAgents picker.

## 2. Where the credential resolves
- `mountFilesystemsForAgent` takes `{agentId, filesystems, sandboxPath, mounter}` (`filesystem-provisioning.ts:86-91`).
- Provisioner deps already hold `serviceConnectionResolver.resolve(userId, connectionId)`
  (`provisioner.ts:122-124`), built at `boot.ts:335-338` → `resolveHeldToken`. DI is legal within a layer
  (`governance-model.ts:295-296`); both services are agent-orchestration.
- **Whose user:** `resolveHeldToken` filters by user (`service-connection-resolver.ts:44`); a filesystem row has
  no user. At spawn only the oldest human is known (`core-api/src/boot.ts:174-190`).
- Filesystems are read live at spawn and never ride `payload_json` (asserted
  `admit-session-live-filesystems.integration.test.ts:18-20`).

## 3. How the agent's own push authenticates
- A token clone persists nothing: runner passes it only as per-process `GIT_CONFIG_*` env
  (`git-runner.ts:327-332`). Verified live with git 2.39.5 — `.git/config` holds only the plain URL.
- Every token connection held by the oldest human already reaches every session's env (`boot.ts:311-326`):
  github → `GH_TOKEN`/`GITHUB_TOKEN` (`connection-provisioning.ts:190-196`), others → `<SERVICE>_TOKEN` (:221-223),
  via `mcpTokenEnv` outside the allowlist (`cli-harness-adapter.ts:648-652`, resume :1208). **git reads none of them.**
- No credential helper configured anywhere. All four harnesses pass `HOME` through (`adapter-pool.ts:407,464,551,582`),
  so the agent's git reads the user's own `~/.gitconfig`; push works only if that machine is set up.
- Nearest mechanism: `GIT_CONFIG_COUNT/KEY_n/VALUE_n` extra-header env (`git-runner.ts:307-311`, header built
  `filesystem-reachability.ts:46-55`) carried by `mcpTokenEnv` — values in env, no file written.

## 4. The two git adapters
- Clone `mounter.ts:128-141`: `clone(repo, branch, {depth:1})` into the workspace root. Worktree `:143-168`:
  `worktreeAdd(sandboxPath, "agent/<basename>", {createBranch:true})` off the real repo — **branches from HEAD,
  ignores `ref.branch`** (:151).
- Selection `:260-272`: connection → clone; local path → worktree; **else throw** — so a public remote URL with
  no connection cannot mount at all (:268).
- `resourceRef` = `{kind, repo, branch}` only; no "worktree wanted" field.
- Teardown is plain `rm -rf` (`transition-run.ts:253`, `local-sandbox-adapter.ts:74`); `worktreeRemove` has no
  production caller (`git-runner.ts:360`) → stale `.git/worktrees/<id>` + `agent/…` branch left in the real repo.
- Everything mounts at the workspace root: a second code filesystem collides; a resumed session adopts its old
  directory (`provisioner.ts:1190`) which already has `.git`, so both adapters fail (`mounter.ts:314-318`).

## 5. A real check for a token connection
- `validate` only decrypt-round-trips (`routes/connections.ts:396-401`); no UI caller.
- `service` is free text; only `"github"` special-cased. A token row has no URL — it knows no host.
- The only live proof is the reachability probe: authenticated `lsRemote` (`filesystem-reachability.ts:38-62`),
  `owner/repo` → github.com (:126-130), run on register and inspect. **It skips every `writeback: "none"` row —
  every onboarding row — so none is ever probed.**

## 6. Failure surfacing
- `filesystems` + `filesystemInjections` are owned by the `filesystems` service (`tools/governance/table-owners.json:37-38`);
  run-orchestration may not write them. A boot-wired port (same shape as the reader) is the seam;
  `updateFilesystemState` is already exported (`filesystems/src/index.ts:17`). No reason column.
- Mounting (`provisioner.ts:1236`) runs before prompt assembly (:1524-1541), but `assemblePrompt` has fixed
  sections (`context.ts:381-405`) and the workspace section is static (:352-363). **The prompt never names what
  was mounted** — `mountedFilesystems` is used only for trusted paths (`provisioner.ts:1616`).

## 7. Creating a filesystem against a connection
- `POST /api/filesystems` body (`routes/filesystems.ts:70-82`): teamId, kind code|doc_set, connectionId?,
  resourceRef, **required** writeback git|file|none, sourceHint?.
- Reusable: `AddConnectionDialog` (`SettingsConnections.tsx:90`, not exported; DS Dialog/Select/Input);
  `inspect-path` route (:234) already used by SetupFlow. List shows raw `connectionId` (`SettingsFilesystems.tsx:169`).
- `writeback`'s only behavioural reader is the probe short-circuit (`filesystem-reachability.ts:78`).

## 8. Proof harness
- Mount tests: `admit-session-live-filesystems` (fake mounter), `filesystem-provisioning`, `git-clone-adapter`
  (local path, fake connectionId, no token), `git-worktree-adapter`, `local-folder-adapter`,
  `git-worktree-live-proof` (skips without origin/main), `mounter-registry`, `boot-provisioning-wiring`,
  core-api `filesystems-added-after-emit`.
- No git HTTP server exists. `git-http-backend` is in the local exec-path (2.39.5); CI unverified. Precedent for a
  local authenticated server: `AN2-connection-provisioning.integration.test.ts:208-215`. The extra header keys on
  an http(s) host, so `file://` cannot prove authentication.

## 9. Task versus session — the flow (planner pass 2, 2026-09-11)
- **Chain:** task → N dispatch attempts (`task_dispatch_attempts`, no reason column) → 1 work intent each →
  ≤1 session request (`agent_session_requests`, carries `error_code`/`error_message`) → ≤1 session (`sessions`,
  active|done|crashed). Task moves to `in_progress` **only** on `session_started` (`provisioner.ts:1162-1177`,
  reaction `work-session-started-reactions.ts:79`), emitted at the end of admission (Phase 7).
- **The session row exists before mounting** (`reserveOrAdoptSession`, `runtime.ts:54-97`). The comment at
  `provisioner.ts:1040-1044` claiming failures throw before the row insert is stale.
- **Existing admission-failure path** (`runtime.ts:440-491`): session → crashed (no `session_ended`), request →
  failed with errorCode/message, `agent_run_lifecycle_changed` + `agent_run_admission_failed{terminal}` emitted.
  Core: `task_run` → `markFailed(attempt)` (`agent-run-admission-reactions.ts:92-94`). **Task stays `accepted`.
  Nobody is told.** A mount failure never reaches this path today — it is caught to `console.warn`.
- **No retry after hand-off.** A revoked token fails once and goes silent. Re-dispatch = hold→accepted (occasion
  "retry", `task-state-machine.ts:211`). From `accepted` the task cannot go to `blocked`.
- **Notifications:** one shared inbox — `notification_queue` has no recipient column; `GET /inbox` shows every
  unread row (`notifications-routes.ts:132`). Popover: `NotificationPopover.tsx`. Producers: `notification`
  event listener (`notifications/src/install.ts:469-509`) or direct enqueue. Admission failures emit no
  `session_ended`, so the 3-crashes-in-7-days health notice never counts them.
- **Boundary:** orchestration → core by **event** is the established channel (clause
  `publish-anyone-but-the-bus-host`); writing a core-owned table is forbidden. `filesystems` and run-orchestration
  share a layer, so a boot-wired port between them is legal.
- **Resume trap:** a resume adopts the old workspace, which already holds `.git`; both git adapters refuse it
  (`mounter.ts:~305-318`). **Every resume of an agent with a code filesystem fails its mount today, silently.**
  Making mount failure fatal without fixing this would fail every such resume. A resume request has `taskId: null`;
  core has no reaction to a failed `session_resume` (switch `agent-run-admission-reactions.ts:78-108`).
