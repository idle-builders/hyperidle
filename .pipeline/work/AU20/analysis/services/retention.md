# retention — Service-as-Product Analysis (revised)

**Verdict: DISSOLVE** the standalone `packages/core-api/retention` package. Not into `dispatch` — the capability **distributes**: the `Reapable` contract co-locates into each owning service (users/knowledge/notifications), and a generic `startReaperSweeps(Reapable[])` scheduler homes at the composition root (`packages/core-api/src/server-factory.ts`), which already wires every sibling scheduler.

Layer: core-api · Owned tables: **0** · Consumers: **0** · Exports: **11**

## What it actually is

A 6-hour in-process `setInterval` TTL sweep. It prunes expired rows across **other services'** tables:

- `login_sessions`, `invite_codes` → owned by `users` (injected `reapLoginSessions` / `reapInviteCodes`)
- `knowledge_access_log` → owned by `knowledge` (injected `reapKnowledgeAccessLog`)
- `notification_queue` → owned by `notifications` (injected `deleteReaped`)
- `propagation_log` → **unowned** (`UNOWNED_SHARED_TABLES`), pruned via a direct `@hyperidle/db` delete

It owns no table and has no consumer. It does not even perform 4 of the 5 deletes — every owned-table delete already lives on the owning service and is injected back as a port. retention contributes only a **schedule + cutoff arithmetic + fan-out aggregation**. That is a scheduled job, identical in kind to the sibling in-process schedulers (notification drain, sandbox reaper, routine scheduler) — value delivered to the operator/platform (bounded storage), not to any consuming service via an API. It is boot wiring, not a product.

## Why NOT fold into dispatch (correcting the original design)

The original design folded retention into `dispatch` and claimed the 4 DI ports would be "deleted outright" because dispatch "imports these services directly." **Both claims are false**, verified against source:

1. **dispatch does not import the owning services.** `packages/agent-orchestration/dispatch/package.json` depends only on `@hyperidle/db`, `@hyperidle/shared`, `drizzle-orm`. It uses the identical injected-accessor pattern retention uses (its routine scheduler takes its own reaper via an injected port, never a direct import). Folding retention in would NOT make the users/knowledge/notifications imports legal, so it would NOT delete the ports — the composition root would still inject the reapables.

2. **The port deletion is produced by the `Reapable`-contract redesign, not by any move.** Collapsing 4 bespoke port signatures into one `reapExpired(now)` contract is **layer-independent**. It happens wherever the scheduler lives.

3. **dispatch is the wrong product home — grouping-by-`setInterval`.** dispatch's product is agent orchestration / routine firing; retention's concern is storage GC. dispatch has a scheduler only because *firing routines IS its product*. The sibling schedulers do **not** live in dispatch — `startNotificationDrain` (notifications), `startSandboxReaper` (session-lifecycle), `startRetentionReaper` (retention), `startRoutineScheduler` are all wired at the composition root (`server-factory.ts`). The coherent home for a table-agnostic `startReaperSweeps` is that same composition root (or a neutral tiny scheduler util), not the agent-orchestration product.

## Target design — the real, layer-independent win

Two shared shapes + one generic scheduler:

### 1. `Reapable` (contract) + `SweepResult` (its return type)
```
interface SweepResult { readonly table: string; readonly deleted: number }
interface Reapable { reapExpired(now: number): Promise<SweepResult> }
```
One uniform "prune your own expired rows" capability. **Each owning service implements it co-located with its schema** (ownership = reads AND writes): `users`, `knowledge`, `notifications` each expose a `reapExpired`, internalizing their own TTL/cutoff windows next to the table they prune. This unifies the four bespoke per-service port signatures (`RetentionUsersReaper` / `RetentionKnowledgeAccessLogReaper` / `RetentionNotificationQueueReaper` / `RetentionReaperDeps`) into **one shared contract** and kills the method-per-table growth vector. This collapse is caused entirely by the contract redesign — it is independent of where the scheduler lives.

`propagation_log` has no owning service. It gets an **inline `Reapable`** constructed at the composition root (a small closure over `@hyperidle/db` doing the existing `status IN ('applied','skipped') AND createdAt < cutoff` delete). Named explicitly here so it is not left implicit.

### 2. `startReaperSweeps(reapables: readonly Reapable[]): () => void`
A table-agnostic periodic scheduler holding a `Reapable[]` and a cadence — nothing else. No per-table knowledge. Homed at the composition root (`server-factory.ts`, which already wires every sibling scheduler) or a neutral tiny scheduler util — **not** in dispatch. Iterates the list on the 6-hour cadence, fans out, aggregates results. New reapable services compose in without editing it.

The 3 TTL constants (`RETENTION_REAPER_INTERVAL_MS`, `TERMINAL_LOG_TTL_MS`, `CONSUMED_INVITE_TTL_MS`) internalize: the interval into the scheduler default; the two TTL windows into the owning services' `reapExpired` implementations, co-located with the schemas they prune.

## Export math

11 → **3** irreducible shared surface: `Reapable`, `SweepResult`, `startReaperSweeps`. (The original "2" undercounted — `SweepResult` is a shared exported type the contract returns, so it must be counted honestly.)

Removed: the whole `packages/core-api/retention` package (3 files, `index.ts` + `ports.ts` + `retention-reaper.ts`), its boot registration, its 4 DI port types, its aggregate deps bundle, and the census-correction lore about raw table access.

## Inside lens

Scheduler becomes table-agnostic: a `Reapable[]` + a cadence, nothing else. All predicate/cutoff/TTL knowledge lives inside each owning service's `reapExpired`, co-located with that service's schema so a schema change and its pruning rule change together. Eliminates the cross-service port wiring and the aggregate deps bundle. Testing splits cleanly: each service unit-tests its own `reapExpired`; the scheduler tests fan-out/aggregation against fake `Reapable`s.

## Scaling test

**Today FAILS:** a new TTL table needs a new bespoke port type, a new field on `RetentionReaperDeps`, and a new hardcoded block in `reapRetentionOnce` — linear method-per-table growth that edits the reaper's body each time.

**Target PASSES:** a new service implements the existing `Reapable` contract and is appended to the `reapables` array at the composition root — zero new methods, zero edits to `startReaperSweeps`, zero new port types. Ten more reapable services = ten `reapExpired` implementations (each already the owning service's own concern) + ten array entries; the scheduler surface is unchanged. `iterate(Reapable[])` beats `reapUsers + reapKnowledge + reapNotifications + …`.

## Consolidation judgment

**Dissolve — correct** (0 tables, 0 consumers, 0 API surface; boot wiring, not a product). But the target is **not a single sibling product**: the reaping capability distributes to the owning services as `Reapable` implementations, and the generic scheduler homes at the composition root. Folding into dispatch was over-consolidation driven by mechanism (both use `setInterval`), the inverse of the frame. The genuine, layer-independent deliverable is the **4-port → 1-contract collapse**.
