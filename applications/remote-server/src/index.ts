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
