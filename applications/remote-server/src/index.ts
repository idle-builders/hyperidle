import * as https from "node:https";
import { createLogger } from "@hyperidle/diagnostics";
import { createServer } from "./create-server.js";
import { ensureCertificate, tlsConfigFrom } from "./tls-certificate.js";
import { validateStartupEnv } from "./validate-startup-env.js";

const log = createLogger({ pkg: "remote-server" });

const envError = validateStartupEnv(process.env);
if (envError) {
	process.stderr.write(`FATAL: ${envError}\n`);
	process.exit(1);
}

const port = Number(process.env.PORT) || 3001;
const tlsConfig = tlsConfigFrom(process.env);
const tls = tlsConfig ? await ensureCertificate(tlsConfig) : undefined;

const handle = await createServer(port, { topology: "disabled", ...(tls ? { tls } : {}) });
log.info(
	tlsConfig
		? `remote-server running on https://${tlsConfig.domain}:${port}`
		: `remote-server running on http://localhost:${port}`,
);

// A daily look keeps the certificate from running out; a renewed one is used without a restart.
const renewal =
	tlsConfig &&
	setInterval(
		() =>
			void ensureCertificate(tlsConfig)
				.then((fresh) => {
					if (handle.httpServer instanceof https.Server) handle.httpServer.setSecureContext(fresh);
				})
				.catch((error: unknown) => log.error("certificate renewal failed", { error })),
		24 * 60 * 60 * 1000,
	).unref();

let shutdownPromise: Promise<void> | null = null;
const shutdown = (): Promise<void> => {
	if (renewal) clearInterval(renewal);
	shutdownPromise ??= handle.dispose().catch((error: unknown) => {
		log.error("remote-server shutdown failed", { error });
		process.exitCode = 1;
	});
	return shutdownPromise;
};
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
