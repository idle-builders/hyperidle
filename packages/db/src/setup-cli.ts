/**
 * H4 setup CLI. Entry: `bun run setup --profile <laptop|vps|cloud>`.
 *
 * @lore The CLI does NOT spawn the dev server itself. Cross-process
 * lifecycle can't be independently verified inside a single test run;
 * operators follow the printed "Ready" banner with `bun dev`. Setup is
 * responsible only for: resolve profile, prepare data store, run
 * migrations, seed. This is an intentional scope cut — see H4-plan.md §4.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { type DeploymentProfile, resolveProfile } from "./profiles.js";
import * as schema from "./schema.js";
import { seed } from "./seed.js";

// @lore The setup CLI runs under both Bun (production `bun run setup`) and
// Node (test harness via vitest). Bun refuses to dlopen `better-sqlite3`
// (https://github.com/oven-sh/bun/issues/4290); Node cannot import
// `bun:sqlite`. So we pick the SQLite driver dynamically at runtime.
// Drizzle exposes equivalent wrappers for both — they share the same
// schema and the same query API we use in seed.ts.
declare global {
	// Bun's runtime shim. Available when running under Bun; undefined under
	// Node. We only inspect `.main`.
	// biome-ignore lint/style/useNamingConvention: Bun global name is fixed.
	var Bun: { main?: string } | undefined;
}
const RUNNING_UNDER_BUN = typeof globalThis.Bun !== "undefined";

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

async function applyLaptopMigrations(dbPath: string, migrationsFolder: string): Promise<void> {
	if (RUNNING_UNDER_BUN) {
		// Bun runtime: use bun:sqlite. Drizzle exposes a dedicated driver.
		const { Database: BunDatabase } = await import("bun:sqlite");
		const { drizzle: bunDrizzle } = await import("drizzle-orm/bun-sqlite");
		const { migrate: bunMigrate } = await import("drizzle-orm/bun-sqlite/migrator");
		const sqlite = new BunDatabase(dbPath);
		try {
			sqlite.exec("PRAGMA journal_mode = WAL");
			sqlite.exec("PRAGMA foreign_keys = ON");
			const db = bunDrizzle(sqlite, { schema });
			bunMigrate(db, { migrationsFolder });
			seed(db as unknown as Parameters<typeof seed>[0]);
		} finally {
			sqlite.close();
		}
		return;
	}
	// Node runtime: use better-sqlite3 via the same APIs createTestDb uses.
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

async function runLaptop(args: ParsedArgs, io: RunSetupIo, root: string): Promise<number> {
	const dbPath = args.dbPath ?? path.join(root, "hyperidle.db");

	if (args.dryRun) {
		io.stdout(`[setup] (dry-run) Would create SQLite DB at ${dbPath}`);
		io.stdout("[setup] (dry-run) Would run migrations from packages/db/drizzle");
		io.stdout("[setup] (dry-run) Would seed database");
		return 0;
	}

	// Ensure parent directory exists
	const parent = path.dirname(dbPath);
	if (!fs.existsSync(parent)) {
		fs.mkdirSync(parent, { recursive: true });
	}

	const migrationsFolder = path.resolve(__dirname, "..", "drizzle");
	await applyLaptopMigrations(dbPath, migrationsFolder);

	io.stdout(`[setup] Ready. SQLite DB at ${dbPath}`);
	io.stdout("[setup] Next: run `bun dev` to start the server and web app.");
	return 0;
}

async function runVps(args: ParsedArgs, io: RunSetupIo, root: string): Promise<number> {
	const composePath = path.join(root, "docker-compose.yml");
	if (!fs.existsSync(composePath)) {
		io.stderr(`[setup] docker-compose.yml not found at ${composePath}. VPS profile requires it.`);
		return 1;
	}

	io.stdout("[setup] VPS profile: Docker Compose bring-up");
	io.stdout(`[setup]   Compose file: ${composePath}`);
	io.stdout("[setup]   1. Copy .env.example → .env and set POSTGRES_PASSWORD.");
	io.stdout("[setup]   2. Run: docker compose up -d");
	io.stdout("[setup]   3. Run migrations: bun run db:migrate:pg");
	io.stdout("[setup]   4. Seed: bun run db:seed:pg");

	if (args.dryRun) {
		io.stdout("[setup] (dry-run) No containers started; skipping.");
	}
	return 0;
}

async function runCloud(args: ParsedArgs, io: RunSetupIo, ctx: RunSetupContext): Promise<number> {
	const url = args.dbUrl ?? ctx.env?.DATABASE_URL;
	if (!url) {
		io.stderr("[setup] Cloud profile requires DATABASE_URL env var or --db-url.");
		return 1;
	}
	io.stdout("[setup] Cloud profile: remote Postgres");
	io.stdout(`[setup]   Target: ${redact(url)}`);
	io.stdout("[setup]   Run: bun run db:migrate:pg");
	io.stdout("[setup]   Run: bun run db:seed:pg");
	if (args.dryRun) {
		io.stdout("[setup] (dry-run) Not connecting; skipping.");
	}
	return 0;
}

function redact(url: string): string {
	// postgres://user:password@host/db → postgres://user:***@host/db
	return url.replace(/(:)([^:@/]+)(@)/, "$1***$3");
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

	const root = parsed.root ?? defaultRoot(ctx.cwd);

	switch (resolved.profile satisfies DeploymentProfile) {
		case "laptop":
			return runLaptop(parsed, io, root);
		case "vps":
			return runVps(parsed, io, root);
		case "cloud":
			return runCloud(parsed, io, ctx);
	}
}

/**
 * Module-level invocation. Running `bun packages/db/src/setup-cli.ts ...`
 * dispatches here.
 */
/* c8 ignore start */
// @lore `import.meta.main` + the `Bun.main` global is Bun-specific but
// safe: this file is the setup CLI entry point and we want side effects
// only when launched directly, not when imported by tests. `Bun` is
// declared once at the top of the file.
const bunRuntime =
	typeof globalThis.Bun !== "undefined" ? (globalThis.Bun as { main?: string }) : undefined;
const isEntrypoint = bunRuntime !== undefined && import.meta?.url === `file://${bunRuntime.main}`;
if (isEntrypoint) {
	const io: RunSetupIo = {
		stdout: (line) => process.stdout.write(`${line}\n`),
		stderr: (line) => process.stderr.write(`${line}\n`),
	};
	runSetup(process.argv.slice(2), io, { env: process.env, cwd: process.cwd() })
		.then((code) => process.exit(code))
		.catch((err) => {
			process.stderr.write(`[setup] Uncaught error: ${(err as Error).message}\n`);
			process.exit(2);
		});
}
/* c8 ignore stop */
