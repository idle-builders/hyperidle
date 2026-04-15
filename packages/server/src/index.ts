import { createLogger } from "@hyperidle/shared";
import { serve } from "bun";
import { app } from "./app.js";

const log = createLogger({ pkg: "server" });
const port = Number(process.env.PORT) || 3001;

serve({
	fetch: app.fetch,
	port,
});

log.info(`Server running on http://localhost:${port}`);
