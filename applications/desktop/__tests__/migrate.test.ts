/**
 * N4 — desktop migrate orchestrator tests
 *
 * AC coverage:
 *  - runMigrations() calls applyMigrations from @hyperidle/db
 *  - runMigrations() throws when isDowngrade() returns true
 *  - runMigrations() succeeds on a fresh database
 *  - resolveMigrationsFolder() returns a path ending with drizzle
 *
 * @lore AU28 Ruling 9 / AU29 §2.8: `framework/db` has never exported a `seed`
 * symbol under this name — this mock used to invent one and assert the
 * migration path never calls it, guarding a function that cannot exist. The
 * mock surface is re-derived from the real post-AU29 barrel (`applyMigrations`
 * / `isDowngrade` only) so it cannot invent a symbol the barrel does not have.
 */

import { describe, expect, it, vi } from "vitest";
import { resolveMigrationsFolder, runMigrations } from "../src/migrate.js";

// ---------------------------------------------------------------------------
// Mock electron — app.isPackaged defaults to false (dev mode) for N4 tests.
// N5 tests override isPackaged per-test via vi.mocked().
// ---------------------------------------------------------------------------
vi.mock("electron", () => ({
	app: {
		isPackaged: false,
	},
}));

// ---------------------------------------------------------------------------
// Mock @hyperidle/db — applyMigrations and isDowngrade live there
// ---------------------------------------------------------------------------
vi.mock("@hyperidle/db", async (importOriginal) => {
	const original = await importOriginal<typeof import("@hyperidle/db")>();
	return {
		...original,
		applyMigrations: vi.fn(async () => ({ applied: 2, schemaVersion: 2 })),
		isDowngrade: vi.fn(async () => false),
	};
});

describe("resolveMigrationsFolder", () => {
	it("returns a path that ends with drizzle", () => {
		const folder = resolveMigrationsFolder();
		expect(folder).toMatch(/drizzle$/);
	});

	it("returns an absolute path", () => {
		const folder = resolveMigrationsFolder();
		expect(folder.startsWith("/")).toBe(true);
	});
});

describe("runMigrations", () => {
	it("calls applyMigrations with the provided dbPath and migrationsFolder", async () => {
		const { applyMigrations } = await import("@hyperidle/db");
		const applyMock = applyMigrations as ReturnType<typeof vi.fn>;
		applyMock.mockClear();

		await runMigrations("/tmp/test.db", "/tmp/drizzle");
		expect(applyMock).toHaveBeenCalledWith("/tmp/test.db", "/tmp/drizzle");
	});

	it("returns a MigrationOrchestrationResult with applied count", async () => {
		const { applyMigrations } = await import("@hyperidle/db");
		(applyMigrations as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			applied: 5,
			schemaVersion: 5,
		});

		const result = await runMigrations("/tmp/test.db", "/tmp/drizzle");
		expect(result.applied).toBe(5);
		expect(result.schemaVersion).toBe(5);
	});

	it("throws when isDowngrade() returns true (schema newer than app)", async () => {
		const { isDowngrade } = await import("@hyperidle/db");
		(isDowngrade as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

		await expect(runMigrations("/tmp/test.db", "/tmp/drizzle")).rejects.toThrow(/downgrade/i);
	});

	it("does not call applyMigrations when downgrade is detected", async () => {
		const { isDowngrade, applyMigrations } = await import("@hyperidle/db");
		(isDowngrade as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
		const applyMock = applyMigrations as ReturnType<typeof vi.fn>;
		applyMock.mockClear();

		try {
			await runMigrations("/tmp/test.db", "/tmp/drizzle");
		} catch {
			// expected
		}
		expect(applyMock).not.toHaveBeenCalled();
	});

	it("propagates errors from applyMigrations", async () => {
		const { applyMigrations, isDowngrade } = await import("@hyperidle/db");
		(isDowngrade as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
		(applyMigrations as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("SQLITE_IOERR"));

		await expect(runMigrations("/tmp/test.db", "/tmp/drizzle")).rejects.toThrow("SQLITE_IOERR");
	});
});

// ---------------------------------------------------------------------------
// N5: Production path resolution (app.isPackaged branch)
// ---------------------------------------------------------------------------
// @lore N5: vi.mock() is hoisted and cannot be used inside it() for
// per-test module control. Use vi.doMock() (not hoisted) + vi.resetModules()
// before the dynamic import so each test gets its own module instance with
// the correct mock applied.

describe("resolveMigrationsFolder — packaged app (AC11)", () => {
	it("returns process.resourcesPath/drizzle when app.isPackaged is true", async () => {
		// Set up process.resourcesPath before the module loads
		Object.defineProperty(process, "resourcesPath", {
			value: "/tmp/test-resources",
			configurable: true,
			writable: true,
		});

		// vi.doMock is NOT hoisted — it applies to the NEXT dynamic import
		vi.doMock("electron", () => ({
			app: { isPackaged: true },
		}));

		// Reset module registry so the next import() gets a fresh module
		// that picks up the vi.doMock above
		vi.resetModules();

		const { resolveMigrationsFolder: resolvePackaged } = await import("../src/migrate.js");
		const folder = resolvePackaged();
		expect(folder).toBe("/tmp/test-resources/drizzle");

		// Restore
		vi.doUnmock("electron");
		vi.resetModules();
	});

	it("returns monorepo db/drizzle path in dev mode (app.isPackaged is false)", async () => {
		vi.doMock("electron", () => ({
			app: { isPackaged: false },
		}));

		vi.resetModules();
		const { resolveMigrationsFolder: resolveDev } = await import("../src/migrate.js");

		const folder = resolveDev();
		expect(folder).toMatch(/drizzle$/);
		expect(folder.startsWith("/")).toBe(true);

		vi.doUnmock("electron");
		vi.resetModules();
	});
});
