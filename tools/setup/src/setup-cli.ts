import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { seedDemoWorld } from "./demo-fixture.js";
import { runFactoryBootstrap } from "./factory-bootstrap-runner.js";

// @lore AU44-b6: moved from deleted @hyperidle/host-process; only the three fields this CLI needs.
type DeploymentProfile = "laptop" | "vps" | "cloud";
type DbDriver = "pglite" | "postgres";
interface ProfileDefaults {
	readonly profile: DeploymentProfile;
	readonly dbDriver: DbDriver;
	readonly dbUrlDefault: string;
}
const PROFILE_MAP: Record<DeploymentProfile, ProfileDefaults> = {
	laptop: { profile: "laptop", dbDriver: "pglite", dbUrlDefault: "./hyperidle-pg" },
	vps: {
		profile: "vps",
		dbDriver: "postgres",
		dbUrlDefault: "postgres://hyperidle:hyperidle@postgres:5432/hyperidle",
	},
	cloud: { profile: "cloud", dbDriver: "postgres", dbUrlDefault: "" },
};
function resolveProfile(
	opts: { profile?: string; env?: Record<string, string | undefined> | NodeJS.ProcessEnv } = {},
): ProfileDefaults {
	const raw = opts.profile ?? opts.env?.HYPERIDLE_PROFILE ?? "laptop";
	if (!(raw in PROFILE_MAP))
		throw new Error(`Invalid profile: "${raw}". Must be one of: laptop, vps, cloud.`);
	return PROFILE_MAP[raw as DeploymentProfile] as ProfileDefaults;
}

const Filename = typeof __filename === "string" ? __filename : fileURLToPath(import.meta.url);
const Dirname = path.dirname(Filename);

/** Redact the password from a DB connection URL for safe logging. */
function redactDbUrl(url: string): string {
	let out = url;
	try {
		const parsed = new URL(url);
		if (parsed.password) parsed.password = "***";
		for (const key of ["password", "pwd", "pass"]) {
			if (parsed.searchParams.has(key)) parsed.searchParams.set(key, "***");
		}
		out = parsed.toString();
	} catch {
		// Not a URL-parseable string — fall through to the regex.
	}
	out = out.replace(/(:\/\/[^:@/]+:)([^:@/]+)(@)/, "$1***$3");
	return out;
}

// @lore Phase 2: setup-cli now uses PGlite for the laptop profile.
// The `--db-path` argument is now a data directory (not a SQLite file path).

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
	readonly demo: boolean;
}

const USAGE = [
	"Usage: npm run setup [options]",
	"",
	"Options:",
	"  --profile <laptop|vps|cloud>  Deployment profile (or HYPERIDLE_PROFILE env).",
	"  --db-path <path>              PGlite data directory (laptop profile). Default: ./hyperidle-pg",
	"  --db-url <url>                Postgres URL (vps/cloud profile). Default from env DATABASE_URL.",
	"  --root <path>                 Repo root override (used to locate docker-compose.yml).",
	"  --demo                        Seed the Northwind demo world (people, agents, work) after factory bootstrap.",
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
	let demo = false;

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
			case "--demo":
				demo = true;
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
				// Unknown flag — ignore silently (allow npm/node extras).
				break;
		}
	}
	return { profile, dbPath, dbUrl, root, help, dryRun, demo };
}

function defaultRoot(cwd: string | undefined): string {
	// tools/setup/src → repo root is ../../.. (same depth as the pre-AU29
	// framework/db/src home — re-verified at move time).
	if (cwd) return cwd;
	return path.resolve(Dirname, "..", "..", "..");
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
	// explicit message rather than letting PGlite throw a cryptic error.
	try {
		fs.accessSync(parent, fs.constants.W_OK);
	} catch {
		throw new Error(`--db-path parent directory is not writable: ${parent}`);
	}
	return resolved;
}

/**
 * Apply migrations for the laptop profile using the shared applyMigrations
 * function, then seed the database.
 *
 * @lore N4: Uses the extracted applyMigrations() from migrate.ts as the single
 * source of truth. setup-cli was the original inline migration owner; we now
 * delegate to applyMigrations() so both CLI and desktop share identical logic.
 * Architecture §6.1: "Option A. The migration logic must be a single source of
 * truth. The setup-cli and the desktop must run identical migrations."
 */
async function applyLaptopMigrations(
	dataDir: string,
	migrationsFolder: string,
	demo = false,
): Promise<void> {
	const { applyMigrations, createPgliteDb } = await import("@hyperidle/db");
	await applyMigrations(dataDir, migrationsFolder);

	// Apply factory bootstrap — always; idempotent.
	const handle = await createPgliteDb(dataDir);
	try {
		await runFactoryBootstrap(handle.db);
		// @lore AF17: demo mode seeds the Northwind demo world — opt-in only.
		// Without --demo, factory bootstrap only (no demo data in production DBs).
		if (demo) {
			await seedDemoWorld(handle.db);
		}
	} finally {
		await handle.close();
	}
}

async function runLaptop(
	args: ParsedArgs,
	io: RunSetupIo,
	root: string,
	cwd: string,
): Promise<number> {
	const rawPath = args.dbPath ?? path.join(root, "hyperidle-pg");

	let dataDir: string;
	try {
		dataDir = validateDbPath(rawPath, cwd);
	} catch (err) {
		io.stderr(`[setup] ${(err as Error).message}`);
		return 1;
	}

	if (args.dryRun) {
		io.stdout(`[setup] (dry-run) Would create PGlite data directory at ${dataDir}`);
		io.stdout("[setup] (dry-run) Would run migrations from framework/db/drizzle");
		io.stdout("[setup] (dry-run) Would apply factory bootstrap");
		if (args.demo) {
			io.stdout("[setup] (dry-run) Would seed demo world (--demo flag)");
		}
		return 0;
	}

	// @lore AU29: anchor on this file's own location (tools/setup/src →
	// repo root is ../../..), not on `root` — `root` is the `--root` override
	// used only to locate docker-compose.yml (vps profile) and must not be able
	// to redirect the migrations lookup. Matches the pre-AU29 behavior where
	// framework/db/src/setup-cli.ts anchored on its own Dirname.
	const migrationsFolder = path.resolve(Dirname, "..", "..", "..", "framework", "db", "drizzle");
	await applyLaptopMigrations(dataDir, migrationsFolder, args.demo);

	if (args.demo) {
		io.stdout("[setup] Demo mode: seeded the Northwind demo world.");
	}
	io.stdout(`[setup] Ready. PGlite data at ${dataDir}`);
	io.stdout("[setup] Next: run `npm run dev` to start the server and web app.");
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
		"[setup]   Short form: docker compose up -d && npm run db:migrate:pg && npm run db:seed:pg",
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
 * wrapper at `deploy/bin/setup` invokes this with `process.argv.slice(2)`.
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
 * Module-level invocation. Running `npx tsx tools/setup/src/setup-cli.ts …`
 * dispatches here.
 */
/* c8 ignore start */
// @lore N1: `process.argv[1] === fileURLToPath(import.meta.url)` is the
// Node-compatible entrypoint check. Works under both Bun (which supports
// import.meta.url and process.argv[1]) and Node. Replaces the previous
// `globalThis.Bun + import.meta.main` guard.
const isEntrypoint =
	process.argv[1] ===
	(typeof __filename === "string" ? __filename : fileURLToPath(import.meta.url));
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
