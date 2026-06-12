import { defineConfig } from "drizzle-kit";
import { resolvePostgresSsl, sanitizePostgresUrl } from "./src/pg-ssl.js";

const url = process.env.DATABASE_URL ?? "postgresql://localhost:5432/hyperidle";

export default defineConfig({
	schema: "./src/schema.ts",
	out: "./drizzle",
	dialect: "postgresql",
	dbCredentials: {
		// Strip sslmode/sslrootcert (postgres-js would forward them as startup
		// params) and apply the same verify-ca-aware TLS the runtime uses, so
		// `drizzle-kit migrate` connects to the self-signed cluster Postgres.
		url: sanitizePostgresUrl(url),
		ssl: resolvePostgresSsl(url),
	},
});
