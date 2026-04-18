import { createLogger } from "@hyperidle/shared";
import { createBunServer } from "./server-factory.js";

const log = createLogger({ pkg: "server" });

// I2 A6: fail-fast when HYPERIDLE_API_KEY is missing. Without this guard the
// auth middleware silently rejects every request, leaving no startup signal
// for the operator. Exiting non-zero before the server binds gives systemd /
// docker / supervisord a clear failure to surface.
if (!process.env.HYPERIDLE_API_KEY) {
	process.stderr.write(
		"FATAL: HYPERIDLE_API_KEY is required. Set it in your environment before starting the server.\n",
	);
	process.exit(1);
}

const port = Number(process.env.PORT) || 3001;

await createBunServer(port);

log.info(`Server running on http://localhost:${port}`);
