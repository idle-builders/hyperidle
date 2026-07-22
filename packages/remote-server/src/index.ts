/**
 * @hyperidle/remote-server — the `remote-server` Application (§3: composes
 * `core-ui` — none — `core-api` + `agent-orchestration`, never `agent-execution`).
 *
 * @lore AU19 Increment 5 (item 2): relocated from `packages/server/src/index.ts`
 * (the pre-AU19 composition root's process entrypoint) — mechanical move, same
 * boot sequence. The one REAL structural change: this Application now
 * constructs and injects its own concrete `HarnessPort` adapter instead of
 * `@hyperidle/core-api`'s `createServer` defaulting it internally via a
 * `HYPERIDLE_PROFILE` runtime branch (see `server-factory.ts`'s
 * `CreateServerDeps` top `@lore`). `remote-server` never runs a sandbox
 * in-process — its `adapterPool` starts EMPTY (no local CLI harness
 * discovery, unlike `desktop`'s `createLocalAdapterPool()`) and is populated
 * only by remote workers registering over the worker WS route
 * (`@hyperidle/core-api`'s `registerWorkerWsRoute`, wired unconditionally
 * inside `createServer` — every Application that calls `createServer` gets
 * worker-hosting for free, same code path, no extra injection needed here).
 * `workspaceAdapter` is `DisabledSandboxAdapter` — this process never
 * provisions a local sandbox; it fails loudly only if something actually
 * tries to.
 */
import { createServer } from "@hyperidle/core-api/server-factory";
import { AdapterPool, createSandboxAdapter } from "@hyperidle/harness-registry";
import { createLogger, validateStartupEnv } from "@hyperidle/shared";

const log = createLogger({ pkg: "remote-server" });

const envError = validateStartupEnv(process.env);
if (envError) {
	process.stderr.write(`FATAL: ${envError}\n`);
	process.exit(1);
}

const port = Number(process.env.PORT) || 3001;

createServer(port, {
	adapterPool: new AdapterPool(),
	workspaceAdapter: createSandboxAdapter("disabled"),
}).then(() => {
	log.info(`remote-server running on http://localhost:${port}`);
});
