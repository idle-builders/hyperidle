/**
 * N1 — Bun-API removal assertions (AC1–AC5).
 *
 * These are static source-inspection tests. They read the source files and
 * assert that no Bun-specific APIs remain after the migration. They run
 * entirely in-process (no subprocess), so they run fast regardless of
 * runtime.
 *
 * Each assertion corresponds to one N1 acceptance criterion:
 *
 *   AC1 — server-factory.ts: no `import "bun"`, no `bun:sqlite`,
 *          no `drizzle-orm/bun-sqlite`.
 *   AC2 — routes/ws.ts: no `hono/bun` import, no `wsHandler` export.
 *   AC3 — server-factory.ts: no `openProductionDb` using bun:sqlite;
 *          uses `createDb` from @hyperidle/db instead.
 *   AC4 — setup-cli.ts: no `RUNNING_UNDER_BUN`, no `globalThis.Bun` shim.
 *   AC5 — git-export-runner.ts: @lore updated; no Bun.spawn mention;
 *          node:child_process.spawn referenced as canonical.
 *
 * These tests WILL FAIL in the red phase because the source files still
 * contain Bun-specific imports. They will PASS after the green phase.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

// Resolve paths relative to the server package root.
const SERVER_SRC = path.resolve(__dirname, "..");

function readSrc(relPath: string): string {
	return fs.readFileSync(path.join(SERVER_SRC, relPath), "utf-8");
}

function readDb(relPath: string): string {
	const dbSrc = path.resolve(SERVER_SRC, "../../db/src");
	return fs.readFileSync(path.join(dbSrc, relPath), "utf-8");
}

describe("N1: Bun-API removal — source file assertions", () => {
	// ------------------------------------------------------------------ AC1
	describe("AC1: server-factory.ts uses @hono/node-server; no Bun serve", () => {
		it('does not import serve from "bun"', () => {
			const src = readSrc("server-factory.ts");
			expect(src).not.toMatch(/from\s+["']bun["']/);
		});

		it('imports serve from "@hono/node-server"', () => {
			const src = readSrc("server-factory.ts");
			expect(src).toMatch(/@hono\/node-server/);
		});

		it("exports ServerHandle (not BunServerHandle)", () => {
			const src = readSrc("server-factory.ts");
			expect(src).not.toContain("BunServerHandle");
			expect(src).toMatch(/ServerHandle/);
		});

		it("exports createServer (not createBunServer)", () => {
			const src = readSrc("server-factory.ts");
			expect(src).not.toContain("createBunServer");
			expect(src).toMatch(/createServer/);
		});
	});

	// ------------------------------------------------------------------ AC2
	describe("AC2: routes/ws.ts uses injected upgradeWebSocket; no hono/bun", () => {
		it('does not import from "hono/bun"', () => {
			const src = readSrc("routes/ws.ts");
			expect(src).not.toMatch(/from\s+["']hono\/bun["']/);
		});

		it("does not call createBunWebSocket()", () => {
			const src = readSrc("routes/ws.ts");
			expect(src).not.toContain("createBunWebSocket");
		});

		it("does not export wsHandler", () => {
			const src = readSrc("routes/ws.ts");
			// The module-scope wsHandler from createBunWebSocket must be gone.
			// This checks both the variable and the named export.
			expect(src).not.toMatch(/export\s*\{[^}]*wsHandler[^}]*\}/);
			// Also confirm the module-scope const assignment is gone.
			expect(src).not.toMatch(/const\s*\{[^}]*websocket:\s*wsHandler/);
		});

		it("registerWsRoute accepts upgradeWebSocket as a parameter", () => {
			const src = readSrc("routes/ws.ts");
			// The function signature must include upgradeWebSocket as a parameter.
			expect(src).toMatch(/upgradeWebSocket/);
		});
	});

	// ------------------------------------------------------------------ AC3
	describe("AC3: server-factory.ts — openProductionDb uses better-sqlite3 only; bun:sqlite deleted", () => {
		it('does not import from "bun:sqlite"', () => {
			const src = readSrc("server-factory.ts");
			expect(src).not.toContain("bun:sqlite");
		});

		it('does not import from "drizzle-orm/bun-sqlite"', () => {
			const src = readSrc("server-factory.ts");
			expect(src).not.toContain("drizzle-orm/bun-sqlite");
		});

		it("imports createDb from @hyperidle/db for production DB", () => {
			const src = readSrc("server-factory.ts");
			// After N1, createDb is explicitly imported from @hyperidle/db.
			// The import statement must include createDb as a named import.
			expect(src).toMatch(/import\s*\{[^}]*\bcreateDb\b[^}]*\}\s*from\s*["']@hyperidle\/db["']/);
		});
	});

	// ------------------------------------------------------------------ AC4
	describe("AC4: setup-cli.ts — no RUNNING_UNDER_BUN; no globalThis.Bun shim", () => {
		it("does not define RUNNING_UNDER_BUN", () => {
			const src = readDb("setup-cli.ts");
			expect(src).not.toContain("RUNNING_UNDER_BUN");
		});

		it("does not declare globalThis.Bun", () => {
			const src = readDb("setup-cli.ts");
			// The declare global block with Bun must be removed.
			expect(src).not.toMatch(/declare\s+global\s*\{[^}]*var\s+Bun/s);
		});

		it('does not import from "bun:sqlite"', () => {
			const src = readDb("setup-cli.ts");
			expect(src).not.toContain("bun:sqlite");
		});

		it("does not use typeof globalThis.Bun for runtime detection", () => {
			const src = readDb("setup-cli.ts");
			expect(src).not.toMatch(/typeof\s+globalThis\.Bun/);
		});
	});

	// ------------------------------------------------------------------ AC5
	describe("AC5: git-export-runner.ts @lore updated — node:child_process.spawn is canonical", () => {
		it("does not reference Bun.spawn as the plan mandate", () => {
			const src = readSrc("services/git-export-runner.ts");
			expect(src).not.toMatch(/the plan mandates `Bun\.spawn`/);
		});

		it("@lore block references node:child_process.spawn as canonical", () => {
			const src = readSrc("services/git-export-runner.ts");
			// After N1, the lore must say node:child_process.spawn is canonical.
			expect(src).toMatch(/node:child_process\.spawn.*canonical|canonical.*node:child_process\.spawn/is);
		});
	});

	// ------------------------------------------------------------------ AC6 (comment only — transaction test is in fabric)
	describe("AC6: knowledge-repository.ts comment updated — bun:sqlite reference removed", () => {
		it("comment at line ~189 does not mention bun:sqlite", () => {
			const fabricSrc = path.resolve(SERVER_SRC, "../../fabric/src");
			const src = fs.readFileSync(path.join(fabricSrc, "knowledge-repository.ts"), "utf-8");
			// The comment describing db.transaction should not mention bun:sqlite.
			// It should only say better-sqlite3.
			const commentMatch = src.match(/db\.transaction.*BEGIN IMMEDIATE[^\n]*/);
			if (commentMatch) {
				expect(commentMatch[0]).not.toContain("bun:sqlite");
			} else {
				// The comment block around BEGIN IMMEDIATE should exist.
				expect(src).toMatch(/BEGIN IMMEDIATE/);
				expect(src).not.toMatch(/bun:sqlite[^`]*BEGIN IMMEDIATE/s);
			}
		});
	});
});
