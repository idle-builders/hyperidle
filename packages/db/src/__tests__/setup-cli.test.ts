import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runSetup } from "../setup-cli.js";

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

			const agents = raw.prepare("SELECT id FROM agents").all() as Array<{ id: string }>;
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
