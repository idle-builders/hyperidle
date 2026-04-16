import { createLogger } from "@hyperidle/shared";
import { createBunServer } from "./server-factory.js";

const log = createLogger({ pkg: "server" });
const port = Number(process.env.PORT) || 3001;

createBunServer(port);

log.info(`Server running on http://localhost:${port}`);
