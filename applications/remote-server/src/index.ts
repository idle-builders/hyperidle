/**
 * @hyperidle/remote-server — the `remote-server` Application (§3: composes
 * `core-ui` — none — `core-api` + `agent-orchestration`, never `agent-execution`).
 *
 * @lore AU19 Increment 5 (item 2): relocated from `packages/server/src/index.ts`
 * (the pre-AU19 composition root's process entrypoint) — mechanical move, same
 * boot sequence.
 *
 * @lore AU31 §6/§5.3: `topology: "disabled"` replaces the concrete
 * `AdapterPool`/`SandboxAdapter` this Application used to construct and
 * inject itself — `bootAgentExecution` (inside `create-server.ts` now) owns
 * that construction. `remote-server` never runs a sandbox in-process — its
 * pool starts EMPTY (no local CLI harness discovery, unlike `desktop`'s
 * `"local"` topology) and is populated only by remote workers registering
 * over the worker WS route (wired unconditionally inside `bootAgentOrchestration`
 * — every Application gets worker-hosting for free, same code path, no extra
 * injection needed here).
 */

import { createLogger } from "@hyperidle/diagnostics";
import { createServer } from "./create-server.js";
import { validateStartupEnv } from "./validate-startup-env.js";

const log = createLogger({ pkg: "remote-server" });

const envError = validateStartupEnv(process.env);
if (envError) {
	process.stderr.write(`FATAL: ${envError}\n`);
	process.exit(1);
}

const port = Number(process.env.PORT) || 3001;

const handle = await createServer(port, { topology: "disabled" });
log.info(`remote-server running on http://localhost:${port}`);

let shutdownPromise: Promise<void> | null = null;
const shutdown = (): Promise<void> => {
	shutdownPromise ??= handle.dispose().catch((error: unknown) => {
		log.error("remote-server shutdown failed", { error });
		process.exitCode = 1;
	});
	return shutdownPromise;
};
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
