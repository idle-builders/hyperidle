import { readFileSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// @lore: SSL helpers inlined — drizzle-kit loads via CJS require, not tsx; sibling imports fail; keep in sync with src/pg-ssl.ts

type PostgresSslOption =
	| false
	| { ca?: string; rejectUnauthorized: boolean; checkServerIdentity?: () => undefined };

function readCa(path: string | null): string | undefined {
	if (!path) return undefined;
	try {
		return readFileSync(path, "utf-8");
	} catch {
		return undefined;
	}
}

function resolvePostgresSsl(url: string): PostgresSslOption {
	let search: URLSearchParams;
	try {
		search = new URL(url).searchParams;
	} catch {
		return false;
	}
	const sslmode = search.get("sslmode");
	if (!sslmode || sslmode === "disable") return false;
	const ca = readCa(search.get("sslrootcert"));
	if (sslmode === "require" || sslmode === "prefer" || sslmode === "allow") {
		return { rejectUnauthorized: false };
	}
	if (sslmode === "verify-ca") {
		return { ca, rejectUnauthorized: true, checkServerIdentity: () => undefined };
	}
	return { ca, rejectUnauthorized: true };
}

function sanitizePostgresUrl(url: string): string {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return url;
	}
	for (const key of ["sslmode", "sslrootcert", "sslcert", "sslkey"]) {
		parsed.searchParams.delete(key);
	}
	return parsed.toString();
}

// The migration-tracking table must live in the app's own schema (the one in
// search_path), NOT a separate `drizzle` schema — a schema-scoped tenant role
// can't CREATE SCHEMA. Derive it from the URL's `options=-csearch_path=…`.
// Undefined falls back to drizzle's default (local dev with full rights).
function migrationsSchema(url: string): string | undefined {
	try {
		const options = new URL(url).searchParams.get("options") ?? "";
		const match = decodeURIComponent(options).match(/search_path=([^\s,]+)/);
		return match?.[1];
	} catch {
		return undefined;
	}
}

const url = process.env.DATABASE_URL ?? "postgresql://localhost:5432/hyperidle";
const schema = migrationsSchema(url);

export default defineConfig({
	schema: "./src/schema.ts",
	out: "./drizzle",
	dialect: "postgresql",
	dbCredentials: {
		url: sanitizePostgresUrl(url),
		ssl: resolvePostgresSsl(url),
	},
	...(schema ? { migrations: { schema } } : {}),
});
