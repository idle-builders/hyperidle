# BA5 — The filesystem works · Architecture, phase 1

Technical restatement of `plan.md` `## How it works` for a builder who has not seen the conversation. Phase 1
only: local repository, public remote, private remote (through a `gh` login and through a PAT), folder, the
hold, the notification, Check, resume, and teardown. Google Drive / `rclone` is phase 2. This document only
keeps the placement shape open to another kind (§5.6).

Every claim about existing code cites `file:line` at origin/main `f88b71434`. Re-check a line before you build
on it. `UNVERIFIED` marks what I could not check.

**Blocker to raise before building: §11 (size).** The approved plan needs about 2,600 added lines of code.
Production and tests are both counted; deletions are not. That is well over the 1,000-line stop.

---

## 0. Map: plan behaviour → where it lives

| Plan (`## How it works`) | Obligation | Section |
|---|---|---|
| Its filesystems are the ones picked for it | Placement reads the per-agent injections live. Unchanged reader, minus write-back | §2, §5 |
| Each goes in its own named folder; git = kept copy + worktree per session on its own branch off the configured branch; folder linked in | One git adapter plus the folder adapter, named subfolders | §5 |
| The agent is told what it has | A `## Filesystems` section in `AGENTS.md` | §9 |
| Credentials are the CLIs' | `gh auth git-credential` as git's helper through env only; PAT through `GH_TOKEN`; HyperIdle stops building headers | §6 |
| Detection and Check | `POST /api/filesystems/:id/check`: git and gh installed, gh logged in, resource reachable | §7 |
| Cannot be put in place → sessions wait, task stays ready, marked *needs attention* with a reason, one notification, start after Check passes, no self-retry | `waiting` request status, park and release, attention columns, one event, one core subscriber | §4, §8 |
| A resumed session reuses its workspace | Adapter recognises an already-placed folder | §5.4 |
| Session end removes the worktree, keeps the branch | `unmount` at the three teardown sites | §5.5 |
| Surfaces: *Add filesystem* dialog, *Check*, *needs attention* + reason + missing CLI, inbox notification | UI in `SettingsFilesystems.tsx`; onboarding picks the filesystem for its agent | §10 |
| Goes away: both git adapters, write-back, unused connection check | Scan-driven deletions | §12 |

---

## 1. Change boundary

Everything happens in the agent-orchestration layer, plus one core-api subscriber, one framework event, one
domain-model status value, and core-ui.

- **agent-orchestration / run-orchestration** (`layers/agent-orchestration/run-orchestration/src/`): mount
  engine (`mounter.ts`), placement orchestration (`filesystem-provisioning.ts`), admission and teardown
  (`provisioner.ts`), hold handling (`runtime.ts`, `start-runtime.ts`, `errors.ts`), Check, the credential env
  builder, and the instructions section.
- **agent-orchestration / filesystems** (`.../filesystems/src/`): state columns and their writers. The
  reachability probe is deleted.
- **agent-orchestration / session-requests** (`.../session-requests/src/service.ts`): the `waiting` status,
  plus park and release.
- **agent-orchestration / connections** (`.../connections/src/`): resolve a token as the connection's owner.
  The validate route is deleted.
- **agent-orchestration layer root** (`layers/agent-orchestration/src/`): git runner, `gh` status probe,
  routes, boot wiring.
- **core-api**: `services/filesystem-attention-reactions.ts` (new), registration in `service-bootstrap.ts`, and
  `agentIds` in the team-creation response.
- **framework**: `event-bus/src/events.ts` (one event), `domain-model/src/session-request.ts` (one status),
  `domain-model/src/team.ts` (one response field), `db` (schema plus migration 0082).
- **core-ui**: `settings/SettingsFilesystems.tsx` (+ stories), `pages/SetupFlow.tsx`.

Not touched: harness adapters (they already pass `HOME`: `adapter-pool.ts:407,464,540`; and merge
`mcpTokenEnv` outside the allowlist: `cli-harness-adapter.ts:648-652`, resume `:1208`), the MCP bridge,
artifact isolation, the injection table and its routes (the per-agent mapping survives).

---

## 2. Contracts

Owner, shape, and the governance fact that makes each crossing legal. `npm run lint` is the authority. The
cited precedents are existing imports of the same shape, not a restated rule.

### 2.1 Framework

**`framework/event-bus/src/events.ts`: new event** (add to the `DomainEvent` union and `EVENT_TYPES`,
`events.ts:640-668`):

```ts
export interface FilesystemNeedsAttentionEvent {
	readonly type: "filesystem_needs_attention";
	readonly streamId: string;        // `filesystem:${filesystemId}`
	readonly filesystemId: string;
	readonly filesystemLabel: string; // repo URL / local path / folder path, passed through redactSecrets
	readonly agentId: string;         // the agent whose session was held first in this episode
	readonly reason: string;          // what to fix, plain words, redacted
	readonly timestamp: number;
}
```

Published by agent-orchestration (boot wiring, §4.4). Subscribed by core-api (§8). Clause
`publish-anyone-but-the-bus-host` (`tools/governance/src/lib/governance-model.ts:280`): agent-orchestration is
not the framework, so it may publish. Cross-layer conversation over the bus is the sanctioned channel (the
`wire-within-one-layer` rationale, `governance-model.ts:330`). No registry edit. See §12.7 for the
`typesModule` drift.

**`framework/domain-model/src/session-request.ts:35-42`**: add `"waiting"` to `AGENT_SESSION_REQUEST_STATUSES`.

**`framework/domain-model/src/team.ts:180-183`**: `CreateTeamResponse` gains `agentIds: string[]`. The
route already holds them at `teams-routes.ts:285`, and the response is built at `:429-432`. Onboarding needs the
id of the agent it just created so it can pick the filesystem for it.

### 2.2 filesystems service (`@hyperidle/filesystems`)

- `Filesystem` (`filesystem-shape.ts:15-26`), which is also the wire `FilesystemView`: drop `writeback`, add
  `attentionReason: string | null`. `state` stays `"attached" | "reachable" | "needs_attention"`.
- `listInjectedFilesystemsForProvisioning` (`injected-filesystems-for-provisioning.ts:36-49`): drop
  `writeback`, add `attentionReason`.
- New writers in `filesystem-registry.ts`. Each is one statement and the table stays owned by `filesystems`
  (`table-owners.json:37-38`):
  - `markFilesystemNeedsAttention(exec, id, reason): Promise<void>` sets `state='needs_attention'` and
    `attention_reason=reason`. It leaves `attention_notified_at` alone.
  - `claimAttentionNotice(exec, id): Promise<boolean>` runs `UPDATE … SET attention_notified_at=now WHERE
    id=? AND state='needs_attention' AND attention_notified_at IS NULL RETURNING id`. It returns true exactly
    once per episode.
  - `markFilesystemReachable(exec, id): Promise<void>` sets `state='reachable'`, `attention_reason=NULL`,
    `attention_notified_at=NULL`.
  - `listAgentIdsForFilesystem(exec, id): Promise<string[]>` reads from `filesystem_injections`.
- Deleted: `filesystem-reachability.ts` (whole file), `FilesystemTokenResolver`, and `lsRemote` from its runner
  port (`ports.ts:6-22`). Also `updateFilesystemState` if the scan shows no caller once the probe is gone.

### 2.3 session-requests service (`@hyperidle/session-requests`)

```ts
/** claimed → waiting, CAS on the claim token; clears the claim fields. */
parkClaimedRequest(db: HyperIdleDb, requestId: string, claimToken: string): Promise<boolean>;
/** waiting → pending for every waiting request of these agents; returns the count. */
releaseWaitingRequests(db: HyperIdleDb, agentIds: readonly string[]): Promise<number>;
```

Both are exported from `index.ts`. `parkClaimedRequest` joins `RuntimePorts.sessionRequests`
(`run-orchestration/src/contracts.ts:142-200`) and its composition
(`src/services/run-orchestration-composition.ts:508-517`). `claimNextRequestInternal` (`service.ts:171-194`)
already selects only `pending`, or `claimed` with an expired lease. A `waiting` row is therefore never claimed,
and no query change is needed.

### 2.4 connections service (`@hyperidle/connections`)

`resolveConnectionToken(db, connectionId, decrypt): Promise<string | null>` goes in
`service-connection-resolver.ts`. It reads the row by id, requires `authSource === "token"`, then delegates to
`resolveHeldToken(db, row.userId, connectionId, decrypt)` (`:34-57`). This is "resolved as the connection's
owner": a filesystem row has no user (seams §2). It replaces the per-request, per-user resolver in `app.ts:70-75`
and `routes/filesystems.ts:122-134`.

### 2.5 run-orchestration (`@hyperidle/run-orchestration`)

Wired to the three services above only through ports that the layer composes (existing precedent:
`provisioner.ts:110-136`, `boot.ts:295-340`).

```ts
// filesystem-provisioning.ts: replaces InjectedFilesystemsReaderPort (:67-69). Field `filesystems` on ProvisionSessionDeps.
interface FilesystemsPort {
	listForAgent(agentId: string): Promise<readonly FilesystemForProvisioning[]>; // includes state + attentionReason
	resolveCredential(connectionId: string): Promise<string | null>;               // PAT, as the connection's owner
	/** Record that this agent's session is held by this filesystem. */
	holdAgentSessions(input: {
		readonly filesystem: FilesystemForProvisioning;
		readonly agentId: string;
		readonly reason: string;
		readonly newlyBroken: boolean; // true = placement just failed (write state+reason); false = pre-check hit
	}): Promise<void>;
}

// mounter.ts: the mount engine keeps its name; the port gains unmount, loses captureBack.
interface FilesystemMounterPort {
	mount(input: {
		filesystem: Filesystem; workspacePath: string; sessionId: string;
		folderName: string; credential: string | null;
	}): Promise<MountResult>;
	unmount(mounted: MountedFilesystem): Promise<void>;
}
type MountResult = { ok: true; mounted: MountedFilesystem } | { ok: false; reason: string };
interface MountedFilesystem {
	readonly filesystem: Filesystem;
	readonly folder: string;                    // absolute: <workspace>/<folderName>
	readonly trustedPath: string;               // kept copy (git) or real folder (folder); feeds codex trust
	readonly git?: { readonly keptCopy: string; readonly branch: string; readonly base: string; readonly remote: boolean };
	readonly agentEnv: Readonly<Record<string, string>>; // §6; never persisted
	readonly adopted: boolean;                  // recognised on a resumed workspace
}

// errors.ts
class FilesystemUnavailableError extends Error { /* name "FilesystemUnavailableError"; filesystemId; reason */ }

// filesystem-check.ts (new): used by the Check route and to phrase placement-failure reasons
checkFilesystem(fs: Filesystem, deps: { credential: string | null; gitRunnerFactory; cliStatus }): Promise<FilesystemCheckResult>;
interface FilesystemCheckResult {
	readonly ok: boolean;
	readonly reason: string | null; // plain words, redacted; null when ok
	readonly clis: readonly { readonly name: "git" | "gh"; readonly installed: boolean; readonly loggedIn: boolean | null }[];
}

// git-credential-env.ts (new, pure)
gitCredentialEnv(remoteUrl: string, token: string | null): Record<string, string>; // §6
// filesystem-instructions.ts (new, pure)
describeMountedFilesystems(mounted: readonly MountedFilesystem[]): string;          // §9
```

`FilesystemForProvisioning` (`filesystem-provisioning.ts:49-59`) and the local `Filesystem`
(`mounter.ts:29-39`) drop `writeback` and add `attentionReason`.

### 2.6 Layer root (`layers/agent-orchestration/src/`)

- `git-runner.ts`: the verb changes are listed in §6.3.
- `cli-status.ts` (new): `cliStatus.gh(token: string | null): Promise<{ installed: boolean; loggedIn: boolean }>`
  spawns `gh auth status --hostname github.com` with `{PATH, HOME}`, plus `GH_TOKEN` when a token is given.
  An `ENOENT` spawn error means not installed. Exit 0 means logged in; any other exit means not logged in.
  `cliStatus.installed(name)` spawns `<name> --version`. It lives beside `git-runner.ts` because this layer
  root is where processes are spawned.
- Routes and boot wiring (§4.4, §7.3). They import the four services directly, in the same shape as the
  existing `routes/filesystems.ts:30-39` (`@hyperidle/filesystems`), `routes/agent-orchestration-intake.ts:47`
  (`@hyperidle/session-requests`), `app.ts` (`resolveHeldToken`) and `boot.ts:54,64`.

### 2.7 HTTP (`/api/filesystems`, hosted by agent-orchestration, `app.ts:76`)

| Route | Change | Request → response |
|---|---|---|
| `POST /api/filesystems` | changed | body `{ teamId, kind: "code"\|"doc_set", connectionId?: string\|null, resourceRef }` with `writeback` and `sourceHint` **removed** → `201 { filesystem: FilesystemView, check: FilesystemCheckResult }`. Rules below |
| `GET /api/filesystems?teamId=\|agentUserId=` | fields only | `{ filesystems: FilesystemView[] }` (no `writeback`, adds `attentionReason`) |
| `GET /api/filesystems/:id` | **deleted** | Its only job was the live probe (`routes/filesystems.ts:276-288`). No production caller: the scan found only `core-api/src/__tests__/AO1-filesystems.integration.test.ts` and a story comment |
| `POST /api/filesystems/:id/check` | **new** | → `200 { filesystem: FilesystemView, check: FilesystemCheckResult }` \| 404 |
| `DELETE /api/filesystems/:id` | changed | Also forgets the kept copy and releases waiting requests (§4.3) → 204 |
| `DELETE /api/filesystems/:id/injections/:agentUserId` | changed | Also releases that agent's waiting requests → 204 |
| `POST /api/filesystems/inspect-path` | unchanged | used by the dialog and onboarding |
| `POST /api/filesystems/:id/injections` (core-hosted, `core-api/src/routes/filesystems.ts:59`) | unchanged | |
| `POST /api/connections/:id/validate` | **deleted** | `routes/connections.ts:386-424` |

POST rules:

- `resourceRef.repo` is a local path (`/`, `./`, `../`, `~/`, `file://`, the existing `isLocalRepoPath` at
  `mounter.ts:181-193`) or a git URL. If an `http(s)` URL carries a username or password, reply 400: credentials
  belong in a connection, never in the URL. Otherwise the credential would reach `.git/config`, the label and the
  notification.
- `branch` must match `^[A-Za-z0-9._/-]+$` and must not start with `-`.
- `connectionId`, when given, must name a `token` connection whose `service` is `github`, and the repo must be
  an `https://github.com/` URL. Anything else gets a 400.
- `source` is derived for display only: connection or `github.com` URL → `github`; any other URL → `git`; local
  path or `doc_set` → `local`.
- After the insert, run Check and persist it (§7.3). Never notify here: no session is held.

---

## 3. Schema: migration `0082_filesystem_hold_and_attention`

Hand-written `framework/db/drizzle/0082_filesystem_hold_and_attention.sql`, plus a journal entry
`{ idx: 82, version: "7", when: <epoch ms>, tag: "0082_filesystem_hold_and_attention", breakpoints: true }`
appended after `0081_drop_items_layer` (`meta/_journal.json`), following `framework/db/drizzle/README.md`.

```sql
-- Verdicts written by the deleted reachability probe are not trustworthy
-- (it called every public remote with no connection unreachable). Drop them;
-- the first session or the first Check writes a real one.
UPDATE "filesystems" SET "state" = 'attached' WHERE "state" = 'needs_attention';
--> statement-breakpoint
ALTER TABLE "filesystems" DROP COLUMN "writeback";
--> statement-breakpoint
ALTER TABLE "filesystems" ADD COLUMN "attention_reason" text;
--> statement-breakpoint
ALTER TABLE "filesystems" ADD COLUMN "attention_notified_at" text;
--> statement-breakpoint
ALTER TABLE "agent_session_requests" DROP CONSTRAINT "agent_session_requests_correlation_ck";
--> statement-breakpoint
ALTER TABLE "agent_session_requests" ADD CONSTRAINT "agent_session_requests_correlation_ck" CHECK (
	("status" = 'running' AND "session_id" IS NOT NULL)
	OR ("status" = 'claimed' AND "claim_token" IS NOT NULL AND "claim_expires_at" IS NOT NULL)
	OR ("status" = 'pending')
	OR ("status" IN ('waiting', 'completed', 'failed', 'cancelled') AND "claim_token" IS NULL AND "claim_expires_at" IS NULL)
);
```

The constraint text is the live one from `0048_AU9_remediation2_custody.sql:65-70`, with only `'waiting'` added.
`framework/db/src/schema.ts` mirrors every change in the same commit:

- `filesystems` (`:1109-1143`): delete `writeback` (`:1132`) and add the two nullable text columns.
- The `agent_session_requests_correlation_ck` check (`:368`) gains `'waiting'` in the closed-status branch.

Existing rows:

- `writeback` data is dropped; it was only ever read by the probe short-circuit
  (`filesystem-reachability.ts:78`).
- `needs_attention` rows become `attached`.
- No request is `waiting` yet.
- `source` values stay as they are, because display is all they are used for.

No new table, so `table-owners.json` is unchanged.

---

## 4. The waiting mechanism

### 4.1 Why not the concurrency release

The plan says a held session waits "the way a session already waits when too many are running": not started,
task still ready. The mechanism cannot be the same one. A `ConcurrencyLimitError` releases the claim straight
back to `pending` (`runtime.ts:441-446`). The drain then re-claims it on every 1 s tick, and it
`return`s on it because it is the oldest row (`start-runtime.ts:180-196`, `:326`). For a hold that can last
days, that would retry the broken filesystem every second, which the plan forbids. It would also stall every
request queued behind it. So a held request gets its own status, `waiting`, which the claim query never selects
(§2.3). What the user sees is identical: no session, the task stays `accepted`.

### 4.2 Parking: where, what marks it

Inside `admitSession` (`provisioner.ts:1050`):

1. **Pre-check, right after `readAgentRunConfig` (`:1090`)**, before adapter selection. Call
   `deps.filesystems.listForAgent(agentId)` once and keep the list for step 3. If any row is
   `needs_attention`, call `holdAgentSessions({ filesystem, agentId, reason: row.attentionReason, newlyBroken:
   false })` and throw `FilesystemUnavailableError`. Nothing is placed, so nothing is retried. This is how the
   second, third and later sessions of that agent, and of every other agent that shares the filesystem, wait.
2. Adapter selection, the concurrency check, spawn or adopt, and the session-row update run unchanged
   (`:1109-1231`).
3. **Placement (Phase 4.5, replaces `:1233-1243`).** Place each filesystem (§5). On the first failure:
   - unmount what *this* admission placed (not `adopted` ones);
   - call `adapterPool.release(adapterId)`, as the concurrency path does at `:1154`;
   - call `workspace.destroy(sandboxHandle)` unless this is a resume (`params.resume?.sandboxPath`,
     `:1190`), because an adopted workspace is the agent's own work;
   - call `holdAgentSessions({ …, reason, newlyBroken: true })` and throw `FilesystemUnavailableError`.

   The reason comes from `checkFilesystem` run once on the failing filesystem, so it says what to fix. If Check
   unexpectedly passes, the adapter's own error text is used instead.

In `runClaimedRequest` (`runtime.ts:332`), a new branch beside the concurrency branch (`:441-446`), before any
failure handling:

```text
if err instanceof FilesystemUnavailableError:
    delete the reserved sessions row (WHERE request_id = ? AND state = 'active')
    ports.sessionRequests.parkClaimedRequest(db, request.id, request.claimToken)
    rethrow
```

The reserved row exists because `reserveOrAdoptSession` inserts it before admission (`runtime.ts:54-97`). It
is deleted rather than crashed because the session never started. Nothing references it yet:
`session_started` is emitted only at the end of admission (`provisioner.ts:1294`), and
`agent_session_requests.session_id` is written only on `running`. Deleting it also keeps it out of the
concurrency count (`:1141-1147`). No `agent_run_lifecycle_changed`, no `agent_run_admission_failed` and no
`session_ended` is emitted. So core never marks the dispatch attempt failed
(`agent-run-admission-reactions.ts:92-94`), and the task stays `accepted`: it moves to `in_progress` only on
`session_started` (seams §9).

In the drain (`start-runtime.ts:155-197`), `classifyAdmissionFailure` (`:211-226`) maps
`FilesystemUnavailableError` to the new code `FILESYSTEM_UNAVAILABLE` (added to `AgentAdmissionFailureCode`,
`:204-208`). The catch skips the explicit-start `failed` projection (`:172-179`) for that code and continues
the loop. The parked row cannot be claimed again, so there is no spin.

`waiting` is not terminal, so the intent reaper leaves it alone (`service.ts:861-863` reaps only when the request
is terminal). No lease exists to expire, and boot recovery reads only `running` (`start-runtime.ts:18`).

### 4.3 Release

Only a person's action releases a parked request. Each trigger ends with
`releaseWaitingRequests(db, agentIds)` (waiting → pending). The drain picks the request up within 1 s
(`start-runtime.ts:326`), re-runs the pre-check, and either starts or parks again. A second park sends no
second notice (§4.5).

| Trigger | Route | agentIds |
|---|---|---|
| *Check* passes | `POST /:id/check` → `markFilesystemReachable` → release | `listAgentIdsForFilesystem(id)` |
| Filesystem removed from the agent | `DELETE /:id/injections/:agentUserId` after `deleteInjection` | `[agentUserId]` |
| Filesystem deleted | `DELETE /:id`: read agentIds **before** `deleteFilesystem` (the injections cascade), then delete, forget the kept copy, release | the list read first |

A failing Check never releases anything. It updates the reason (§7.3).

### 4.4 Boot wiring for the port

`boot.ts` `buildProvisioningReads` (`:295-340`) replaces `injectedFilesystems` with `filesystems: FilesystemsPort`:

- `listForAgent`: `listInjectedFilesystemsForProvisioning(db, agentId)`, as today (`:331-334`).
- `resolveCredential`: `resolveConnectionToken(db, id, decrypt)` (§2.4).
- `holdAgentSessions`:
  1. if `newlyBroken`, call `markFilesystemNeedsAttention(db, id, reason)`;
  2. if `claimAttentionNotice(db, id)` returns true, emit `filesystem_needs_attention` on `eventBus`
     (`boot.ts:345`) with the label and the reason, both redacted.

That is the only emit site. Wiring across services is legal within one layer (`wire-within-one-layer`,
`governance-model.ts:324-331`; seams §2 cites `:295-296`).

`mounter` construction (`boot.ts:302-307`) gains `keptCopiesRoot: path.join(sandboxBasePath, "kept-copies")`.
The route factory receives the same mounter instance, `resolveConnectionToken` and the check deps through
`createAgentOrchestrationApp` options (`app.ts:56-79`). UNVERIFIED: which composition root assembles those
options. Find the caller of `createAgentOrchestrationApp` and pass what boot already holds.

### 4.5 Exactly one notification per episode

An episode starts when a filesystem enters `needs_attention` and ends when Check passes.

- `attention_notified_at` is claimed by CAS in `claimAttentionNotice`. It is called only from
  `holdAgentSessions`, meaning only when a session is actually held. Whichever session claims it first sends the
  one notice.
- Every later held session, from any agent, loses the CAS: no event.
- A failing Check, or a failing check on registration, writes state and reason but never claims the notice.
  The person is looking at the result at that moment. If sessions then get held, the first of them sends the
  notice.
- `markFilesystemReachable` clears the column, so the next episode notifies again.

### 4.6 The "blind executor" rule

Orchestration reads only its own tables, all owned inside agent-orchestration: `filesystems` and
`filesystem_injections` (filesystems), `service_connections` (connections), `agent_session_requests`
(session-requests), and `sessions` (run-orchestration) (`table-owners.json`). It never reads core.

It never starts work on its own. Every parked row is a request core already sent. Parking only delays running
it, and only a person's action on an orchestration route releases it. Its one outward act is the
`filesystem_needs_attention` event. Core's subscriber resolves the agent's name from core's own `users`
(§8). This matches the founder rulings recorded at `provisioner.ts:79-99` and in memory: no read of core, no
push.

---

## 5. The one git adapter (and the folder adapter)

`mounter.ts` keeps `RegistryFilesystemMounter` and the adapter selection. `GitCloneAdapter` (`:128-141`),
`GitWorktreeAdapter` (`:143-168`), `writeExclude` (`:116-126`) and `MalformedFilesystemError` (`:250-258`)
are deleted. They are replaced by `GitRepositoryAdapter`. `LocalFolderAdapter` (`:87-114`) is kept, with the
change in §5.6. Selection (`:260-282`): `code` goes to `GitRepositoryAdapter` whatever the URL, so a public
remote with no connection now places instead of throwing (`:268`). `doc_set` goes to the folder adapter, or
`CloudNotBuiltAdapter` for cloud sources.

### 5.1 Inputs

- `filesystem`: `resourceRef` `{kind: "code", repo, branch}`, and `connectionId`.
- `workspacePath`: the session's sandbox.
- `sessionId`.
- `folderName` (§5.3).
- `credential`: the PAT resolved as the connection's owner, or null. If a connection is set but its token does
  not resolve, the mount fails with "the GitHub token connection for this filesystem is missing or cannot be
  decrypted". It never falls back silently to another identity.

### 5.2 Kept copy: location and lifetime

- **Local repo** (`isLocalRepoPath`): the kept copy *is* the person's repository, after `normalizeLocalPath`
  (`mounter.ts:235-248`). No fetch; HyperIdle never touches their remotes. `base = <branch>`, verified with
  `git rev-parse --verify --quiet <branch>^{commit}`.
- **Remote**: `<keptCopiesRoot>/<filesystemId>`, where `keptCopiesRoot = <sandboxBasePath>/kept-copies`.
  - First mount: `git clone --no-checkout -- <url> <keptCopy>` with the credential env from §6.
  - Every mount after that: `git -C <keptCopy> fetch --prune origin`, same env.
  - `base = origin/<branch>`.
  - Full clone, not shallow, so a pushed branch has history. Session dirs are `local-sb-*`
    (`local-sandbox-adapter.ts:45`), so there is no name clash.
  - Lifetime: until the filesystem is deleted. `DELETE /api/filesystems/:id` calls
    `mounter.forgetKeptCopy(filesystem)`, which does `rm -rf <keptCopiesRoot>/<id>`, for remotes only and
    never for a local repo.
  - UNVERIFIED: that no sweep deletes unknown directories under `sandboxBasePath`. Check with
    `rg sandboxBasePath` before relying on it.
- **Worktree**: `git -C <keptCopy> worktree prune`, then `git -C <keptCopy> worktree add -b
  hyperidle/<sessionId> -- <workspace>/<folderName> <base>`. It is always a new branch off the configured branch
  (today it branches off HEAD and ignores `ref.branch`: `mounter.ts:151`).
- **Concurrency**: an in-process lock per kept copy (a `Map<keptCopy, Promise>`) serialises clone, fetch,
  prune, add and remove. Two agents sharing a remote would otherwise collide on git's ref and index locks.
- **Timeouts**: clone 10 min, fetch 2 min, worktree ops use the existing 120 s (`git-runner.ts:121`). Admission
  is awaited in the drain, so a first clone of a large repository delays the queue (§12.9).

### 5.3 Folder naming

`folderName` is the repo basename without `.git`, or the folder's basename, reduced to `[A-Za-z0-9._-]`. It gets
`-<filesystemId first 8>` appended when it equals an entry of `SANDBOX_SCAFFOLDING_PATHS` (`scaffolding-paths.ts`)
or another of this agent's filesystems. The rule is computed from the agent's injected list, so a resume gets the
same names as long as the injections have not changed.

### 5.4 Coexistence with the workspace's own repository; idempotence on adoption

- **Root repository.** Scaffolding now sits beside the filesystems at the workspace root instead of inside a
  repository, so `writeExclude` goes away. After placement, `ensureSandboxGitRepo(workspacePath)`
  (`mounter.ts:323-326`, called at `provisioner.ts:1251`) still `git init`s the root, which codex needs. It
  skips an existing `.git` on an adopted workspace. Then append each placed `folderName` to the root's
  `.git/info/exclude`, idempotently, so the root repository never shows nested worktrees or symlinks as
  untracked. The "must run after mount" ordering in that function's comment (`:305-322`) no longer holds;
  rewrite the comment.
- **Recognition on an adopted workspace** (resume: `workspace.adopt`, `provisioner.ts:1190-1192`). The folder
  is recognised when both of these hold:
  - `<workspace>/<folderName>/.git` is a file whose `gitdir:` resolves under
    `<keptCopy's common dir>/worktrees/`;
  - that worktree directory still exists.

  Then `mount` returns `{ ok: true, adopted: true }` with the folder's current branch and does nothing else. A
  folder that exists but is not recognised fails with "folder `<name>` already exists in the workspace". This
  fixes the silent resume failure (seams §4, §9: both old adapters refused a directory that already held
  `.git`).

### 5.5 Teardown

`captureMountedFilesystems` (`provisioner.ts:743-760`) becomes `unmountFilesystems(sessionId, mounted,
mounter)`. It is called at the same three sites (`:1939`, `:1991`, `:2018`), before `transitionRun` deletes
the workspace (`transition-run.ts:253`).

- For each git mount: `git -C <keptCopy> worktree remove --force -- <folder>`. The `hyperidle/<sessionId>`
  branch stays.
- Skip the whole call when `sessionAwaitsVerdict(db, sessionId)` (`review-sessions.ts:75`). That workspace is
  kept for the resume, and the resumed session unmounts it at its own end (its adopted mounts are in its list).
- Folder mounts: nothing to do. The symlink goes with the workspace.
- A failure is logged through the observability logger and never blocks teardown.

### 5.6 Folder adapter; room for another kind

`LocalFolderAdapter` symlinks `<workspace>/<folderName>` to the real folder (today it uses the folder's basename:
`:97`) and recognises its own symlink by realpath (`:99-105`). `trustedPath` is the real folder.
`CloudNotBuiltAdapter` (`:77-85`) keeps the phase-2 shape: an adapter is `{ mount, unmount }` chosen by `kind` and
`source`, so `rclone` later becomes one more adapter. Until then a cloud filesystem that somehow exists holds its
agent, with the honest reason "not built yet".

`localTrustedPath` (`:214-221`) is replaced by `MountedFilesystem.trustedPath`. For git that is the kept copy,
because the worktree's git directory lives under the kept copy's `.git/worktrees/` and codex must be allowed to
write there on commit. It feeds `trustedPaths` at `provisioner.ts:1616-1618`.

---

## 6. Credential flow

### 6.1 Which process gets which env

`gitCredentialEnv(remoteUrl, token)` is non-empty only for `https://github.com/…` remotes:

```text
GIT_CONFIG_COUNT=2
GIT_CONFIG_KEY_0=credential.https://github.com.helper   GIT_CONFIG_VALUE_0=         (empty: resets the helper list)
GIT_CONFIG_KEY_1=credential.https://github.com.helper   GIT_CONFIG_VALUE_1=!gh auth git-credential
GH_TOKEN=<PAT>                                          (only when the filesystem has a token connection)
```

It is empty for local repos, other hosts and ssh URLs. Those rely on the person's own git setup: GitLab, ssh
agent (`SSH_AUTH_SOCK` is allowlisted at `git-runner.ts:163`), osxkeychain.

| Process | Env | Source |
|---|---|---|
| HyperIdle's git: clone, fetch, ls-remote, worktree ops | runner allowlist (`git-runner.ts:152-173`) + `gitCredentialEnv` | PAT from `resolveConnectionToken` |
| `gh auth git-credential` (child of git) | inherits git's env: `GH_TOKEN` if set, else the person's login through `HOME` | gh itself |
| The agent's harness process, which runs the agent's own `git push` and `gh` | `mcpTokenEnv` gets every mount's `agentEnv`, merged **after** the connection env (`provisioner.ts:1655-1661`) so a filesystem's PAT wins | same values |

When several github.com filesystems are mounted, merge their `GIT_CONFIG_*` entries into one indexed list,
deduplicated by key.

### 6.2 Nothing written to a file

- No `git config` write anywhere.
- URLs with credentials are rejected at POST, so the kept copy's `.git/config` holds the plain URL.
- `gh auth setup-git` is never run (research: it writes the global `~/.gitconfig`).

### 6.3 Git runner changes (`layers/agent-orchestration/src/git-runner.ts`)

- **Stop nulling the person's configuration.** Delete `GIT_CONFIG_NOSYSTEM=1` and `GIT_CONFIG_GLOBAL=/dev/null`
  (`:174-175`). The plan relies on the person's own git setup: private GitLab, their helpers, their proxy and CA.
  Apple's git keeps `credential.helper=osxkeychain` in the system config. Add an `@lore` stating why. The env
  allowlist stays; the old security note (`:145-148`) was about inheriting `process.env`, which is still not done.
  `GIT_TERMINAL_PROMPT=0` and `GIT_ASKPASS=/bin/false` stay, so a missing credential fails fast instead of
  hanging.
- Replace the `tokenConfig` option (`:27-32`, used at `:301-340`) with `env?: Record<string, string>`.
  Header construction disappears everywhere.
- Rewrite `clone(url, destination, {env})` as `git clone --no-checkout -- <url> <dest>`. Its only caller was
  `GitCloneAdapter`.
- Add `fetch({env})`.
- Rewrite `worktreeAdd(path, newBranch, startPoint)` (its only caller was `GitWorktreeAdapter`).
- Add `worktreePrune()` and `verifyCommit(ref)`.
- Change `lsRemote(url, {env, branch})` to `git ls-remote --exit-code -- <url> refs/heads/<branch>`.
- Keep `worktreeRemove` (`:360`), which gains its first production caller.
- **Redaction.** Every error or reason string leaving the runner goes through
  `redactSecrets(text, secrets)`, where `secrets` are the values of `GH_TOKEN` in that call's env. It:
  - replaces literal secret occurrences;
  - strips `scheme://user:pass@` userinfo anywhere in the text (today `redactArg` does this only when the whole
    string is one URL: `:123-137`);
  - applies the existing `gh[pousr]_…` pattern.

  The runner logs `argv` only (`:196`), and the token is only ever in env, so it never reaches a log line.
- Unused verbs (`bundle`, `restoreStaged`, …): delete whatever knip reports dead after this change, and nothing
  else.

### 6.4 Proof points: where a credential must never appear

| Place | Why it cannot get there | Proven by (§10) |
|---|---|---|
| `agent_session_requests.payload_json` | Filesystems are read live at spawn and never baked (`admit-session-live-filesystems.integration.test.ts:18-20`); the PAT is resolved inside admission | T6 asserts the PAT is absent from the row |
| `sessions` row | Only `sandbox_snapshot` (a path) is written (`provisioner.ts:1205-1231`) | T6 |
| kept copy `.git/config`, worktree, `$HOME/.gitconfig` | env only; URL userinfo rejected | T3 reads the produced files |
| event, notification, `filesystems.attention_reason` | reason and label pass `redactSecrets` | T1 (unit), T6, T7 |
| log lines | argv-only logging; token in env | structural (§6.3). UNVERIFIED whether `@hyperidle/diagnostics` has a capture sink a test could assert on. If it does, T6 asserts on it |

---

## 7. Detection and Check

### 7.1 Which CLIs each filesystem needs

- Folder: none.
- Git, local repo: `git`.
- Git, remote other than github.com: `git`.
- Git, `https://github.com/` remote: `git` and `gh`.

`rclone` joins in phase 2.

### 7.2 What Check does (`checkFilesystem`)

| Kind | `ok` when | `clis` |
|---|---|---|
| folder | path exists and is a directory | `[]` |
| git local | `git` installed; path is inside a work tree (`revParseIsInsideWorkTree`); `verifyCommit(branch)` passes | git |
| git remote | `git` installed; connection set ⇒ token resolves; `ls-remote --exit-code … refs/heads/<branch>` with `gitCredentialEnv` succeeds | git, and gh when github.com (`installed`, `loggedIn` from `gh auth status --hostname github.com` with the PAT as `GH_TOKEN` when there is one) |

- `git` has no login, so its `loggedIn` is `null`.
- Reason precedence when not ok: a missing CLI ("Install the GitHub CLI (gh)…"), then gh not logged in ("Log in
  with `gh auth login`, or add a GitHub token connection"), then the redacted git error, or "branch `<b>` not
  found".
- `gh auth status` semantics, verified with gh 2.92.0:
  - exit 0 when logged in;
  - exit 1 when logged out, and exit 1 for an invalid `GH_TOKEN` ("The token in GH_TOKEN is invalid");
  - `--json hosts` exits 0 even when logged out, printing `{"hosts":{}}`, so only the exit code is used.
- With a PAT, `gh auth status` validates it against GitHub, and the `ls-remote` fails on a revoked token. This
  catches break #5.
- **Not reused: the inherited probe** (`inherited-reach.ts:343-392`). It uses `--json hosts`, cannot tell
  logged-out from logged-in, and counts the top-level `hosts` key as a login (§12.5).

### 7.3 What Check returns and persists

`POST /api/filesystems/:id/check` returns `{ filesystem, check }`:

- `ok` → `markFilesystemReachable` → release waiting requests (§4.3).
- not ok → `markFilesystemNeedsAttention(reason)`. No notice here (§4.5).

Registration runs the same check-and-persist step.

---

## 8. Notification

Inbox producers today: the `notification` event listener (`notifications/src/install.ts:457-509`), which
resolves a *work item* by `targetId` and drops anything else. It cannot carry a filesystem. The other producer
is a direct `enqueue` from a core reaction: agent health (`core-api/src/services/agent-health-session-end-reactions.ts:151-167`).
This change reuses the second pattern.

- New `layers/core-api/src/services/filesystem-attention-reactions.ts`, exporting
  `registerFilesystemAttentionReactions(db, eventBus)`. It is registered in `service-bootstrap.ts` beside
  `registerAgentHealthSessionEndReactions` (`:284`).
- On `filesystem_needs_attention` it resolves the agent's name with `findUser` (as `describeAgent` does at
  `agent-health…:110-119`) and enqueues one `notification_queue` row:
  - `eventType: "filesystem_needs_attention"`, `subjectId: filesystemId`, `severity: "blocking"`,
    `status: "pending"`, `reason: "filesystem_needs_attention"`, `sourceLink: "/settings"`.
    Settings is one stacked page (`SettingsPage.tsx:2-5`).
  - `title: "Filesystem needs attention: <label>"`.
  - `body: "<agent name> can't start work until it's fixed. <reason> After fixing it, press Check in Settings → Filesystems."`
  - `typeKey` is left null, exactly like the agent-health row. `NotificationTypeKey` (`domain-model/src/notifications.ts:23`)
    is unchanged. UNVERIFIED: how the popover renders a null `typeKey`. Agent-health rows already do this, so
    check it at G2.
- One shared inbox (plan: BA7 adds addressing). No dedupe in the subscriber: the once-per-episode guarantee is
  orchestration's CAS (§4.5).

---

## 9. The agent is told what it has

`describeMountedFilesystems(mounted)` returns a `## Filesystems` section. It is appended to `assembledPrompt`
right before `writeSandboxAgentsMd` (`provisioner.ts:1541`), where all three prompt branches meet (`:1484-1532`),
and only when something was mounted. Facts to lock; the builder may tune the wording:

- **git remote**: `` `<folder>/` — git repository <url>. You are on branch `hyperidle/<id>`, started from
  `<branch>`. Commit your work here and push the branch to get it out: `git push -u origin HEAD`. ``
- **git local**: the same, with "Your commits stay on this branch in the repository at `<path>` after the
  session; push it if the repository has a remote."
- **folder**: `` `<folder>/` — the folder <path>, linked in as it is. You are editing the real files. ``

The static workspace text (`context.ts:352-363`) is unchanged.

---

## 10. Surfaces (core-ui)

These are existing patterns, approved in words at G1 and shown live at G2.

- **`SettingsFilesystems.tsx`**
  - `+ Add filesystem` (`:139-141`, currently inert) opens `AddFilesystemDialog`. It is built like the
    unexported `AddConnectionDialog` (`SettingsConnections.tsx:90-130`): design-system Dialog, Select and Input,
    `apiFetch`, inline error.
  - Fields:
    - Kind: Git repository or Folder.
    - Location: path or URL.
    - Branch: prefilled through `POST /api/filesystems/inspect-path` for a local path.
    - "GitHub token (optional)": a Select of held `token` connections with service `github`, from
      `GET /api/connections`, shown only for `https://github.com/` URLs.
  - On submit it posts, refreshes, and shows the returned check.
  - Each row gets a **Check** button (`POST /:id/check`).
  - A `needs_attention` row shows `attentionReason`. After a Check it also shows the CLI line, e.g.
    "gh: not installed" or "gh: not logged in".
  - Remove `writeback` from `FilesystemApiItem` (`:22-32`).
  - Update `SettingsFilesystems.stories.tsx`: drop write-back; add a needs-attention row with its reason and an
    open-dialog story. Populated real states only.
- **`SetupFlow.tsx`** (`:315-363`)
  - Drop `writeback: "none"`.
  - Read `agentIds` from the team response (§2.1), then call
    `POST /api/filesystems/:id/injections { agentUserId }` for each. Still best-effort, as today.
  - The core-hosted injection gate accepts this because the onboarding agent carries the team's id
    (`core-api/src/routes/filesystems.ts:80-90`).
- **Inbox**: no change. The row renders through the existing popover (`shell/NotificationPopover.tsx`).

---

## 11. Size check: over the limit

Added lines, deletions not counted:

| Area | Production | Tests |
|---|---|---|
| Migration, schema, types, event, statuses, team response | ~80 | — |
| Git runner verbs, env, redaction, credential env | ~140 | ~70 units |
| Git adapter (kept copy, worktree, recognition, unmount, forget, lock, naming) + folder change + placement orchestration | ~300 | ~260 adapter integration + ~140 test git server |
| Instructions section, provisioner edits (pre-check, failure cleanup, env merge, trusted paths, three teardown sites) | ~100 | ~40 |
| Hold: error, runtime park, drain code, session-requests park/release, boot port | ~120 | ~220 hold integration |
| Check + `gh` status probe + filesystems writers + owner token resolve + routes | ~260 | ~170 |
| Core subscriber + registration | ~70 | ~80, plus ~130 cross-layer "task stays ready" |
| UI: dialog, Check, reason, stories, onboarding | ~300 | ~190 |
| **Total** | **~1,150–1,400** | **~1,100–1,300** |

**About 2,300–2,700 added lines: far above 1,000. Production alone is above 1,000. Stop here: this needs the
maintainer's answer before any code is written (CLAUDE.md, Simplicity Sanity Check).**

The assumptions that drive the size, all from the approved plan:

1. Sessions **hold** instead of failing: a new status, park and release on three triggers, a once-per-episode
   notice, cross-layer wiring. (~600 with tests.)
2. A **real Add-filesystem dialog** with Check and reason display in phase 1. (~490 with tests.)
3. **Remote kept copy plus worktree per session** instead of a clone per session: lock, fetch, recognition,
   forget. (~150.)
4. G2's **private-remote proofs** need an offline authenticated git server stand-in for github.com. That is
   test-only and cheap per behaviour but large up front. (~140 helper.)
5. **CLI detection** as its own result. (~120.)

Smallest cuts, each a plan amendment and not mine to take:

- **(a)** Move the UI (dialog, Check button, reason display) into its own item right after this one, with
  Check reachable by API only. Saves ~490.
- **(b)** Keep only the Check reason text and drop the separate `clis` list. Saves ~100.
- **(c)** Clone per session for remotes, dropping the kept copy. Saves ~150, but contradicts a ruling.

Even (a)+(b)+(c) leaves ~1,800. **No cut that keeps G2's list gets under 1,000.** The honest question for the
maintainer: accept this size for this item, or split it, e.g. (1) placement + credentials + resume + teardown,
(2) hold + notification + Check, (3) surfaces.

---

## 12. Deletions and scans

Find every site by scanning. Each scan must find something, and an empty result is a failure, not a pass.
Run from the repo root:

```sh
rg -n -a 'writeback' layers framework applications tools -g '!**/node_modules/**' -g '!**/dist/**' | rg -v -i 'knowledge|writeback-processor|WritebackProcessor|beginAgentWriteback|sandbox_writeback' || { echo "scan found nothing"; exit 1; }
rg -n -a 'GitCloneAdapter|GitWorktreeAdapter|captureBack|captureMountedFilesystems|MalformedFilesystemError|writeExclude' layers -g '!**/node_modules/**' -g '!**/dist/**' || { echo "scan found nothing"; exit 1; }
rg -n -a 'resolveFilesystemState|refreshFilesystemState|FilesystemTokenResolver|extraHeader|tokenConfig|buildAuthResolver|checkAndPersistState|sourceHint' layers -g '!**/node_modules/**' -g '!**/dist/**' || { echo "scan found nothing"; exit 1; }
rg -n -a '/validate|updateConnection' layers/agent-orchestration -g '!**/node_modules/**' -g '!**/dist/**' || { echo "scan found nothing"; exit 1; }
rg -n -a 'api/filesystems/\$\{' layers tools applications -g '!**/node_modules/**' -g '!**/dist/**' | rg -v 'injections|check' || true   # GET /:id callers: tests only at time of writing
```

Filesystem-sense `writeback` sites at time of writing: 28 files. They are the `rg` hit list under
`layers/agent-orchestration/{filesystems,run-orchestration,src}`, `layers/core-api/src/**/__tests__`,
`core-ui/src/settings/SettingsFilesystems{,.stories}.tsx`, `core-ui/src/pages/SetupFlow.tsx`.

| Goes | Where | Replaced by / note |
|---|---|---|
| `GitCloneAdapter`, `GitWorktreeAdapter`, `writeExclude`, `MalformedFilesystemError`, `AdapterCaptureResult`, `captureBack` | `mounter.ts:65-71,116-168,250-258,296-302` | `GitRepositoryAdapter`, `unmount` |
| `captureMountedFilesystems` | `provisioner.ts:743-760` | `unmountFilesystems` |
| Dead `Provisioner.mount` and `Provisioner.capture` | `provisioner.ts:2154-2160,2171-2178` | nothing; the scan found no caller |
| Swallowing mount failures to `console.warn` | `filesystem-provisioning.ts:112-131` | hold (§4.2) |
| Stale admission comment ("ALL admission failures … throw BEFORE the P5 row insert") | `provisioner.ts:1041-1044` | say the reserved row exists; `runtime.ts` crashes it or, on a hold, drops it |
| Reachability probe incl. header construction | `filesystems/src/filesystem-reachability.ts` (whole), `ports.ts:18-22`, `index.ts:7-8` | `checkFilesystem` |
| Per-user resolver, `buildAuthResolver`, `checkAndPersistState`, `sourceHint`, `writeback` enum, `GET /:id` | `routes/filesystems.ts:41-52,78-81,104-152,276-288`; `app.ts:70-75` | §2.7 |
| Connection validate route + `updateConnection` (its only caller is `:421`) | `routes/connections.ts:373-424`, `connections/src/service-connection-store.ts:77`, `index.ts:42`; rate-limit note `:14` | nothing (§12.6) |
| `writeback` column and type fields | schema, `filesystem-shape.ts:23`, reader `:45`, `filesystem-provisioning.ts:56,107`, `mounter.ts:36`, route mapper `:98`, UI type, stories, SetupFlow | migration 0082 |
| `GIT_CONFIG_NOSYSTEM`/`GIT_CONFIG_GLOBAL` nulling | `git-runner.ts:174-175` | person's own config (§6.3) |
| Tests | `run-orchestration/src/__tests__/{git-clone-adapter,git-worktree-adapter,git-worktree-live-proof}.integration.test.ts` deleted; `local-folder-adapter.integration.test.ts`, `mounter-registry.test.ts`, `filesystem-provisioning.test.ts`, `admit-session-live-filesystems.integration.test.ts` rewritten; `filesystems/src/__tests__/{AO1-filesystem-reachability.test.ts,AO1-reachability-lane-b.integration.test.ts,probe-internals.test.ts}` deleted; the connection-validate tests (find with `rg -l '/validate' layers/agent-orchestration`) deleted; every other `writeback` fixture updated | — |

`SANDBOX_SCAFFOLDING_PATHS` stays: it is used by folder naming (§5.3).

---

## 13. Build order

One builder, in sequence. Each leaf ends with `npm run check`, `npm run lint`, `npm run test`, and
`npm run test:integration:service -- <touched files>` green. All leaves land in one PR.

1. **L1 — Schema and write-back removal.** Migration 0082 + journal, `schema.ts`, `waiting` status,
   `FilesystemView` (drops write-back, adds `attentionReason`), `CreateTeamResponse.agentIds` + teams route,
   every write-back site (UI, SetupFlow, stories, fixtures). *No dependency.*
2. **L2 — Git runner and credentials.** Runner verbs, env option, stop nulling config, `redactSecrets`,
   `gitCredentialEnv`, `cli-status.ts`; the test git server helper (§14.1); T1, T2. *After L1.*
3. **L3 — One git adapter, placement, instructions, teardown.** `GitRepositoryAdapter`, folder adapter naming,
   kept copies, recognition, `unmount`/`forgetKeptCopy`, root exclude, `trustedPath`, agent env merge,
   `## Filesystems` section, the three teardown sites. Delete the old adapters and their tests,
   `Provisioner.mount`/`capture`, and the stale comment. For now a mount failure throws a plain error. T3, T4,
   T9. *After L2.*
4. **L4 — Check and detection.** `checkFilesystem`, filesystems writers, `resolveConnectionToken`, the
   `POST /:id/check` route, Check on registration, POST validation, `DELETE` forgetting the kept copy. Delete
   the probe, `GET /:id` and the validate route. T5. *After L3.*
5. **L5 — Hold and notification.** `FilesystemUnavailableError`, pre-check, failure cleanup, park in
   `runtime.ts`, drain code, `parkClaimedRequest`/`releaseWaitingRequests`, `holdAgentSessions` + the event,
   release on check/eject/delete, core subscriber + registration. T6, T7, T8. *After L4.*
6. **L6 — Surfaces.** Add dialog, Check button, reason and CLI display, stories, onboarding picks the filesystem
   for its agent. T10, T11. *After L4 (route shapes) and L1 (team response).*

Harness obligation: L3 changes session provisioning, so run `npm run test:integration:harness` locally before
ship (`.pipeline/rules/testing.md`). It has no CI job.

---

## 14. Verification

### 14.1 The authenticated git server: offline, real git, real gh

**Probe run for this document** (scratchpad, 2026-09-11, git 2.39.5 and gh 2.92.0, local):

- a local HTTP proxy answers `CONNECT github.com:443` and terminates TLS with a test-CA certificate for
  `github.com`;
- behind it, a Node HTTPS handler checks Basic auth and bridges to `$(git --exec-path)/git-http-backend` as CGI;
- git reaches it through `[http "https://github.com/"] proxy = … / sslCAInfo = …` in a temporary `$HOME/.gitconfig`.

Results:

- No helper: `could not read Username` (fails).
- `GIT_CONFIG_*` gh helper + `GH_TOKEN`: clone OK, and neither `.git/config` nor `$HOME/.gitconfig` contains the
  token.
- gh login from `$HOME/.config/gh/hosts.yml` (no `GH_TOKEN`): clone OK. gh answers with the account name as
  username, so **the server must check only the password**, as GitHub does.
- Wrong PAT: `Authentication failed`.
- Push of `hyperidle/s1` from a worktree of the kept copy: the branch appears on the server.

Earlier dead ends:

- `gh auth git-credential` refuses non-github hosts over plain HTTP (exit 1), so a `127.0.0.1` server cannot
  prove the real helper.
- `GH_ENTERPRISE_TOKEN` would work for a non-github host, but supporting GitHub Enterprise only for a test
  would be a production change made to pass a test.

The proxy keeps the URL `https://github.com/…`, so production code has no test path.

Helper: `layers/agent-orchestration/src/__testing__/github-stand-in.ts` (development world). It generates the CA
and leaf with `openssl` at start, holds bare repos, sets `http.receivepack true`, and returns `{ proxyUrl, caPath,
home(), branches(repo) }`. It hard-fails naming each missing binary (`git`, `gh`, `openssl`, `git-http-backend`),
same shape as `connections/src/__tests__/require-binary.ts`. Tests put the stand-in's `.gitconfig`/`hosts.yml`
in a temporary `HOME` with `vi.stubEnv("HOME", …)`. The runner reads `process.env.HOME` at spawn
(`git-runner.ts:166-170`).

**CI:** the service lane runs on `ubuntu-latest` (`.github/workflows/ci.yml:29,68`). The runner image ships Git
2.55.0 and GitHub CLI 2.100.0 (actions/runner-images `images/ubuntu/Ubuntu2404-Readme.md`, fetched 2026-09-11:
<https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md>). `git-http-backend`
ships in Ubuntu's `git` package under `/usr/lib/git-core`. That and `openssl` on the runner are UNVERIFIED; the
helper hard-fails in CI if either is absent. The new tests are `*.integration.test.ts` outside the harness
include list (`vitest.integration.config.ts:31-46`), so they land in the service project.

### 14.2 Tests

| # | Behaviour | File · lane | Asserts | Red if reverted |
|---|---|---|---|---|
| T1 | redaction; credential env | `run-orchestration/src/__tests__/git-credential-env.test.ts`, `layers/agent-orchestration/src/__tests__/redact-secrets.test.ts` · unit | github.com https → reset + helper (+ `GH_TOKEN` iff token); other host/ssh/local → `{}`; literal token, URL userinfo and `ghp_…` stripped from arbitrary text | helper omitted, or a token survives in a reason |
| T2 | runner reaches remotes with the person's setup + gh | `layers/agent-orchestration/src/__tests__/git-runner-credentials.integration.test.ts` · service | through the stand-in: `lsRemote` ok with PAT, ok with `hosts.yml` login, fails with a wrong PAT and with no login | restoring `GIT_CONFIG_GLOBAL=/dev/null` (proxy/CA unread → fails); removing env helper → 401 |
| T3 | one git adapter | `run-orchestration/src/__tests__/git-repository-adapter.integration.test.ts` · service | (a) **local**: worktree at `<ws>/<name>` on `hyperidle/<sid>` whose base is the configured branch while the repo's HEAD is elsewhere. (b) **public remote**: server without auth, one clone, a second mount **fetches** (a new server commit is visible) and does not re-clone. (c) **PAT**: server with auth, mount ok; kept `.git/config`, the worktree and `$HOME/.gitconfig` hold no token. (d) **gh login**: mount ok with no credential. (e) the agent's push: `git push -u origin HEAD` from the worktree with `agentEnv` + `HOME` → the branch is on the server. (f) two same-basename filesystems → distinct folders. (g) repo gone → `{ok:false}` with a readable reason, no token. (h) `unmount` → gone from `git worktree list`, branch still exists | branching from HEAD; re-clone per mount; env helper removed; `agentEnv` empty; unmount removed |
| T4 | resume recognised; folder linked in | same file + `local-folder-adapter.integration.test.ts` · service | mount the same filesystem twice into one workspace (new sessionId) → `adopted:true`, same branch, no error; folder symlink is `<ws>/<name>` → real folder, recognised twice | recognition removed → `worktree add` "already exists" |
| T5 | Check and detection | `run-orchestration/src/__tests__/filesystem-check.integration.test.ts` · service; `layers/agent-orchestration/src/__tests__/cli-status.integration.test.ts` · service (real `gh`) | local ok / branch missing; folder missing; public remote ok without creds; PAT ok; wrong PAT → not ok with an auth reason (the offline stand-in for a revoked token); connection set but unresolvable → not ok; `cliStatus.gh`: PATH without gh → `installed:false`; empty `HOME`, no token → `loggedIn:false` (offline) | reason precedence or exit-code handling broken; a `--json` parse would report logged in |
| T6 | **hold** | `layers/agent-orchestration/src/__tests__/filesystem-hold.integration.test.ts` · service (orchestration fixtures, real session-requests, real mounter, fake adapter pool: the harness is not under test) | drain a request for an agent whose local repo path is missing → request `waiting`, **no** `sessions` row, workspace dir gone, filesystem `needs_attention` + reason, **one** `filesystem_needs_attention` event, **no** `agent_run_admission_failed`/lifecycle event. Fix the repo **without** Check, drain a second request → still `waiting`, no second event. `POST /api/filesystems/:id/check` → both `pending` → drain → `running`. Separate case: eject releases. PAT absent from `payload_json`, the `sessions` row, the event and `attention_reason` | pre-check removed (second request starts); CAS removed (two events); release on Check removed (still waiting); reserved row not dropped |
| T7 | notification | `core-api/src/services/__tests__/filesystem-attention-reactions.integration.test.ts` · service (core fixtures run `service-bootstrap`) | one event → one `notification_queue` row naming the agent, the filesystem label and the reason, `sourceLink:"/settings"` | subscriber not registered → zero rows |
| T8 | task stays ready, starts after Check | `core-api/src/__tests__/filesystem-hold-task-stays-ready.integration.test.ts` · service (existing `run-orchestration-test-runtime.ts` helpers) | task dispatched to an agent with a broken local repo → task `accepted`, one inbox row; fix + Check → session starts → task `in_progress` | any failure path that reaches core's `markFailed` or never releases |
| T9 | agent told; teardown; trust | `run-orchestration/src/__tests__/filesystem-instructions.test.ts` · unit; `admit-session-live-filesystems.integration.test.ts` (rewritten) · service | section names folder, kind, branch, base and how work gets out; a session run to completion (fake harness) writes `AGENTS.md` containing it, unmounts the worktree and keeps the branch; a session that awaits a verdict keeps its worktree; `trustedPaths` include the kept copy | section not appended; verdict check dropped |
| T10 | surfaces | `core-ui/src/__tests__/settings-filesystems.test.tsx` · component | the dialog posts a body without `writeback`, with the chosen connection; Check posts `/check` and renders the reason and "gh: not installed" | — |
| T11 | onboarding picks the filesystem | `core-ui/src/__tests__/setup-flow-harness-picker.test.tsx` (extended) · component; a teams-route assertion in `core-api` · service | SetupFlow posts `/api/filesystems` then `/:id/injections` with the response's agent id; the team response carries `agentIds` | injection call removed |

Deletions and static properties (`GET /:id`, validate route, write-back fields, dead verbs) are proven by
`npm run check` and knip, not by tests.

### 14.3 G2: live on the running app only

On the desktop build, with real `github.com`:

- a **local repo**: the agent's worktree appears in the workspace and the branch stays after the session;
- a **public remote**;
- a **private remote through the person's `gh` login**;
- a **private remote through a PAT**: the agent pushes its branch, and a revoked PAT then makes Check show
  *needs attention*;
- a **folder**: the agent edits the real files;
- a **broken filesystem**: the task stays ready, **one** inbox notification appears (verify the popover renders
  the null `typeKey` row), and the session starts after Check;
- a **resume** of an agent with a repository.

These cannot be shown offline: the real GitHub API check in `gh auth status`, a real revoked token, real
harness agents pushing (the harness lane is not extended here), and the rendered surfaces.

---

## 15. Security: surfaces this change reaches

- **A stored PAT reaches env** of HyperIdle's git, gh and the agent. The plan sanctions this (agents hold their
  own credentials). The abuse to prevent is the token leaking into durable places, closed by §6.4. There is no
  withholding and no gate, per `.pipeline/rules/security.md`.
- **User-entered URL, path and branch reach `spawn` argv.** The runner uses `--` separators and rejects leading
  `-` (`git-runner.ts:348-366`); the branch regex is at POST; URLs with credentials are rejected.
- **Git error text** can echo URLs. Closed by `redactSecrets` and by no-userinfo URLs.
- **Reading the person's git config** means their helpers, hooks and proxies run for HyperIdle's git. That is
  intended: it is their computer and their setup. A remote clone brings no hooks.
- **New routes** sit behind the existing app-level auth middleware (the comment at `routes/filesystems.ts:25-26`).
- **Not touched:** the MCP bridge, harness authentication, artifact isolation, the injection gate.

## 16. Documentation made false

Updated at G3 per the plan:

- `docs/process-layer/filesystem-primitive.md`: the write-back axis, capture-back, the lifecycle, and "forge auth
  provisioned into the sandbox".
- `docs/architecture/connection-model.md`: the `POST /api/connections/:id/validate` API line and the health
  semantics.
- The comments in `git-runner.ts:10-25` and `mounter.ts:1-11`: fix these in code.

---

## 17. Things the plan left unclear

1. **Size**: §11, a blocker for the maintainer.
2. **"Waits the way a session waits when too many are running."** The user-facing behaviour is the same, but the
   mechanism cannot be: the concurrency release re-claims every second and returns the drain at the queue head
   (`start-runtime.ts:180-196`). Hence a distinct `waiting` status (§4.1). This is an interpretation, not a new
   outcome.
3. **One notice per episode names the first held agent.** Other agents that share the filesystem wait without
   being named separately.
4. **`GH_TOKEN` collision.** Connection provisioning already puts the oldest human's GitHub token in *every*
   session (`boot.ts:311-326`, `connection-provisioning.ts:190-196`). For a filesystem that relies on the
   person's `gh` login, the agent's gh helper will use that token instead. HyperIdle's own clone used the login.
   A filesystem's own PAT overrides it (§6.1). Two github.com filesystems with different PATs cannot both be
   honoured in one agent env: the last one wins.
5. **Inherited-CLI probe bug (AN1).** `gh auth status --json hosts` exits 0 and prints `{"hosts":{}}` when logged
   out (verified), and `inspectInheritedTools` counts the top-level key as a login (`inherited-reach.ts:365-384`).
   So Settings → Connections shows GitHub *working* whenever `gh` is installed. It is not reused and not fixed
   here; proposed as an item.
6. **`service_connections.health` / `last_validated_at` lose their only writer** when the validate route goes
   (`routes/connections.ts:421`). Every held connection then shows *needs attention* forever. That is already true
   in practice, since nothing in the UI calls validate. Whether the column goes is the maintainer's call.
7. **Governance event registry drift.** `architecture.json:134` points `eventBus.typesModule` at
   `framework/domain-model/src/events.ts`, a stale copy (583 lines) of the real `framework/event-bus/src/events.ts`
   (687 lines; it lacks `review_verdict`). The new event goes in the real one, and the census will not see it.
   This predates the item.
8. **Kept copies live under `sandboxBasePath`,** which on desktop defaults to `os.tmpdir()/hyperidle-workspaces`
   (`applications/desktop/src/create-server.ts:178-181`). A reboot loses them, and the next session re-clones.
   It is cache semantics, and acceptable unless the maintainer wants a durable data directory.
9. **The first clone of a large repo blocks the drain.** Admission is awaited sequentially
   (`start-runtime.ts:135-141`), so other agents' sessions wait behind the clone. It is not addressed here.
10. **An explicit session start stays `requested` while held.** Its poller sees no failure. That is consistent
    with "does not start and waits".
11. **GitHub Enterprise and private GitLab** rely on the person's own git setup. The gh helper is attached only for
    `https://github.com/`. A GitHub token connection is accepted only for github.com URLs.
12. **Existing `needs_attention` rows are reset to `attached`** by the migration, because their verdict came from
    the deleted probe.
13. **BA14's recorded cause is not touched.** Its folder needs the maintainer's word (plan, proposed items).
