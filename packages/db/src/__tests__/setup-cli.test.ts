import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runSetup, validateDbPath } from "../setup-cli.js";

interface CapturedIo {
	stdout: string[];
	stderr: string[];
}

function makeIo(): { io: Parameters<typeof runSetup>[1]; captured: CapturedIo } {
	const captured: CapturedIo = { stdout: [], stderr: [] };
	return {
		io: {
			stdout: (line) => captured.stdout.push(line),
			stderr: (line) => captured.stderr.push(line),
		},
		captured,
	};
}

let tmpdir: string;

beforeEach(() => {
	tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "hyperidle-h4-"));
});

afterEach(() => {
	fs.rmSync(tmpdir, { recursive: true, force: true });
});

describe("H4 AC1: `bun run setup --profile laptop`", () => {
	it("creates SQLite DB, runs migrations, seeds — end to end", async () => {
		const dbPath = path.join(tmpdir, "hyperidle.db");
		const { io, captured } = makeIo();

		const exit = await runSetup(["--profile", "laptop", "--db-path", dbPath], io, { env: {} });
		expect(exit).toBe(0);

		// File exists
		expect(fs.existsSync(dbPath)).toBe(true);

		// Tables + seed rows present
		const raw = new Database(dbPath);
		try {
			const products = raw.prepare("SELECT id FROM products").all() as Array<{ id: string }>;
			expect(products.length).toBeGreaterThan(0);

			// @lore P2: agents → users table
			const agents = raw.prepare("SELECT id FROM users").all() as Array<{ id: string }>;
			expect(agents.length).toBeGreaterThan(0);
		} finally {
			raw.close();
		}

		// Banner emitted
		const all = captured.stdout.join("\n");
		expect(all).toMatch(/ready/i);
		expect(all).toContain(dbPath);
	});

	it("defaults db path to ./hyperidle.db in cwd when not given (dry-run only)", async () => {
		const { io, captured } = makeIo();
		const exit = await runSetup(["--profile", "laptop", "--dry-run"], io, { env: {} });
		expect(exit).toBe(0);
		const all = captured.stdout.join("\n");
		expect(all).toMatch(/hyperidle\.db/);
		expect(all).toMatch(/dry[-\s]?run/i);
	});
});

describe("H4 AC2: `bun run setup --profile vps`", () => {
	it("prints Docker Compose bring-up instructions", async () => {
		const { io, captured } = makeIo();
		const exit = await runSetup(["--profile", "vps", "--dry-run"], io, { env: {} });
		expect(exit).toBe(0);
		const all = captured.stdout.join("\n");
		expect(all).toMatch(/docker\s+compose\s+up/);
	});

	it("fails if docker-compose.yml is missing at the provided root", async () => {
		const { io, captured } = makeIo();
		const fakeRoot = path.join(tmpdir, "no-compose-here");
		fs.mkdirSync(fakeRoot);
		const exit = await runSetup(["--profile", "vps", "--root", fakeRoot], io, { env: {} });
		expect(exit).not.toBe(0);
		expect(captured.stderr.join("\n")).toMatch(/docker-compose\.yml/);
	});
});

describe("H4: CLI argument errors", () => {
	it("rejects unknown profile", async () => {
		const { io, captured } = makeIo();
		const exit = await runSetup(["--profile", "bogus"], io, { env: {} });
		expect(exit).not.toBe(0);
		expect(captured.stderr.join("\n")).toMatch(/invalid profile/i);
	});

	it("honors HYPERIDLE_PROFILE env var when --profile absent", async () => {
		const { io, captured } = makeIo();
		const exit = await runSetup(["--dry-run"], io, { env: { HYPERIDLE_PROFILE: "laptop" } });
		expect(exit).toBe(0);
		expect(captured.stdout.join("\n")).toMatch(/laptop/);
	});

	it("prints usage on --help", async () => {
		const { io, captured } = makeIo();
		const exit = await runSetup(["--help"], io, { env: {} });
		expect(exit).toBe(0);
		const all = captured.stdout.join("\n");
		expect(all).toMatch(/usage/i);
		expect(all).toMatch(/--profile/);
	});
});

describe("H4 security: --db-path validation", () => {
	it("rejects paths with .. traversal segments", () => {
		expect(() => validateDbPath("../../../etc/passwd", tmpdir)).toThrow(/'\.\.'/);
		expect(() => validateDbPath("a/b/../c.db", tmpdir)).toThrow(/'\.\.'/);
	});

	it("rejects paths whose parent directory cannot be written", () => {
		// Create a temp directory and remove write permission to simulate
		// an un-writable parent. Works on both macOS and Linux.
		if (typeof process.getuid === "function" && process.getuid() === 0) {
			return;
		}
		const readonlyDir = path.join(tmpdir, "readonly-parent");
		fs.mkdirSync(readonlyDir, { recursive: true });
		try {
			fs.chmodSync(readonlyDir, 0o444);
			expect(() => validateDbPath(path.join(readonlyDir, "hyperidle.db"), tmpdir)).toThrow(
				/not writable|cannot be created/,
			);
		} finally {
			fs.chmodSync(readonlyDir, 0o755);
		}
	});

	it("resolves a relative path to an absolute path under cwd", () => {
		const out = validateDbPath("data/hyperidle.db", tmpdir);
		expect(path.isAbsolute(out)).toBe(true);
		expect(out.startsWith(tmpdir)).toBe(true);
	});

	it("accepts an absolute path whose parent is writable", () => {
		const target = path.join(tmpdir, "sub", "hyperidle.db");
		const out = validateDbPath(target, tmpdir);
		expect(out).toBe(target);
		expect(fs.existsSync(path.dirname(target))).toBe(true);
	});

	it("runSetup surfaces the validation error and exits non-zero", async () => {
		const { io, captured } = makeIo();
		const exit = await runSetup(["--profile", "laptop", "--db-path", "../etc/passwd"], io, {
			env: {},
			cwd: tmpdir,
		});
		expect(exit).toBe(1);
		expect(captured.stderr.join("\n")).toMatch(/'\.\.'/);
	});
});

describe("H4 idempotency: laptop setup is safe to run twice", () => {
	it("running setup --profile laptop twice does not corrupt the DB", async () => {
		const dbPath = path.join(tmpdir, "hyperidle.db");
		const { io } = makeIo();

		const first = await runSetup(["--profile", "laptop", "--db-path", dbPath], io, {
			env: {},
		});
		expect(first).toBe(0);

		const second = await runSetup(["--profile", "laptop", "--db-path", dbPath], io, {
			env: {},
		});
		expect(second).toBe(0);

		// DB must still open, schema must still be present, seed rows must
		// still be there exactly once (onConflictDoNothing).
		const raw = new Database(dbPath);
		try {
			// @lore P2: agents → users table
			const agents = raw.prepare("SELECT id FROM users").all() as Array<{ id: string }>;
			expect(agents.length).toBeGreaterThan(0);
			const products = raw
				.prepare("SELECT COUNT(*) AS n FROM products WHERE id = 'seed-product-1'")
				.get() as { n: number };
			expect(products.n).toBe(1);
		} finally {
			raw.close();
		}
	});
});
