# D5 Follow-ups

Issues surfaced during the D5 multi-agent review that are NOT D5-introduced but
were uncovered by the review. These are tracked here for follow-up stories.
They are intentionally out-of-scope for the D5 PR per scope discipline.

## Pre-existing issues (deferred, not fixed in D5)

- **B2 materialization path traversal** — `toFilename()` does not sanitize `..`
  in title endings like ".txt". Titles such as `"../outside.txt"` can escape
  the workspace directory when materialized.
- **D2 Claude SDK permission flags** — `bypassPermissions: true` and
  `allowDangerouslySkipPermissions: true` are set. Production usage requires
  the `DockerWorkspaceAdapter` as the sandbox;
  `LocalWorkspaceAdapter` is dev-only and must not be used in production.
- **D2 env wholesale leak** — `env: { ...process.env, [apiKeyEnvVar]: apiKey }`
  hands all host environment variables (including unrelated secrets) to the
  agent subprocess. An allowlist-based env construction is required.
- **D3 shell injection** — `docker exec` and `execAsync` call sites use shell
  interpolation without an argv array. Replace with argv-style invocation
  (e.g. `spawn` with `[cmd, ...args]` or `execFile`) to eliminate shell parsing.
- **C7 module-global state** — `emittedEvents: Set<string>` is a module-level
  global that leaks across tests and long-running processes. It should be
  dependency-injection-scoped or use an LRU with bounded size.
- **C7 `recordCostAndCheck` double-counting** — `session-provisioning.ts`
  passes `params.cost` as the cumulative running total while `factorySpend`
  is also cumulative. When added together in the breach check, this can
  double-count the current session's spend. Either pass
  `factorySpend` as "spend excluding this session" or switch the math to
  delta-based addition.
- **E5/E6 ws-broadcaster tenant filtering** — The `session_ended` event now
  carries `costDelta`. Verify that tenant filtering runs before broadcast so
  cost data does not leak to cross-tenant subscribers.
- **D4 ToolContext.watcher leak** — Any registered tool can call
  `ctx.watcher.stop()`, which would terminate the host session's watcher.
  A read-only façade (or capability-scoped subset) should be passed to tool
  implementations instead of the raw `FileWatcher`.
- **D4 tool args DoS** — Tool invocations accept arbitrarily large `args`
  payloads with no size cap. A bounded-size validator (e.g. 64 KiB max) is
  needed to prevent denial-of-service via oversized tool arguments.
- **D5/C7 concurrent provision race** — The cost-check + concurrency-check +
  session insert sequence is not wrapped in a transaction. SQLite's
  single-writer lock incidentally serializes these writes today, but a
  future PostgreSQL deployment will need `db.transaction()` to preserve
  the invariant.
- **session.workspaceSnapshot misleading field name** — The column currently
  stores the live workspace path which is deleted on normal completion.
  The name implies durability that the value does not have. Rename or
  rescope the field (e.g. `workspacePath` with documented lifetime).
