# BA5 — The filesystem works · Architecture, phase 1

Technical restatement of `plan.md` `## How it works` for a builder who has not seen the conversation. Phase 1
only: local repository, public remote, private remote (through a `gh` login and through a PAT), folder, the
hold, the notification, Check, resume, and teardown. Google Drive / `rclone` is phase 2. This document only
keeps the placement shape open to another kind (§5.6).

Every claim about existing code cites `file:line` at origin/main `f88b71434`. Re-check a line before you build
on it. `UNVERIFIED` marks what I could not check.

**Revision 2 (after critique).** Kept copies moved out of the workspaces folder (B1). A public github.com
repository no longer needs `gh` (B2). The hold is now a claim-time filter instead of a `waiting` status (C1).
Every transition into *needs attention* sends the one notice. The separate CLI list and the per-copy lock are
gone. Connection health is deleted.

**Blocker to raise before building: §11 (size).** The approved plan still needs about 2,000–2,400 added lines
of code. Production and tests are both counted; deletions are not. That is well over the 1,000-line stop.

---

## 0. Map: plan behaviour → where it lives

| Plan (`## How it works`) | Obligation | Section |
|---|---|---|
| Its filesystems are the ones picked for it | Placement reads the per-agent injections live. Unchanged reader, minus write-back | §2, §5 |
| Each goes in its own named folder; git = kept copy + worktree per session on its own branch off the configured branch; folder linked in | One git adapter plus the folder adapter, named subfolders; kept copies in the application's data folder | §5 |
| The agent is told what it has | A `## Filesystems` section in `AGENTS.md` | §9 |
| Credentials are the CLIs'; a public repository needs only git | `gh auth git-credential` as git's helper through env only, invoked by git only after the remote asks; PAT through `GH_TOKEN`; HyperIdle stops building headers | §6, §7 |
| Detection and Check | `POST /api/filesystems/:id/check`: git installed, resource reachable; `gh` consulted only when the filesystem has a connection or the remote asked for a login | §7 |
| Cannot be put in place → sessions wait, task stays ready, marked *needs attention* with a reason, one notification, start after Check passes, no self-retry | The claim query skips every agent that uses a *needs attention* filesystem; the failing attempt returns its request to `pending`; one event on entering *needs attention*; one core subscriber | §4, §8 |
| A resumed session reuses its workspace | Adapter recognises an already-placed folder | §5.4 |
| Session end removes the worktree, keeps the branch | `unmount` at the three teardown sites | §5.5 |
| Surfaces: *Add filesystem* dialog, *Check*, *needs attention* + reason (which names any missing CLI), inbox notification | UI in `SettingsFilesystems.tsx`; onboarding picks the filesystem for its agent | §10 |
| Goes away: both git adapters, write-back, unused connection check | Scan-driven deletions, including connection health | §12 |

---

## 1. Change boundary

Everything happens in the agent-orchestration layer, plus one core-api subscriber, one framework event, one
domain-model response field, core-ui, and one line of wiring in each of the two server applications.

- **agent-orchestration / run-orchestration** (`layers/agent-orchestration/run-orchestration/src/`): mount
  engine (`mounter.ts`), placement orchestration (`filesystem-provisioning.ts`), admission and teardown
  (`provisioner.ts`), hold handling (`runtime.ts`, `start-runtime.ts`, `errors.ts`), Check, the credential env
  builder, and the instructions section.
- **agent-orchestration / filesystems** (`.../filesystems/src/`): state columns and their writers, and the
  held-agents read. The reachability probe is deleted.
- **agent-orchestration / session-requests** (`.../session-requests/src/service.ts`): one claim option,
  `excludeAgentIds`. No new status.
- **agent-orchestration / connections** (`.../connections/src/`): resolve a token as the connection's owner.
  The validate route and connection health are deleted.
- **agent-orchestration layer root** (`layers/agent-orchestration/src/`): git runner, `gh` status probe, the
  one attention writer-and-emitter, routes, boot wiring.
- **core-api**: `services/filesystem-attention-reactions.ts` (new), registration in `service-bootstrap.ts`, and
  `agentIds` in the team-creation response.
- **framework**: `event-bus/src/events.ts` (one event), `domain-model/src/team.ts` (one response field),
  `domain-model/src/connection.ts` (health removed), `db` (schema plus migration 0082).
- **applications**: `desktop/src/create-server.ts` and `remote-server/src/create-server.ts` pass the kept-copies
  folder (§5.2).
- **core-ui**: `settings/SettingsFilesystems.tsx` (+ stories), `settings/SettingsConnections.tsx` (+ stories;
  health removed), `pages/SetupFlow.tsx`.
- **repo root**: `.gitignore` and `biome.json` gain `kept-copies` (§5.2, dev checkout).

Not touched: harness adapters (they already pass `HOME`: `layers/agent-execution/harness-registry/src/adapter-pool.ts:407`,
allowlists at `:551` and `:582`; and merge `mcpTokenEnv` outside the allowlist: `cli-harness-adapter.ts:648-652`,
resume `:1208`), the MCP bridge, artifact isolation, the injection table and its routes (the per-agent mapping
survives), `server_credentials.last_validated_at` (a different table with the same column name).

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
	readonly streamId: string;          // `filesystem:${filesystemId}`
	readonly filesystemId: string;
	readonly filesystemLabel: string;   // repo URL / local path / folder path, passed through redactSecrets
	readonly agentIds: readonly string[]; // every agent the filesystem is picked for, at the moment it broke; may be empty
	readonly reason: string;            // what to fix, plain words, redacted
	readonly timestamp: number;
}
```

Published only by `recordFilesystemNeedsAttention` in the agent-orchestration layer root (§4.3). Subscribed by
core-api (§8). Clause `publish-anyone-but-the-bus-host` (`tools/governance/src/lib/governance-model.ts:280`):
agent-orchestration is not the framework, so it may publish. Cross-layer conversation over the bus is the
sanctioned channel (the `wire-within-one-layer` rationale, `governance-model.ts:330`). No registry edit. See
§17.6 for the `typesModule` drift.

**`framework/domain-model/src/team.ts:180-183`**: `CreateTeamResponse` gains `agentIds: string[]`. The
route already holds them at `teams-routes.ts:285`, and the response is built at `:429-432`. Onboarding needs the
id of the agent it just created so it can pick the filesystem for it.

**`framework/domain-model/src/connection.ts`**: delete `CONNECTION_HEALTH`, `ConnectionHealth` (`:20-21`) and
`ServiceConnectionView.health` (`:53`), and their exports (`index.ts:59,67`). See §12.

### 2.2 filesystems service (`@hyperidle/filesystems`)

- `Filesystem` (`filesystem-shape.ts:15-26`), which is also the wire `FilesystemView`: drop `writeback`, add
  `attentionReason: string | null`. `state` stays `"attached" | "reachable" | "needs_attention"`.
- `listInjectedFilesystemsForProvisioning` (`injected-filesystems-for-provisioning.ts:36-49`): drop
  `writeback`, add `attentionReason`.
- New functions in `filesystem-registry.ts`. The tables stay owned by `filesystems` (`table-owners.json:37-38`):
  - `markFilesystemNeedsAttention(exec, id, reason): Promise<{ entered: boolean; agentIds: string[] } | null>`.
    One conditional update:
    `UPDATE filesystems SET state='needs_attention', attention_reason=? WHERE id=? AND state<>'needs_attention' RETURNING id`.
    If a row returns, the filesystem just **entered** *needs attention*: read its agent ids from
    `filesystem_injections` and return `{ entered: true, agentIds }`. If none returns, update only the reason
    (`… SET attention_reason=? WHERE id=?`) and return `{ entered: false, agentIds: [] }`. Return `null` when the
    filesystem does not exist.
  - `markFilesystemReachable(exec, id): Promise<void>` sets `state='reachable'`, `attention_reason=NULL`.
  - `listHeldAgentIds(exec): Promise<string[]>`: `SELECT DISTINCT fi.agent_user_id FROM filesystem_injections fi
    JOIN filesystems f ON f.id = fi.filesystem_id WHERE f.state = 'needs_attention'`. Both indexes exist
    (`schema.ts`, `filesystem_injections_filesystem_idx`).
- Deleted: `filesystem-reachability.ts` (whole file), `FilesystemTokenResolver`, and `lsRemote` from its runner
  port (`ports.ts:6-22`). Also `updateFilesystemState` (`filesystem-registry.ts:46`) if the scan shows no caller
  once the probe is gone.

### 2.3 session-requests service (`@hyperidle/session-requests`)

`ClaimOptions` (`service.ts:1266-1270`) gains `readonly excludeAgentIds?: readonly string[]`.
`claimSessionRequest` (`:1354-1364`) passes it to `claimNextRequestInternal` (`:171-194`), which adds
`notInArray(agentSessionRequests.agentId, ids)` around both branches of its `or(…)` when the list is non-empty.
The port type at `run-orchestration/src/contracts.ts:143` follows.

The by-id selector ignores the option. It is reached only when a caller hands `runSession` a request that is
still `pending` (`runtime.ts:255-278`). Production's only durable caller is the drain (`start-runtime.ts:136`),
which hands over a request it already claimed, so `runtime.ts:262` returns early.

Session-requests receives plain ids only. It reads no filesystems table.

### 2.4 connections service (`@hyperidle/connections`)

`resolveConnectionToken(db, connectionId, decrypt): Promise<string | null>` goes in
`service-connection-resolver.ts`. It reads the row by id, requires `authSource === "token"`, then delegates to
`resolveHeldToken(db, row.userId, connectionId, decrypt)` (`:34-57`). This is "resolved as the connection's
owner": a filesystem row has no user (seams §2). It replaces the per-request, per-user resolver in `app.ts:72-75`
and `routes/filesystems.ts:156-170`.

`updateConnection` (`service-connection-store.ts:77-92`) goes with the validate route, its only caller (§12).

### 2.5 run-orchestration (`@hyperidle/run-orchestration`)

Wired to the services above only through ports that the layer composes (existing precedent:
`provisioner.ts:110-136`, `boot.ts:295-340`).

```ts
// filesystem-provisioning.ts: replaces InjectedFilesystemsReaderPort (:67-69). Field `filesystems` on ProvisionSessionDeps.
interface FilesystemsPort {
	listForAgent(agentId: string): Promise<readonly FilesystemForProvisioning[]>;
	/** Agents using any needs_attention filesystem; the drain excludes them from the claim. */
	listHeldAgentIds(): Promise<readonly string[]>;
	resolveCredential(connectionId: string): Promise<string | null>; // PAT, as the connection's owner
	/** Placement failed: mark needs_attention with this reason (and notify if it just entered). */
	markNeedsAttention(filesystemId: string, reason: string): Promise<void>;
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
// Plain function, used by DELETE /api/filesystems/:id. Remote kept copies only; never a local repo.
forgetKeptCopy(keptCopiesRoot: string, filesystem: Filesystem): Promise<void>;

// errors.ts
class FilesystemUnavailableError extends Error { /* name "FilesystemUnavailableError"; filesystemId; reason */ }

// filesystem-check.ts (new): used by the Check route, by registration, and to phrase placement-failure reasons
checkFilesystem(fs: Filesystem, deps: { credential: string | null; gitRunnerFactory; ghAuthStatus }): Promise<FilesystemCheckResult>;
interface FilesystemCheckResult {
	readonly ok: boolean;
	readonly reason: string | null; // plain words, redacted; names a missing CLI; null when ok
}

// git-credential-env.ts (new, pure)
gitCredentialEnv(remoteUrl: string, token: string | null): Record<string, string>; // §6
// filesystem-instructions.ts (new, pure)
describeMountedFilesystems(mounted: readonly MountedFilesystem[]): string;          // §9
```

`FilesystemForProvisioning` (`filesystem-provisioning.ts:49-59`) and the local `Filesystem`
(`mounter.ts:29-39`) drop `writeback` and add `attentionReason`. `RegistryFilesystemMounter` takes
`keptCopiesRoot?: string` (§5.2).

### 2.6 Layer root (`layers/agent-orchestration/src/`)

- `git-runner.ts`: the verb changes are listed in §6.3.
- `cli-status.ts` (new): `ghAuthStatus(token: string | null): Promise<"logged_in" | "logged_out" | "not_installed">`
  spawns `gh auth status --hostname github.com` with `{PATH, HOME}`, plus `GH_TOKEN` when a token is given.
  An `ENOENT` spawn error means not installed. Exit 0 means logged in; any other exit means logged out. No
  separate "installed" probe: an `ENOENT` from this spawn, or from git's own spawn, is the detection. It lives
  beside `git-runner.ts` because this layer root is where processes are spawned.
- `filesystem-attention.ts` (new): `recordFilesystemNeedsAttention(db, eventBus | undefined, filesystemId, reason)`.
  It calls `markFilesystemNeedsAttention` and, **only when `entered` is true**, publishes
  `filesystem_needs_attention` with the redacted label (from `resourceRef`) and the returned `agentIds`. It is
  the only emit site. Three callers: the boot port's `markNeedsAttention` (placement failure), the Check route,
  and registration (§4.3).
- Routes and boot wiring (§4.4, §7.3). They import the services directly, in the same shape as the existing
  `routes/filesystems.ts:28-39` (`@hyperidle/filesystems`), `routes/agent-orchestration-intake.ts:47`
  (`@hyperidle/session-requests`), `app.ts` (`resolveHeldToken`) and `boot.ts:54,64`.

### 2.7 HTTP (`/api/filesystems`, hosted by agent-orchestration, `app.ts:76`)

| Route | Change | Request → response |
|---|---|---|
| `POST /api/filesystems` | changed | body `{ teamId, kind: "code"\|"doc_set", connectionId?: string\|null, resourceRef }` with `writeback` and `sourceHint` **removed** → `201 { filesystem: FilesystemView, check: FilesystemCheckResult }`. Rules below |
| `GET /api/filesystems?teamId=\|agentUserId=` | fields only | `{ filesystems: FilesystemView[] }` (no `writeback`, adds `attentionReason`) |
| `GET /api/filesystems/:id` | **deleted** | Its only job was the live probe (`routes/filesystems.ts:277-289`). No production caller: the scan found only `core-api/src/__tests__/AO1-filesystems.integration.test.ts` and a story comment |
| `POST /api/filesystems/:id/check` | **new** | → `200 { filesystem: FilesystemView, check: FilesystemCheckResult }` \| 404 |
| `DELETE /api/filesystems/:id` | changed | Also forgets the kept copy (`:291-303`) → 204. Nothing to release: the injections cascade, so the agents leave the exclusion |
| `DELETE /api/filesystems/:id/injections/:agentUserId` | unchanged | Removing the injection is itself the release (`:306-316`) |
| `POST /api/filesystems/inspect-path` | unchanged | used by the dialog and onboarding |
| `POST /api/filesystems/:id/injections` (core-hosted, `core-api/src/routes/filesystems.ts:59`) | unchanged | Picking a broken filesystem for another agent holds that agent too, which is correct |
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
- After the insert, run Check and persist it (§7.3). A failing check on registration enters *needs attention*
  and so sends the notice, like any other entry.

---

## 3. Schema: migration `0082_filesystem_attention`

Hand-written `framework/db/drizzle/0082_filesystem_attention.sql`, plus a journal entry
`{ idx: 82, version: "7", when: <epoch ms>, tag: "0082_filesystem_attention", breakpoints: true }`
appended after `0081_drop_items_layer` (`meta/_journal.json`), following `framework/db/drizzle/README.md`.

```sql
-- Verdicts written by the deleted reachability probe are not trustworthy
-- (it called every public remote with no connection unreachable). Under the
-- claim-time hold every agent using such a row would never be claimed again,
-- so they must go. The first session or the first Check writes a real one.
UPDATE "filesystems" SET "state" = 'attached' WHERE "state" = 'needs_attention';
--> statement-breakpoint
ALTER TABLE "filesystems" DROP COLUMN "writeback";
--> statement-breakpoint
ALTER TABLE "filesystems" ADD COLUMN "attention_reason" text;
--> statement-breakpoint
ALTER TABLE "service_connections" DROP COLUMN "health";
--> statement-breakpoint
ALTER TABLE "service_connections" DROP COLUMN "last_validated_at";
```

`framework/db/src/schema.ts` mirrors every change in the same commit:

- `filesystems` (`:1109-1143`): delete `writeback` (`:1132`), add `attentionReason`. Rewrite the `state`
  comment (`:1133`): the state is written by placement and Check, not by a route transition.
- `serviceConnections` (`:1498-1520`): delete `health` and `lastValidatedAt` (`:1516-1517`).
  `serverCredentials.lastValidatedAt` (`:1189`) is a different table and stays.

Existing rows:

- `writeback` data is dropped; it was only ever read by the probe short-circuit
  (`filesystem-reachability.ts:78`).
- `needs_attention` rows become `attached`. **This reset is load-bearing**: without it, a probe verdict from
  before this change would hold its agents forever with no reason on the row.
- Connection health data is dropped; its only writer was the unused validate route.
- `source` values stay as they are, because display is all they are used for.

No new table, no new status, no constraint change, so `table-owners.json` and
`agent_session_requests_correlation_ck` are unchanged.

---

## 4. The hold

### 4.1 Mechanism: a claim-time filter

The plan says a held session waits "the way a session already waits when too many are running": not started,
task still ready. The concurrency path releases the claim back to `pending` (`runtime.ts:441-446`). The hold
does the same, and adds one thing: while any of an agent's filesystems is *needs attention*, the drain's claim
never selects that agent's pending requests (§2.3). So nothing retries a broken filesystem, and requests queued
behind a held one are not stalled.

The drain builds the list on every claim: `excludeAgentIds: await deps.runtime.filesystems?.listHeldAgentIds() ?? []`
(`start-runtime.ts:91-95`). The ids come from the filesystems port boot already builds (`boot.ts:331-334`,
passed into the drain's `deps.runtime` at `boot.ts:384-386`).

What the user sees: no session, the task stays `accepted`.

### 4.2 The first failing attempt

The first request of an agent whose filesystem breaks is claimed normally, because the filesystem is not yet
*needs attention*. Inside `admitSession` (`provisioner.ts:1050`), adapter selection, the concurrency check,
spawn or adopt, and the session-row update run unchanged (`:1109-1231`). Then **placement (Phase 4.5, replaces
`:1233-1243`)** places each filesystem (§5). On the first failure:

1. unmount what *this* admission placed (not `adopted` ones);
2. call `adapterPool.release(adapterId)`, as the concurrency path does at `:1154`;
3. call `workspace.destroy(sandboxHandle)` unless this is a resume (`params.resume?.sandboxPath`, `:1190`),
   because an adopted workspace is the agent's own work;
4. call `deps.filesystems.markNeedsAttention(filesystemId, reason)` and **await it**;
5. only then throw `FilesystemUnavailableError`.

The reason comes from `checkFilesystem` run once on the failing filesystem, so it says what to fix. If Check
unexpectedly passes, the adapter's own error text is used instead. If step 4 itself throws, that error
propagates instead, and the request fails through the ordinary failure path. It is never retried in a loop.

In `runClaimedRequest` (`runtime.ts:332`), a new branch beside the concurrency branch (`:441-446`), before any
failure handling:

```text
if err instanceof FilesystemUnavailableError:
    delete the reserved sessions row (WHERE request_id = ? AND state = 'active')
    ports.sessionRequests.releaseClaim(db, request.id, request.claimToken)   // claimed → pending
    rethrow
```

The reserved row is **deleted, not crashed**. `reserveOrAdoptSession` adopts any existing row for the request
(`runtime.ts:62-67`), so a crashed row would be adopted by the next attempt. Nothing references it yet:
`session_started` is emitted only at the end of admission (`provisioner.ts:1294`), and
`agent_session_requests.session_id` is written only on `running`. The builder confirms no row referencing
`sessions.id` is written before Phase 4.5; the delete fails loudly on a foreign key if one is. Deleting it also
keeps it out of the concurrency count (`:1141-1147`).

No `agent_run_lifecycle_changed`, no `agent_run_admission_failed` and no `session_ended` is emitted. So core
never marks the dispatch attempt failed (`agent-run-admission-reactions.ts:92-94`), and the task stays
`accepted`: it moves to `in_progress` only on `session_started` (seams §9).

**The drain (condition (i)).** `classifyAdmissionFailure` (`start-runtime.ts:211-226`) maps
`FilesystemUnavailableError` to the new code `FILESYSTEM_UNAVAILABLE` (added to `AgentAdmissionFailureCode`,
`:204-208`). The catch skips the explicit-start `failed` projection (`:172-179`) for that code and then
**`return`s**, exactly like `CONCURRENCY_LIMIT` (`:196`).

Why `return` rather than trusting a fresh exclusion list on the next claim: it is fail-safe. If the attention
write ever does not land, the worst case is one attempt per 1 s tick (`start-runtime.ts:326`), never an
in-call busy loop. The lore at `start-runtime.ts:180-195` records exactly that loop for the concurrency release:
100 % CPU, health checks unserved. The cost is that other agents' queued requests start up to 1 s later, once
per failure. The next wake reads the exclusions fresh, so the held agent's request is skipped from then on.

A pending request has no lease, so the intent reaper leaves it alone (`service.ts:861-863` reaps only when the
request is terminal), and boot recovery reads only `running` (`start-runtime.ts:18`).

### 4.3 Entering and leaving *needs attention*

**Entering** always goes through `recordFilesystemNeedsAttention` (§2.6), whatever caused it:

| Cause | Caller |
|---|---|
| a placement fails | boot's `FilesystemsPort.markNeedsAttention` |
| a Check fails | `POST /:id/check` |
| the check on registration fails | `POST /` |

**Leaving** needs no release code. The exclusion list is derived from the rows, so it ends when:

- *Check* passes → `markFilesystemReachable`;
- the filesystem is removed from the agent → the injection row is gone;
- the filesystem is deleted → the injections cascade (`schema.ts`, `filesystem_injections.filesystem_id … onDelete: cascade`).

The drain picks the waiting requests up on its next tick (≤1 s). Nothing retries a broken filesystem on its
own: a filesystem fixed without pressing Check stays *needs attention*, and its agents keep waiting.

### 4.4 Boot wiring

`boot.ts` `buildProvisioningReads` (`:295-340`) replaces `injectedFilesystems` with `filesystems: FilesystemsPort`:

- `listForAgent`: `listInjectedFilesystemsForProvisioning(db, agentId)`, as today (`:331-334`).
- `listHeldAgentIds`: `listHeldAgentIds(db)`.
- `resolveCredential`: `resolveConnectionToken(db, id, decrypt)` (§2.4).
- `markNeedsAttention`: `recordFilesystemNeedsAttention(db, eventBus, id, reason)`. `buildProvisioningReads`
  gains the `eventBus` argument (`boot.ts:345`).

The `mounter` construction (`boot.ts:302-307`) gains `keptCopiesRoot: runtime.keptCopiesRoot` (§5.2).
`AgentOrchestrationRuntimeOptions` (`boot.ts:109-142`) gains `readonly keptCopiesRoot?: string` beside
`sandboxBasePath`.

`createAgentOrchestrationApp` is called at `boot.ts:394`. Its options (`app.ts:35-54`) gain
`eventBus?: EventBus` and `keptCopiesRoot?: string`, both passed from what boot already holds
(`options.eventBus`, `options.runtime?.keptCopiesRoot`). The app hands them, with `resolveConnectionToken`, to
`createFilesystemRoutes`. An absent `eventBus` (bare test apps) means no event. An absent `keptCopiesRoot` means
DELETE has no kept copy to forget.

That wiring across services is legal within one layer (`wire-within-one-layer`, `governance-model.ts:324-331`;
seams §2 cites `:295-296`).

### 4.5 Exactly one notification per episode

An episode starts when a filesystem enters `needs_attention` and ends when it leaves (Check passes).

- The conditional update in `markFilesystemNeedsAttention` returns a row only on the transition into
  `needs_attention`. Only then is the event emitted. This holds for every cause in §4.3: one rule, no special
  case.
- A failure on a row already in `needs_attention` (a second failing Check, a failing attempt that raced the
  first) only updates the reason. No event.
- Because held agents are never claimed, a second session of the same agent, or of another agent sharing the
  filesystem, never even reaches placement.
- `markFilesystemReachable` moves the row out, so the next failure is a new episode and notifies again.

### 4.6 The "blind executor" rule

Orchestration reads only its own tables, all owned inside agent-orchestration: `filesystems` and
`filesystem_injections` (filesystems), `service_connections` (connections), `agent_session_requests`
(session-requests), and `sessions` (run-orchestration) (`table-owners.json`). It never reads core.

It never starts work on its own. Every held request is one core already sent; the hold only delays running it,
and only a person's action on an orchestration route ends it. Its one outward act is the
`filesystem_needs_attention` event. Core's subscriber resolves the agents' names from core's own `users` (§8).
This matches the founder rulings recorded at `provisioner.ts:79-99` and in memory: no read of core, no push.

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

**Where kept copies live.** Outside `sandboxBasePath`, in the application's own data folder. The sandbox
reaper deletes any folder under `sandboxBasePath` that has no session row once it is older than 24 h
(`run-orchestration/src/runtime-reapers.ts:78-99`), and the desktop enables it
(`applications/desktop/src/create-server.ts:289-290`). `sandboxBasePath` also defaults to the temp folder
(`:178-181`), which a reboot clears.

| Application | Data folder today | `keptCopiesRoot` |
|---|---|---|
| desktop | the PGlite directory `userData/hyperidle-pg` (`applications/desktop/src/main.ts:48-49,395,435`); installed plugins already live beside it (`create-server.ts:149-167`) | `path.join(path.dirname(dbUrl), "kept-copies")`, computed in the same block as `pluginsBaseDir`; overridable by `deps.keptCopiesRoot` like `sandboxBasePath` (`:60`) |
| remote-server, `laptop` profile (PGlite) | beside the database (`applications/remote-server/src/create-server.ts:233-246`) | same rule, same block |
| remote-server, `vps`/`cloud` (Postgres) | none: the database is a URL, not a folder (`profiles.ts:20-26`) | absent (§17.7) |

Both applications pass it in their `runtime` block (`desktop/src/create-server.ts:273-279`,
`remote-server/src/create-server.ts:389-394`) beside `sandboxBasePath`.

**Dev checkout.** A relative database path resolves against the repo root (`desktop/src/create-server.ts:118-124`),
so a dev run puts kept copies at `<repo>/kept-copies`. Add `kept-copies/` to `.gitignore` (beside
`installed-plugins/` and `hyperidle-pg/`, `.gitignore:37-38`) and `!**/kept-copies` to `biome.json`
`files.includes` (`:136-160`). Biome does not read `.gitignore`, so without this it would lint the cloned
repositories. Vitest scans only the package projects (`vitest.config.ts:4,94`).

**The copies:**

- **Local repo** (`isLocalRepoPath`): the kept copy *is* the person's repository, after `normalizeLocalPath`
  (`mounter.ts:235-248`). No fetch; HyperIdle never touches their remotes. `base = <branch>`, verified with
  `git rev-parse --verify --quiet <branch>^{commit}`.
- **Remote**: `<keptCopiesRoot>/<filesystemId>`.
  - With no `keptCopiesRoot`, the mount fails with "this server has no folder to keep repository copies in".
    Local repos and folders are unaffected.
  - First mount: `git clone --no-checkout -- <url> <keptCopy>` with the credential env from §6.
  - Every mount after that: `git -C <keptCopy> fetch --prune origin`, same env.
  - `base = origin/<branch>`.
  - Full clone, not shallow, so a pushed branch has history.
  - Lifetime: until the filesystem is deleted. `DELETE /api/filesystems/:id` calls
    `forgetKeptCopy(keptCopiesRoot, filesystem)`, which does `rm -rf <keptCopiesRoot>/<id>`, for remotes only
    and never for a local repo.
- **Worktree**: `git -C <keptCopy> worktree prune`, then `git -C <keptCopy> worktree add -b
  hyperidle/<sessionId> -- <workspace>/<folderName> <base>`. It is always a new branch off the configured branch
  (today it branches off HEAD and ignores `ref.branch`: `mounter.ts:151`).
- **No lock.** Production admits sessions only through the single drain, which awaits each in turn
  (`start-runtime.ts:90-141`, `:293-296`), so two placements never run at once. The eval tool
  (`tools/eval/src/provision-harness.ts:305`) is a separate process that an in-process lock could not protect
  anyway.
- **Timeouts**: clone 10 min, fetch 2 min, worktree ops use the existing 120 s (`git-runner.ts:121`). Admission
  is awaited in the drain, so a first clone of a large repository delays the queue (§17.8).

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

**A public repository needs only git.** Git asks a credential helper only when the server answers that it needs
a login. An anonymous clone or fetch of a public github.com repository therefore never runs `gh`, even with the
helper attached, and works on a machine without `gh`. T3(b) proves this with `gh` absent from `PATH`.

| Process | Env | Source |
|---|---|---|
| HyperIdle's git: clone, fetch, ls-remote, worktree ops | runner allowlist (`git-runner.ts:152-173`) + `gitCredentialEnv` | PAT from `resolveConnectionToken` |
| `gh auth git-credential` (child of git, only after the remote asks) | inherits git's env: `GH_TOKEN` if set, else the person's login through `HOME` | gh itself |
| The agent's harness process, which runs the agent's own `git push` and `gh` | `mcpTokenEnv` gets every mount's `agentEnv` | same values |

**Where the agent env merges.** Today the connection env merges inside `if (serviceConnectionResolver) { try { … } }`
(`provisioner.ts:1641-1668`). The mounts' `agentEnv` merges **after and outside** that block, unconditionally
whenever it is non-empty. A filesystem's PAT then reaches the agent even when connection provisioning is not
wired or its `try` fails, and it overrides a connection-provisioned `GH_TOKEN`.

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
- Change `lsRemote(url, {env, branch})` to `git ls-remote --exit-code -- <url> refs/heads/<branch>`. Its result
  distinguishes three outcomes: found; exit 2, meaning the branch does not exist; and any other failure, with
  a flag `authRequested` when stderr says git needed a login. The probe for this document saw
  `could not read Username` (no credential) and `Authentication failed` (rejected credential) with git 2.39.5
  (§14.1).
- Keep `worktreeRemove` (`:360`), which gains its first production caller.
- A spawn `ENOENT` is reported as "git is not installed", not as a git error.
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

| Place | Why it cannot get there | Proven by (§14) |
|---|---|---|
| `agent_session_requests.payload_json` | Filesystems are read live at spawn and never baked (`admit-session-live-filesystems.integration.test.ts:18-20`); the PAT is resolved inside admission | T8 asserts the PAT is absent from the row |
| `sessions` row | Only `sandbox_snapshot` (a path) is written (`provisioner.ts:1205-1231`) | T8 |
| kept copy `.git/config`, worktree, `$HOME/.gitconfig` | env only; URL userinfo rejected | T3 reads the produced files |
| event, notification, `filesystems.attention_reason` | reason and label pass `redactSecrets` | T1 (unit), T7, T8 |
| log lines | argv-only logging; token in env | structural (§6.3). UNVERIFIED whether `@hyperidle/diagnostics` has a capture sink a test could assert on. If it does, T8 asserts on it |

---

## 7. Detection and Check

### 7.1 Which CLIs each filesystem needs

- Folder: none.
- Git, local repo: `git`.
- Git, remote other than github.com: `git`.
- Git, `https://github.com/` remote: `git`. **`gh` too, only when** the filesystem has a token connection (the PAT
  reaches git through `gh`), **or** the remote asked for a login (a private repository relying on the person's
  `gh` login).

`rclone` joins in phase 2.

### 7.2 What Check does (`checkFilesystem`)

The remote is reached first; `gh` is asked only when that answer says it is needed.

| Kind | `ok` when |
|---|---|
| folder | path exists and is a directory |
| git local | git runs; path is inside a work tree (`revParseIsInsideWorkTree`); `verifyCommit(branch)` passes |
| git remote | git runs; connection set ⇒ token resolves **and** `ghAuthStatus(PAT)` is `logged_in`; `ls-remote --exit-code … refs/heads/<branch>` with `gitCredentialEnv` succeeds |

Order for a git remote, first failure wins:

1. Connection set but the token does not resolve → "the GitHub token connection for this filesystem is missing
   or cannot be decrypted".
2. Connection set → `ghAuthStatus(PAT)`: `not_installed` → "Install the GitHub CLI (gh): HyperIdle hands your
   GitHub token to git through it"; `logged_out` → "The GitHub token was rejected. Replace it in Settings →
   Connections". With a PAT, `gh auth status` validates it against GitHub, so this catches a revoked token even
   on a public repository, where git would never ask (break #5).
3. `ls-remote`:
   - found → ok;
   - git missing → "Install git";
   - exit 2 → "branch `<b>` not found";
   - `authRequested` on a github.com remote with no connection → `ghAuthStatus(null)`:
     `not_installed` → "This repository needs a GitHub login. Install the GitHub CLI (gh) and run `gh auth login`,
     or add a GitHub token connection"; `logged_out` → "This repository needs a GitHub login. Run
     `gh auth login`, or add a GitHub token connection"; `logged_in` → "Your GitHub login has no access to this
     repository, or it does not exist". GitHub answers the same for a private and a missing repository;
   - anything else → the redacted git error.

`gh auth status` semantics, verified with gh 2.92.0:

- exit 0 when logged in;
- exit 1 when logged out, and exit 1 for an invalid `GH_TOKEN` ("The token in GH_TOKEN is invalid");
- `--json hosts` exits 0 even when logged out, printing `{"hosts":{}}`, so only the exit code is used.

**Not reused: the inherited probe** (`inherited-reach.ts:343-392`). It uses `--json hosts`, cannot tell
logged-out from logged-in, and counts the top-level `hosts` key as a login (§17.5).

### 7.3 What Check returns and persists

`POST /api/filesystems/:id/check` returns `{ filesystem, check }`:

- `ok` → `markFilesystemReachable`. That ends the hold (§4.3).
- not ok → `recordFilesystemNeedsAttention(reason)`: notice if it just entered, reason only if it was already
  there (§4.5).

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
- On `filesystem_needs_attention` it resolves each of `agentIds` to a name with `findUser` (as `describeAgent`
  does at `agent-health…:110-119`) and enqueues one `notification_queue` row:
  - `eventType: "filesystem_needs_attention"`, `subjectId: filesystemId`, `severity: "blocking"`,
    `status: "pending"`, `reason: "filesystem_needs_attention"`, `sourceLink: "/settings"`.
    Settings is one stacked page (`SettingsPage.tsx:2-5`).
  - `title: "Filesystem needs attention: <label>"`.
  - `body: "<reason> <names> won't start work until it's fixed. After fixing it, press Check in Settings → Filesystems."`
    With no agents (a failing check on registration, before any agent has it), the middle sentence is dropped.
  - `typeKey` is left null, exactly like the agent-health row. `NotificationTypeKey` (`domain-model/src/notifications.ts:23`)
    is unchanged. UNVERIFIED: how the popover renders a null `typeKey`. Agent-health rows already do this, so
    check it at G2.
- One shared inbox (plan: BA7 adds addressing). No dedupe in the subscriber: the once-per-episode guarantee is
  orchestration's conditional update (§4.5).

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
    unexported `AddConnectionDialog` (`SettingsConnections.tsx:90-180`, about 90 lines): design-system Dialog,
    Select and Input, `apiFetch`, inline error.
  - Fields:
    - Kind: Git repository or Folder.
    - Location: path or URL.
    - Branch: prefilled through `POST /api/filesystems/inspect-path` for a local path.
    - "GitHub token (optional)": a Select of held `token` connections with service `github`, from
      `GET /api/connections`, shown only for `https://github.com/` URLs.
  - On submit it posts, refreshes, and shows the returned check's reason when not ok.
  - Each row gets a **Check** button (`POST /:id/check`).
  - A `needs_attention` row shows `attentionReason`. The reason already names a missing CLI ("Install the GitHub
    CLI (gh)…"); there is no separate CLI line.
  - Remove `writeback` from `FilesystemApiItem` (`:22-32`).
  - Update `SettingsFilesystems.stories.tsx`: drop write-back; add a needs-attention row with its reason and an
    open-dialog story. Populated real states only.
- **`SettingsConnections.tsx`**: connection health goes (§12). Delete `healthToStatus`, `healthLabel`, the
  health sort in `bySeverity` (`:50-57,74-78`; sort by service name only), `showChip` and the `StatusChip`
  (`:241-259`), the `ConnectionHealth` import (`:25`), and the header comment's health lines (`:5-7,12`). Same in
  `SettingsConnections.stories.tsx` (`:53-107,147,159,173`).
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
| Migration, schema, types, event, team response, kept-copies wiring in two apps, ignore entries | ~85 | — |
| Git runner verbs, env, redaction, credential env, ENOENT and auth-requested reporting | ~150 | ~70 units |
| Git adapter (kept copy, worktree, recognition, unmount, forget, naming) + folder change + placement orchestration | ~270 | ~260 adapter integration + ~140 test git server |
| Instructions section, provisioner edits (failure cleanup, env merge, trusted paths, three teardown sites) | ~90 | ~40 |
| Hold: error, runtime branch, drain code, claim option, held-agents read, attention writer + emitter, boot port | ~75 | ~40 claim-filter integration |
| Check + `gh` status probe + filesystems writers + owner token resolve + routes | ~210 | ~150 |
| Core subscriber + registration | ~60 | ~70 |
| Cross-layer hold proof (T8, absorbs old T6) | — | ~200 |
| UI: dialog, Check, reason, stories, onboarding, connection-health removal | ~200 | ~100 |
| **Total** | **~1,050–1,250** | **~950–1,150** |

**About 2,000–2,400 added lines: far above 1,000. Production alone is above 1,000. Stop here: this needs the
maintainer's answer before any code is written (CLAUDE.md, Simplicity Sanity Check).**

Down from ~2,300–2,700: the claim-time filter replaced the `waiting` status, park/release and the notice column
(~−250 with tests); the CLI list and per-copy lock went (~−100).

The assumptions that drive the size, all from the approved plan:

1. A **real Add-filesystem dialog** with Check and reason display in phase 1. (~300 with tests.)
2. **Remote kept copy plus worktree per session** instead of a clone per session: fetch, recognition, forget.
   (~120.)
3. G2's **private-remote proofs** need an offline authenticated git server stand-in for github.com. Test-only,
   large up front. (~140 helper.)
4. Sessions **hold** instead of failing, with one notice, proven end to end across two layers. (~420 with tests.)

Remaining cuts, each a plan amendment and not mine to take:

- **(a)** Move the UI (dialog, Check button, reason display) into its own item right after this one, with
  Check reachable by API only. Saves ~300.
- **(c)** Clone per session for remotes, dropping the kept copy. Saves ~120, but contradicts a ruling.

Even (a)+(c) leaves ~1,600. **No cut that keeps G2's list gets under 1,000.** The maintainer decides whether to
accept this size for this item. This document does not re-slice it.

---

## 12. Deletions and scans

Find every site by scanning. Each scan must find something, and an empty result is a failure, not a pass.
Run from the repo root:

```sh
rg -n -a 'writeback' layers framework applications tools -g '!**/node_modules/**' -g '!**/dist/**' | rg -v -i 'knowledge|writeback-processor|WritebackProcessor|beginAgentWriteback|sandbox_writeback' || { echo "scan found nothing"; exit 1; }
rg -n -a 'GitCloneAdapter|GitWorktreeAdapter|captureBack|captureMountedFilesystems|MalformedFilesystemError|writeExclude' layers -g '!**/node_modules/**' -g '!**/dist/**' || { echo "scan found nothing"; exit 1; }
rg -n -a 'resolveFilesystemState|refreshFilesystemState|FilesystemTokenResolver|extraHeader|tokenConfig|buildAuthResolver|checkAndPersistState|sourceHint' layers -g '!**/node_modules/**' -g '!**/dist/**' || { echo "scan found nothing"; exit 1; }
rg -n -a '/validate|updateConnection' layers/agent-orchestration -g '!**/node_modules/**' -g '!**/dist/**' || { echo "scan found nothing"; exit 1; }
rg -n -a 'ConnectionHealth|CONNECTION_HEALTH|toHealth|healthToStatus|healthLabel' layers framework applications tools -g '!**/node_modules/**' -g '!**/dist/**' || { echo "scan found nothing"; exit 1; }
# service_connections health / last_validated_at only; server_credentials.last_validated_at is a different table and stays.
rg -n -a 'health|lastValidatedAt|last_validated_at' layers/agent-orchestration/connections layers/agent-orchestration/src/routes/connections.ts layers/core-ui/src/settings/SettingsConnections* framework/domain-model/src/connection.ts layers/core-api/src/services/__tests__ -g '!**/node_modules/**' | rg -v -i 'agent-?health|harness' || { echo "scan found nothing"; exit 1; }
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
| Stale admission comment ("ALL admission failures … throw BEFORE the P5 row insert") | `provisioner.ts:1041-1044` | say the reserved row exists; `runtime.ts` crashes it or, on a hold, deletes it |
| Reachability probe incl. header construction | `filesystems/src/filesystem-reachability.ts` (whole), `ports.ts:18-22`, `index.ts:7-8` | `checkFilesystem` |
| Per-user resolver, `buildAuthResolver`, `checkAndPersistState`, `sourceHint`, `writeback` enum, `GET /:id` | `routes/filesystems.ts:41-52,78-81,104-170,277-289`; `app.ts:72-75` | §2.7 |
| Connection validate route + `updateConnection` (its only caller is `:421`) | `routes/connections.ts:373-424`, `connections/src/service-connection-store.ts:77-92`, `index.ts:42`; rate-limit note `:14` | nothing |
| **Connection health** | columns: schema `:1516-1517` + migration 0082; view: `domain-model/src/connection.ts:20-21,53`, `index.ts:59,67`; route: `routes/connections.ts:48,127-148` (`toHealth`, row mapping) and the `health: "needs-attention"` inserts `:294,318`; inherited mapping `connections/src/inherited-reach.ts:437`; UI §10; fixtures in `core-api/src/services/__tests__/*`, `connections/src/__tests__/*`, `domain-model/src/__tests__/AN1-connection-types.test.ts` | nothing. If the scan then finds no reader of the inherited fact's own `health` (`connections/src/types.ts:39`, computed at `inherited-reach.ts:132-205,351-392`), that computation goes too; knip decides |
| `writeback` column and type fields | schema, `filesystem-shape.ts:23`, reader `:45`, `filesystem-provisioning.ts:56,107`, `mounter.ts:36`, route mapper `:98`, UI type, stories, SetupFlow | migration 0082 |
| `GIT_CONFIG_NOSYSTEM`/`GIT_CONFIG_GLOBAL` nulling | `git-runner.ts:174-175` | person's own config (§6.3) |
| Tests | `run-orchestration/src/__tests__/{git-clone-adapter,git-worktree-adapter,git-worktree-live-proof}.integration.test.ts` deleted; `local-folder-adapter.integration.test.ts`, `mounter-registry.test.ts`, `filesystem-provisioning.test.ts`, `admit-session-live-filesystems.integration.test.ts` rewritten; `filesystems/src/__tests__/{AO1-filesystem-reachability.test.ts,AO1-reachability-lane-b.integration.test.ts,probe-internals.test.ts}` deleted; the connection-validate tests (find with `rg -l '/validate' layers/agent-orchestration`) deleted; every other `writeback` and connection-health fixture updated | — |

`SANDBOX_SCAFFOLDING_PATHS` stays: it is used by folder naming (§5.3).

---

## 13. Build order

One builder, in sequence. Each leaf ends with `npm run check`, `npm run lint`, `npm run test`, and
`npm run test:integration:service -- <touched files>` green. All leaves land in one PR.

1. **L1 — Schema, write-back and connection health removal.** Migration 0082 + journal, `schema.ts`,
   `FilesystemView` (drops write-back, adds `attentionReason`), `CreateTeamResponse.agentIds` + teams route,
   every write-back site (UI, SetupFlow, stories, fixtures), every connection-health site (view, route,
   `SettingsConnections`, stories, fixtures). *No dependency.*
2. **L2 — Git runner and credentials.** Runner verbs, env option, stop nulling config, `redactSecrets`,
   ENOENT and auth-requested reporting, `gitCredentialEnv`, `cli-status.ts`; the test git server helper (§14.1);
   T1, T2. *After L1.*
3. **L3 — One git adapter, placement, instructions, teardown.** `GitRepositoryAdapter`, folder adapter naming,
   kept copies under `keptCopiesRoot` and its wiring through both applications and boot, the ignore entries,
   recognition, `unmount`/`forgetKeptCopy`, root exclude, `trustedPath`, agent env merge outside the connection
   block, `## Filesystems` section, the three teardown sites. Delete the old adapters and their tests,
   `Provisioner.mount`/`capture`, and the stale comment. For now a mount failure throws a plain error. T3, T4,
   T9. *After L2.*
4. **L4 — Check and detection.** `checkFilesystem`, filesystems writers, `resolveConnectionToken`,
   `recordFilesystemNeedsAttention` and the event, the `POST /:id/check` route, Check on registration, POST
   validation, `DELETE` forgetting the kept copy. Delete the probe, `GET /:id` and the validate route. T5.
   *After L3.*
5. **L5 — Hold and notification.** `FilesystemUnavailableError`, placement-failure cleanup, the `runtime.ts`
   branch (delete reserved row, release claim), the drain code and its `return`, `excludeAgentIds`,
   `listHeldAgentIds`, the boot port, core subscriber + registration. T7, T8, T12. *After L4.*
6. **L6 — Surfaces.** Add dialog, Check button, reason display, stories, onboarding picks the filesystem for its
   agent. T10, T11. *After L4 (route shapes) and L1 (team response).*

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
and leaf with `openssl` at start, holds bare repos (each either public — no auth — or private), sets
`http.receivepack true`, and returns `{ proxyUrl, caPath, home(), branches(repo) }`. It hard-fails naming each
missing binary (`git`, `gh`, `openssl`, `git-http-backend`), same shape as
`connections/src/__tests__/require-binary.ts`. Tests put the stand-in's `.gitconfig`/`hosts.yml` in a temporary
`HOME` with `vi.stubEnv("HOME", …)`. The runner reads `process.env.HOME` at spawn (`git-runner.ts:166-170`).

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
| T2 | runner reaches remotes with the person's setup + gh | `layers/agent-orchestration/src/__tests__/git-runner-credentials.integration.test.ts` · service | through the stand-in: `lsRemote` ok with PAT, ok with `hosts.yml` login; fails with `authRequested` for a wrong PAT and for no login; exit 2 reported as branch missing | restoring `GIT_CONFIG_GLOBAL=/dev/null` (proxy/CA unread → fails); removing env helper → 401 |
| T3 | one git adapter | `run-orchestration/src/__tests__/git-repository-adapter.integration.test.ts` · service | (a) **local**: worktree at `<ws>/<name>` on `hyperidle/<sid>` whose base is the configured branch while the repo's HEAD is elsewhere. (b) **public remote, no gh**: a public stand-in repo, `PATH` without `gh`, one clone under `keptCopiesRoot`, a second mount **fetches** (a new server commit is visible) and does not re-clone. (c) **PAT**: private repo, mount ok; kept `.git/config`, the worktree and `$HOME/.gitconfig` hold no token. (d) **gh login**: private repo, mount ok with no credential. (e) the agent's push: `git push -u origin HEAD` from the worktree with `agentEnv` + `HOME` → the branch is on the server. (f) two same-basename filesystems → distinct folders. (g) repo gone → `{ok:false}` with a readable reason, no token. (h) `unmount` → gone from `git worktree list`, branch still exists. (i) `forgetKeptCopy` removes the remote copy and never a local repo | branching from HEAD; re-clone per mount; env helper removed; `agentEnv` empty; unmount removed; a gh pre-check before reaching the remote (b fails) |
| T4 | resume recognised; folder linked in | same file + `local-folder-adapter.integration.test.ts` · service | mount the same filesystem twice into one workspace (new sessionId) → `adopted:true`, same branch, no error; folder symlink is `<ws>/<name>` → real folder, recognised twice | recognition removed → `worktree add` "already exists" |
| T5 | Check and detection | `run-orchestration/src/__tests__/filesystem-check.integration.test.ts` · service; `layers/agent-orchestration/src/__tests__/cli-status.integration.test.ts` · service (real `gh`) | local ok / branch missing; folder missing; **public remote ok with `gh` absent from PATH**; private repo with no login and no gh → reason says install gh; with gh but logged out → reason says `gh auth login`; PAT ok; wrong PAT → not ok, reason says the token was rejected (the offline stand-in for a revoked token); connection set but unresolvable → not ok; `ghAuthStatus`: PATH without gh → `not_installed`; empty `HOME`, no token → `logged_out` (offline) | gh consulted before the remote (public case fails without gh); reason order or exit-code handling broken; a `--json` parse would report logged in |
| T7 | notification | `core-api/src/services/__tests__/filesystem-attention-reactions.integration.test.ts` · service (core fixtures run `service-bootstrap`) | one event with two agent ids → one `notification_queue` row naming the filesystem label, the reason and both agents, `sourceLink:"/settings"`; an event with no agents → the row without the agents sentence | subscriber not registered → zero rows |
| T8 | **hold, end to end**: task stays ready, one notice, starts after Check | `core-api/src/__tests__/filesystem-hold-task-stays-ready.integration.test.ts` · service, through `startTestRuntime` (`core-api/src/__tests__/run-orchestration-test-runtime.ts:69`) with the real filesystems port and mounter and a fake session provisioner edge (the harness is not under test) | task dispatched to an agent whose filesystem is a private stand-in repo reached through a PAT connection, with the repo path broken → task `accepted`, request `pending`, **no** `sessions` row, workspace dir gone, filesystem `needs_attention` + reason, **exactly one** `filesystem_needs_attention` event and one inbox row, **no** `agent_run_admission_failed`/lifecycle event. A **second request** for the same agent → never claimed across several drain ticks, still one event. A failing Check → still one event, reason updated. Fix + `POST /:id/check` → both requests run → task `in_progress`. The PAT is absent from `payload_json`, the `sessions` rows, the event and `attention_reason` | claim filter removed (second request attempts placement); conditional update removed (two events); reserved row crashed instead of deleted (next attempt adopts it); any path reaching core's `markFailed` |
| T9 | agent told; teardown; trust; env | `run-orchestration/src/__tests__/filesystem-instructions.test.ts` · unit; `admit-session-live-filesystems.integration.test.ts` (rewritten) · service | section names folder, kind, branch, base and how work gets out; a session run to completion (fake harness) writes `AGENTS.md` containing it, unmounts the worktree and keeps the branch; a session that awaits a verdict keeps its worktree; `trustedPaths` include the kept copy; the harness env carries the filesystem's `GH_TOKEN` with no `serviceConnectionResolver` wired | section not appended; verdict check dropped; env merged back inside the connection block |
| T10 | surfaces | `core-ui/src/__tests__/settings-filesystems.test.tsx` · component | the dialog posts a body without `writeback`, with the chosen connection; Check posts `/check` and renders the returned reason | — |
| T11 | onboarding picks the filesystem | `core-ui/src/__tests__/setup-flow-harness-picker.test.tsx` (extended) · component; a teams-route assertion in `core-api` · service | SetupFlow posts `/api/filesystems` then `/:id/injections` with the response's agent id; the team response carries `agentIds` | injection call removed |
| T12 | claim filter | `session-requests/src/__tests__/claim-exclude-agents.integration.test.ts` · service | with requests for agents A (older) and B pending, `excludeAgentIds:[A]` claims B; an expired `claimed` row of A is not reclaimed either; empty list claims A | filter dropped from either branch |

T6 is folded into T8. Whether a core-api test may import the layer-root port builder is decided by
`npm run lint`. If it may not, T8 assembles the same port from the services' public exports, which is what
boot does.

Deletions and static properties (`GET /:id`, validate route, write-back fields, connection health, dead verbs)
are proven by `npm run check` and knip, not by tests.

### 14.3 G2: live on the running app only

On the desktop build, with real `github.com`:

- a **local repo**: the agent's worktree appears in the workspace and the branch stays after the session;
- a **public remote**, on a machine with `gh` logged out;
- a **private remote through the person's `gh` login**;
- a **private remote through a PAT**: the agent pushes its branch, and a revoked PAT then makes Check show
  *needs attention*;
- a **folder**: the agent edits the real files;
- a **broken filesystem**: the task stays ready, **one** inbox notification appears (verify the popover renders
  the null `typeKey` row), and the session starts after Check;
- a **resume** of an agent with a repository;
- the kept copy sits under the app's data folder (`userData/kept-copies`), not the workspaces folder.

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
  semantics (health is gone).
- The comments in `git-runner.ts:10-25`, `mounter.ts:1-11`, `SettingsConnections.tsx:1-17` and
  `schema.ts:1133,1515`: fix these in code.

---

## 17. Things the plan left unclear

1. **Size**: §11, a blocker for the maintainer.
2. **"Waits the way a session waits when too many are running."** Same visible behaviour and the same release to
   `pending`; the addition is that the claim skips held agents, so nothing retries every second (§4.1). An
   interpretation, not a new outcome.
3. **The notice names every agent using the filesystem**, at the moment it broke. An agent picked for it later
   waits without a new notice until the next episode.
4. **`GH_TOKEN` collision (known limit, unchanged).** Connection provisioning already puts the oldest human's
   GitHub token in *every* session as `GH_TOKEN` (`boot.ts:311-326`, `connection-provisioning.ts:190-196`), which
   overrides the person's own `gh` login inside the agent. This change leaves that behaviour as it is. For a
   filesystem relying on the `gh` login, HyperIdle's own clone uses the login, but the agent's push uses that
   token. A filesystem's own PAT overrides it (§6.1). Two github.com filesystems with different PATs cannot both be
   honoured in one agent env: the last one wins.
5. **Inherited-CLI probe bug (AN1).** `gh auth status --json hosts` exits 0 and prints `{"hosts":{}}` when logged
   out (verified), and `inspectInheritedTools` counts the top-level key as a login (`inherited-reach.ts:365-384`).
   With health removed from the view, Settings → Connections no longer shows a wrong "working". The probe itself
   still reports the inherited GitHub connection as present. Not fixed here; proposed as an item.
6. **Governance event registry drift.** `architecture.json:134` points `eventBus.typesModule` at
   `framework/domain-model/src/events.ts`, a stale copy (583 lines) of the real `framework/event-bus/src/events.ts`
   (687 lines; it lacks `review_verdict`). The new event goes in the real one, and the census will not see it.
   This predates the item.
7. **A Postgres remote-server has no data folder**, so it keeps no copies of remote repositories: remote git
   filesystems hold with "this server has no folder to keep repository copies in". The documented shared backend
   runs no agents (`docs/deployment/shared-backend.md:25-26`), so this reaches only a self-hosted `vps` running
   agents. A data-folder setting for it is a later item if wanted. The existing `installed-plugins` rule applies
   `path.dirname` to a Postgres URL (`remote-server/src/create-server.ts:246`), which is not a folder; not fixed
   here.
8. **The first clone of a large repo blocks the drain.** Admission is awaited sequentially
   (`start-runtime.ts:135-141`), so other agents' sessions wait behind the clone. It is not addressed here.
9. **An explicit session start stays `requested` while held.** Its poller sees no failure. That is consistent
   with "does not start and waits".
10. **GitHub Enterprise and private GitLab** rely on the person's own git setup. The gh helper is attached only for
    `https://github.com/`. A GitHub token connection is accepted only for github.com URLs.
11. **A filesystem fixed without pressing Check stays held.** The plan says nothing retries on its own; Check is the
    only way back.
12. **Connection health removal reaches the inherited rows too.** The view had one `health` field for every row;
    stored rows lose their source, so the field and its chip go for all rows (§12).
13. **BA14's recorded cause is not touched.** Its folder needs the maintainer's word (plan, proposed items).

## 18. Orchestrator decisions after the revision (2026-09-11) — these override the text above

- **Connection health: narrow cut, not the wide one.** Delete only the *stored* columns
  `service_connections.health` and `last_validated_at` (no writer once `validate` goes), and the unused
  `validate` route. **Keep** the connection view's health for *inherited* (detected) connections — it is live
  CLI detection, which the maintainer wants to ship. Held (stored) connections render **no** health chip. Do not
  delete the inherited-health calculation. Its existing bug — GitHub shows working whenever `gh` is installed,
  even logged out — is **not** fixed here; it is a proposed item.
- **The notice** carries every agent the filesystem is picked for, and core resolves their names; a failure at
  registration, before any agent has the filesystem, omits the agents sentence. Accepted as revised.
- **Remote-server on Postgres has no data folder**, so a remote git filesystem there holds with "this server has
  no folder to keep repository copies in". Accepted as a known limit: the documented shared backend runs no agents.
- **Drain `return` on the new failure code** (condition (i)) — accepted as chosen.
