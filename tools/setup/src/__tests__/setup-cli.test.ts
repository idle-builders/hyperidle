import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { PGlite } from "@electric-sql/pglite";
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

describe("`bun run setup --profile laptop`", () => {
	it("creates PGlite data dir, runs migrations, seeds — end to end", {
		timeout: 60_000,
	}, async () => {
		const dataDir = path.join(tmpdir, "hyperidle-pg");
		const { io, captured } = makeIo();

		// @lore: --root — overrides only docker-compose lookup and --db-path; migrations resolve off this file's dir, never --root
		const fakeRoot = path.join(tmpdir, "not-a-repo-root");
		fs.mkdirSync(fakeRoot);

		const exit = await runSetup(
			["--profile", "laptop", "--db-path", dataDir, "--root", fakeRoot],
			io,
			{ env: {} },
		);
		expect(exit).toBe(0);

		// Data directory exists
		expect(fs.existsSync(dataDir)).toBe(true);

		// Tables + seed rows present — query via PGlite
		const client = new PGlite(dataDir);
		await client.waitReady;
		try {
			// applyFactoryBootstrap does NOT insert teams — teams are created at
			// onboarding, not at setup time. Assert factory agents present.
			const usersResult = await client.query<{ id: string }>("SELECT id FROM users");
			expect(usersResult.rows.length).toBeGreaterThan(0);

			// system:propagation must be present (factory-bootstrap row)
			const propagation = await client.query<{ id: string }>(
				"SELECT id FROM users WHERE id = 'system:propagation'",
			);
			expect(propagation.rows.length).toBe(1);
		} finally {
			await client.close();
		}

		// Banner emitted
		const all = captured.stdout.join("\n");
		expect(all).toMatch(/ready/i);
		expect(all).toContain(dataDir);
	});

	it("defaults db path to ./hyperidle-pg in cwd when not given (dry-run only)", async () => {
		const { io, captured } = makeIo();
		const exit = await runSetup(["--profile", "laptop", "--dry-run"], io, { env: {} });
		expect(exit).toBe(0);
		const all = captured.stdout.join("\n");
		expect(all).toMatch(/hyperidle-pg/);
		expect(all).toMatch(/dry[-\s]?run/i);
	});
});

describe("`bun run setup --profile vps`", () => {
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

describe("CLI argument errors", () => {
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

describe("--db-path validation", () => {
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
			expect(() => validateDbPath(path.join(readonlyDir, "hyperidle-pg"), tmpdir)).toThrow(
				/not writable|cannot be created/,
			);
		} finally {
			fs.chmodSync(readonlyDir, 0o755);
		}
	});

	it("resolves a relative path to an absolute path under cwd", () => {
		const out = validateDbPath("data/hyperidle-pg", tmpdir);
		expect(path.isAbsolute(out)).toBe(true);
		expect(out.startsWith(tmpdir)).toBe(true);
	});

	it("accepts an absolute path whose parent is writable", () => {
		const target = path.join(tmpdir, "sub", "hyperidle-pg");
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

describe("--demo flag behavior", () => {
	it("without --demo: setup produces no demo team (factory only)", {
		timeout: 60_000,
	}, async () => {
		const dataDir = path.join(tmpdir, "hyperidle-pg-nodemo");
		const { io } = makeIo();

		const exit = await runSetup(["--profile", "laptop", "--db-path", dataDir], io, { env: {} });
		expect(exit).toBe(0);

		const client = new PGlite(dataDir);
		await client.waitReady;
		try {
			// No teams inserted (factory bootstrap only, no demo world)
			const teamsResult = await client.query<{ count: string }>(
				"SELECT COUNT(*) AS count FROM teams",
			);
			expect(Number(teamsResult.rows[0]?.count)).toBe(0);

			// No human users (factory has no humans)
			const humanResult = await client.query<{ count: string }>(
				"SELECT COUNT(*) AS count FROM users WHERE kind = 'human'",
			);
			expect(Number(humanResult.rows[0]?.count)).toBe(0);
		} finally {
			await client.close();
		}
	});

	it("with --demo: setup produces the Acme demo team + demo founder", {
		timeout: 60_000,
	}, async () => {
		const dataDir = path.join(tmpdir, "hyperidle-pg-demo");
		const { io, captured } = makeIo();

		const exit = await runSetup(["--profile", "laptop", "--db-path", dataDir, "--demo"], io, {
			env: {},
		});
		expect(exit).toBe(0);

		// stdout mentions demo mode
		expect(captured.stdout.join("\n")).toMatch(/demo/i);

		const client = new PGlite(dataDir);
		await client.waitReady;
		try {
			// Demo team "Acme" must exist
			const teamsResult = await client.query<{ id: string; name: string }>(
				"SELECT id, name FROM teams WHERE id = 'demo-team-acme'",
			);
			expect(teamsResult.rows.length).toBe(1);
			expect(teamsResult.rows[0]?.name).toBe("Acme");

			// Demo founder must exist
			const founderResult = await client.query<{ id: string; kind: string }>(
				"SELECT id, kind FROM users WHERE id = 'demo-founder'",
			);
			expect(founderResult.rows.length).toBe(1);
			expect(founderResult.rows[0]?.kind).toBe("human");
		} finally {
			await client.close();
		}
	});

	it("--demo dry-run mentions demo seeding without executing", async () => {
		const { io, captured } = makeIo();
		const exit = await runSetup(["--profile", "laptop", "--dry-run", "--demo"], io, { env: {} });
		expect(exit).toBe(0);
		const all = captured.stdout.join("\n");
		expect(all).toMatch(/demo/i);
		expect(all).toMatch(/dry[-\s]?run/i);
	});
});

describe("laptop setup is safe to run twice", () => {
	it("running setup --profile laptop twice does not corrupt the DB", {
		timeout: 60_000,
	}, async () => {
		const dataDir = path.join(tmpdir, "hyperidle-pg");
		const { io } = makeIo();

		const first = await runSetup(["--profile", "laptop", "--db-path", dataDir], io, {
			env: {},
		});
		expect(first).toBe(0);

		const second = await runSetup(["--profile", "laptop", "--db-path", dataDir], io, {
			env: {},
		});
		expect(second).toBe(0);

		// DB must still open, schema must still be present, seed rows must
		// still be there exactly once (onConflictDoNothing).
		const client = new PGlite(dataDir);
		await client.waitReady;
		try {
			const agentsResult = await client.query<{ id: string }>("SELECT id FROM users");
			expect(agentsResult.rows.length).toBeGreaterThan(0);
			// Factory bootstrap does NOT insert teams (teams come from onboarding).
			// Assert the factory system:propagation row is still present after second run.
			const propagationResult = await client.query<{ n: string }>(
				"SELECT COUNT(*) AS n FROM users WHERE id = 'system:propagation'",
			);
			expect(Number(propagationResult.rows[0]?.n)).toBe(1);
		} finally {
			await client.close();
		}
	});
});
