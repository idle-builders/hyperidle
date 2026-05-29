import { createLogger } from "@hyperidle/shared";
import { createServer } from "./server-factory.js";
import { validateStartupEnv } from "./validate-env.js";

const log = createLogger({ pkg: "server" });

const envError = validateStartupEnv(process.env);
if (envError) {
	process.stderr.write(`FATAL: ${envError}\n`);
	process.exit(1);
}

const port = Number(process.env.PORT) || 3001;

createServer(port).then(() => {
	log.info(`Server running on http://localhost:${port}`);
});
