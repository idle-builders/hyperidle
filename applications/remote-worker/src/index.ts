/**
 * @hyperidle/remote-worker — the `remote-worker` Application (§3: composes
 * `agent-execution` only, no `core-ui`/`core-api`/`agent-orchestration`).
 *
 * @lore AU19 Increment 5 (item 2): relocated from `applications/desktop/src/
 * desktop-worker-client.ts` (mechanical move, proven working code — the
 * founder ruling `97b8728b` explicitly scoped this to relocation only, no
 * new deployment/ops infrastructure). `applications/desktop` remains the only
 * real place `RemoteWorkerClient` is instantiated today (a user toggles
 * their desktop app to act as a worker against a peer's `remote-server`) —
 * this package exists so that role is a real, separately-typed unit
 * (`agent-execution` Layer: it holds a `HarnessAdapter` and runs sessions,
 * never touches `core-api`/`agent-orchestration`/`core-ui`), not because a
 * standalone `remote-worker` binary/deployable exists yet.
 *
 * @lore AU31 §2.7/§5.3/[P9]: the class itself relocated into
 * `@hyperidle/agent-execution` — a composition root reaches a layer's public
 * face only, never another application (`application → application [import]`
 * is forbidden). This package thins to a re-export of that face, keeping the
 * separately-typed `remote-worker` role real for whenever a standalone
 * process entry is built, without holding the implementation itself.
 */

export type { RemoteWorkerClientOptions, WorkerStatus } from "@hyperidle/agent-execution";
export { RemoteWorkerClient } from "@hyperidle/agent-execution";
