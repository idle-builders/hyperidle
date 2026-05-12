/**
 * N4 — desktop migrate orchestrator tests
 *
 * AC coverage:
 *  - runMigrations() calls applyMigrations from @hyperidle/db (not seed)
 *  - runMigrations() throws when isDowngrade() returns true
 *  - runMigrations() succeeds on a fresh database
 *  - resolveMigrationsFolder() returns a path ending with drizzle
 *  - No seed data is written by the desktop migration path
 */

import { describe, expect, it, vi } from "vitest";
import { resolveMigrationsFolder, runMigrations } from "../src/migrate.js";

// ---------------------------------------------------------------------------
// Mock @hyperidle/db — applyMigrations and isDowngrade live there
// ---------------------------------------------------------------------------
vi.mock("@hyperidle/db", async (importOriginal) => {
	const original = await importOriginal<typeof import("@hyperidle/db")>();
	return {
		...original,
		applyMigrations: vi.fn(() => ({ applied: 2, schemaVersion: 2 })),
		isDowngrade: vi.fn(() => false),
		seed: vi.fn(() => {
			throw new Error("seed must NOT be called from the desktop migration path");
		}),
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

		runMigrations("/tmp/test.db", "/tmp/drizzle");
		expect(applyMock).toHaveBeenCalledWith("/tmp/test.db", "/tmp/drizzle");
	});

	it("does NOT call seed() — desktop starts with empty database", async () => {
		const { seed } = await import("@hyperidle/db");
		const seedMock = seed as ReturnType<typeof vi.fn>;
		seedMock.mockClear();

		runMigrations("/tmp/test.db", "/tmp/drizzle");
		expect(seedMock).not.toHaveBeenCalled();
	});

	it("returns a MigrationOrchestrationResult with applied count", async () => {
		const { applyMigrations } = await import("@hyperidle/db");
		(applyMigrations as ReturnType<typeof vi.fn>).mockReturnValueOnce({
			applied: 5,
			schemaVersion: 5,
		});

		const result = runMigrations("/tmp/test.db", "/tmp/drizzle");
		expect(result.applied).toBe(5);
		expect(result.schemaVersion).toBe(5);
	});

	it("throws when isDowngrade() returns true (schema newer than app)", async () => {
		const { isDowngrade } = await import("@hyperidle/db");
		(isDowngrade as ReturnType<typeof vi.fn>).mockReturnValueOnce(true);

		expect(() => runMigrations("/tmp/test.db", "/tmp/drizzle")).toThrow(/downgrade/i);
	});

	it("does not call applyMigrations when downgrade is detected", async () => {
		const { isDowngrade, applyMigrations } = await import("@hyperidle/db");
		(isDowngrade as ReturnType<typeof vi.fn>).mockReturnValueOnce(true);
		const applyMock = applyMigrations as ReturnType<typeof vi.fn>;
		applyMock.mockClear();

		try {
			runMigrations("/tmp/test.db", "/tmp/drizzle");
		} catch {
			// expected
		}
		expect(applyMock).not.toHaveBeenCalled();
	});

	it("propagates errors from applyMigrations", async () => {
		const { applyMigrations, isDowngrade } = await import("@hyperidle/db");
		(isDowngrade as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
		(applyMigrations as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
			throw new Error("SQLITE_IOERR");
		});

		expect(() => runMigrations("/tmp/test.db", "/tmp/drizzle")).toThrow("SQLITE_IOERR");
	});
});
