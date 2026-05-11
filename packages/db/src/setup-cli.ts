import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { redactDbUrl } from "@hyperidle/shared";
import { type DeploymentProfile, resolveProfile } from "./profiles.js";
import * as schema from "./schema.js";
import { seed } from "./seed.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// @lore N1: setup-cli uses better-sqlite3 unconditionally. The Bun-specific
// SQLite branch was removed in N1. Both Bun and Node now use the same
// better-sqlite3 code path.

export interface RunSetupIo {
	stdout: (line: string) => void;
	stderr: (line: string) => void;
}

export interface RunSetupContext {
	readonly env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
	readonly cwd?: string;
}

interface ParsedArgs {
	readonly profile: string | undefined;
	readonly dbPath: string | undefined;
	readonly dbUrl: string | undefined;
	readonly root: string | undefined;
	readonly help: boolean;
	readonly dryRun: boolean;
}

const USAGE = [
	"Usage: bun run setup [options]",
	"",
	"Options:",
	"  --profile <laptop|vps|cloud>  Deployment profile (or HYPERIDLE_PROFILE env).",
	"  --db-path <path>              SQLite file path (laptop profile). Default: ./hyperidle.db",
	"  --db-url <url>                Postgres URL (vps/cloud profile). Default from env DATABASE_URL.",
	"  --root <path>                 Repo root override (used to locate docker-compose.yml).",
	"  --dry-run                     Print planned actions without executing.",
	"  --help                        Show this message.",
	"",
].join("\n");

function parseArgs(argv: readonly string[]): ParsedArgs {
	let profile: string | undefined;
	let dbPath: string | undefined;
	let dbUrl: string | undefined;
	let root: string | undefined;
	let help = false;
	let dryRun = false;

	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		switch (a) {
			case "--help":
			case "-h":
				help = true;
				break;
			case "--dry-run":
				dryRun = true;
				break;
			case "--profile":
				profile = argv[++i];
				break;
			case "--db-path":
				dbPath = argv[++i];
				break;
			case "--db-url":
				dbUrl = argv[++i];
				break;
			case "--root":
				root = argv[++i];
				break;
			default:
				// Unknown flag — ignore silently (allow bun/node extras).
				break;
		}
	}
	return { profile, dbPath, dbUrl, root, help, dryRun };
}

function defaultRoot(cwd: string | undefined): string {
	// packages/db/src → repo root is ../../..
	if (cwd) return cwd;
	return path.resolve(__dirname, "..", "..", "..");
}

/**
 * Validate and resolve a `--db-path` value:
 * - Reject traversal sequences (`..` path segments).
 * - Resolve to an absolute path relative to `cwd`.
 * - Ensure the parent directory is writable (creating it if missing).
 *
 * Throws an Error with a user-facing message on any failure.
 */
export function validateDbPath(input: string, cwd: string): string {
	if (!input) {
		throw new Error("--db-path must be a non-empty path");
	}
	// Reject traversal BEFORE resolving so `a/../b` is rejected even when it
	// normalises to something that looks safe. Operators who legitimately
	// need a path-relative layout can pass an absolute path.
	const parts = input.split(/[/\\]+/);
	if (parts.some((p) => p === "..")) {
		throw new Error(`--db-path must not contain '..' segments: ${input}`);
	}
	const resolved = path.isAbsolute(input) ? input : path.resolve(cwd, input);
	const parent = path.dirname(resolved);
	// Create parent if missing — fail loudly if we cannot.
	if (!fs.existsSync(parent)) {
		try {
			fs.mkdirSync(parent, { recursive: true });
		} catch (err) {
			throw new Error(
				`--db-path parent directory cannot be created: ${parent} (${(err as Error).message})`,
			);
		}
	}
	// Probe writability with fs.accessSync. On failure we surface an
	// explicit message rather than letting better-sqlite3 throw a SQLite
	// "unable to open database" error that's harder to diagnose.
	try {
		fs.accessSync(parent, fs.constants.W_OK);
	} catch {
		throw new Error(`--db-path parent directory is not writable: ${parent}`);
	}
	return resolved;
}

async function applyLaptopMigrations(dbPath: string, migrationsFolder: string): Promise<void> {
	// @lore N1: uses better-sqlite3 unconditionally. No Bun/Node branching.
	const { default: BetterSqlite } = await import("better-sqlite3");
	const { drizzle: nodeDrizzle } = await import("drizzle-orm/better-sqlite3");
	const { migrate: nodeMigrate } = await import("drizzle-orm/better-sqlite3/migrator");
	const sqlite = new BetterSqlite(dbPath);
	try {
		sqlite.pragma("journal_mode = WAL");
		sqlite.pragma("foreign_keys = ON");
		const db = nodeDrizzle(sqlite, { schema });
		nodeMigrate(db, { migrationsFolder });
		seed(db);
	} finally {
		sqlite.close();
	}
}

async function runLaptop(
	args: ParsedArgs,
	io: RunSetupIo,
	root: string,
	cwd: string,
): Promise<number> {
	const rawPath = args.dbPath ?? path.join(root, "hyperidle.db");

	let dbPath: string;
	try {
		dbPath = validateDbPath(rawPath, cwd);
	} catch (err) {
		io.stderr(`[setup] ${(err as Error).message}`);
		return 1;
	}

	if (args.dryRun) {
		io.stdout(`[setup] (dry-run) Would create SQLite DB at ${dbPath}`);
		io.stdout("[setup] (dry-run) Would run migrations from packages/db/drizzle");
		io.stdout("[setup] (dry-run) Would seed database");
		return 0;
	}

	const migrationsFolder = path.resolve(__dirname, "..", "drizzle");
	await applyLaptopMigrations(dbPath, migrationsFolder);

	io.stdout(`[setup] Ready. SQLite DB at ${dbPath}`);
	io.stdout("[setup] Next: run `bun dev` to start the server and web app.");
	return 0;
}

function runVps(args: ParsedArgs, io: RunSetupIo, root: string): number {
	const composePath = path.join(root, "docker-compose.yml");
	if (!fs.existsSync(composePath)) {
		io.stderr(`[setup] docker-compose.yml not found at ${composePath}. VPS profile requires it.`);
		return 1;
	}

	io.stdout("[setup] VPS profile: Docker Compose bring-up");
	io.stdout(`[setup]   Compose file: ${composePath}`);
	io.stdout("[setup]   See docs/deployment/ § VPS for the full bring-up sequence.");
	io.stdout(
		"[setup]   Short form: docker compose up -d && bun run db:migrate:pg && bun run db:seed:pg",
	);

	if (args.dryRun) {
		io.stdout("[setup] (dry-run) No containers started; skipping.");
	}
	return 0;
}

function runCloud(args: ParsedArgs, io: RunSetupIo, ctx: RunSetupContext): number {
	const url = args.dbUrl ?? ctx.env?.DATABASE_URL;
	if (!url) {
		io.stderr("[setup] Cloud profile requires DATABASE_URL env var or --db-url.");
		return 1;
	}
	io.stdout("[setup] Cloud profile: remote Postgres");
	io.stdout(`[setup]   Target: ${redactDbUrl(url)}`);
	io.stdout("[setup]   See docs/deployment/ § Cloud for the full bring-up sequence.");
	if (args.dryRun) {
		io.stdout("[setup] (dry-run) Not connecting; skipping.");
	}
	return 0;
}

/**
 * Main entry for the setup CLI. Exported for testability; the binary
 * wrapper at `bin/setup` invokes this with `process.argv.slice(2)`.
 */
export async function runSetup(
	argv: readonly string[],
	io: RunSetupIo,
	ctx: RunSetupContext = {},
): Promise<number> {
	const parsed = parseArgs(argv);
	if (parsed.help) {
		io.stdout(USAGE);
		return 0;
	}

	let resolved: ReturnType<typeof resolveProfile>;
	try {
		resolved = resolveProfile({ profile: parsed.profile, env: ctx.env });
	} catch (err) {
		io.stderr(`[setup] ${(err as Error).message}`);
		return 1;
	}

	io.stdout(`[setup] Profile: ${resolved.profile} (db=${resolved.dbDriver})`);

	const cwd = ctx.cwd ?? process.cwd();
	const root = parsed.root ?? defaultRoot(ctx.cwd);

	switch (resolved.profile satisfies DeploymentProfile) {
		case "laptop":
			return await runLaptop(parsed, io, root, cwd);
		case "vps":
			return runVps(parsed, io, root);
		case "cloud":
			return runCloud(parsed, io, ctx);
	}
}

/**
 * Module-level invocation. Running `bun packages/db/src/setup-cli.ts …`
 * dispatches here.
 */
/* c8 ignore start */
// @lore N1: `process.argv[1] === fileURLToPath(import.meta.url)` is the
// Node-compatible entrypoint check. Works under both Bun (which supports
// import.meta.url and process.argv[1]) and Node. Replaces the previous
// `globalThis.Bun + import.meta.main` guard.
const isEntrypoint = process.argv[1] === fileURLToPath(import.meta.url);
if (isEntrypoint) {
	const io: RunSetupIo = {
		stdout: (line) => process.stdout.write(`${line}\n`),
		stderr: (line) => process.stderr.write(`${line}\n`),
	};
	// Let uncaught errors propagate — the full stack trace is the most
	// useful artifact when a migration or seed blows up.
	runSetup(process.argv.slice(2), io, { env: process.env, cwd: process.cwd() }).then((code) =>
		process.exit(code),
	);
}
/* c8 ignore stop */
