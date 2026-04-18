import { type HyperIdleDb, createTestDb, knowledgeEditLog, knowledgeItems } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
// @lore VersionConflictError already exists in the repo (errors.ts); this
// test imports it directly. The locking tests below are the I3 acceptance
// tests for AC-OL-1..AC-OL-3 — they cover the *racy* path where two writers
// both observe the same version, where the existing knowledge-repository
// tests only cover the *sequential* stale-version case.
import { ItemDeletedError, VersionConflictError } from "../errors.js";
import { knowledgeEvents } from "../events.js";
import { create, getById, update } from "../knowledge-repository.js";

/**
 * I3 — knowledge-repository optimistic-locking acceptance tests.
 *
 * Per AC (TRACK-I.md L141-144) the implementation must include
 * `eq(knowledgeItems.version, expectedVersion)` in the UPDATE WHERE clause
 * and detect a TOCTOU race by inspecting `result.changes === 0`. The current
 * implementation only checks the version JS-side, so two callers that read
 * version=N concurrently both observe the same value and both succeed —
 * silently losing one writer's edits. These tests pin the post-fix
 * behaviour: only the first UPDATE wins, the second throws
 * `VersionConflictError(id, currentVersion)` carrying the *new* current
 * version after the winning write.
 *
 * Vitest is single-threaded per worker, so "concurrent" here means: simulate
 * the race by reading the version once, then issue both UPDATEs with that
 * same expectedVersion. The fix must reject the second UPDATE on the basis
 * of the (now-bumped) row version, not on a re-read in JS.
 */

describe("I3: knowledge-repository optimistic locking", () => {
	let db: HyperIdleDb;

	beforeEach(() => {
		db = createTestDb();
		knowledgeEvents.removeAllListeners();
	});

	const baseItem = {
		layer: "L1" as const,
		scopeId: "product-1",
		kind: "pattern" as const,
		topic: "testing",
		title: "Test Pattern",
		body: "This is a test pattern body.",
		format: "markdown" as const,
		status: "active" as const,
		updatedBy: "agent-1",
	};

	function bumpToVersion(id: string, target: number): void {
		// Helper: directly bump version via several updates so we can test
		// races at version N>1 without depending on a particular starting
		// value.
		let v = 1;
		while (v < target) {
			update(db, id, { title: `seed-v${v + 1}` }, v);
			v += 1;
		}
	}

	it("two writers reading version 5 race: first update wins, second throws VersionConflictError", () => {
		const created = create(db, baseItem);
		bumpToVersion(created.id, 5);
		expect(getById(db, created.id)?.version).toBe(5);

		// Both writers observe version 5 and try to write.
		const writerA = (): void => {
			update(db, created.id, { title: "Writer A wins" }, 5);
		};
		const writerB = (): void => {
			update(db, created.id, { title: "Writer B loses" }, 5);
		};

		writerA(); // wins → version 6
		expect(() => writerB()).toThrow(VersionConflictError);

		const final = getById(db, created.id);
		expect(final?.version).toBe(6);
		expect(final?.title).toBe("Writer A wins");
	});

	it("update with stale expectedVersion 4 throws VersionConflictError", () => {
		const created = create(db, baseItem);
		bumpToVersion(created.id, 5);

		try {
			update(db, created.id, { title: "stale" }, 4);
			expect.unreachable("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(VersionConflictError);
			const vce = err as VersionConflictError;
			expect(vce.currentVersion).toBe(5);
		}
	});

	it("update with correct expectedVersion succeeds and increments version", () => {
		const created = create(db, baseItem);
		bumpToVersion(created.id, 5);

		const result = update(db, created.id, { title: "fresh" }, 5);
		expect(result.version).toBe(6);
		expect(result.title).toBe("fresh");
	});

	it("rejects UPDATE when the row has been bumped between read and write (TOCTOU)", () => {
		// This is the *true* race-condition test. The current JS-side check
		// reads the row, compares versions in JS, then issues an UPDATE that
		// is NOT predicated on the version. If the row is modified between
		// the read and the write, the UPDATE silently overwrites — a lost
		// update. The post-fix implementation includes
		// `eq(knowledgeItems.version, expectedVersion)` in the WHERE clause
		// and inspects `changes === 0`, catching the race.
		//
		// We simulate the race by spying on the read so it returns the
		// pre-bump version while the row in the DB is at a higher version.
		const created = create(db, baseItem);
		bumpToVersion(created.id, 5);

		// Snapshot the stale row (version 5). This is what writer B "saw".
		const stale = db.select().from(knowledgeItems).where(eq(knowledgeItems.id, created.id)).get();
		expect(stale?.version).toBe(5);

		// Writer A bumps to version 6 (out-of-band: simulates a concurrent
		// transaction that committed between B's read and B's write).
		db.update(knowledgeItems)
			.set({ title: "Writer A", version: 6, updatedAt: new Date().toISOString() })
			.where(eq(knowledgeItems.id, created.id))
			.run();

		// Patch db.select + db.transaction so the in-tx select returns the
		// stale snapshot — the JS-side check will pass (5 === 5) and the
		// implementation will issue an UPDATE predicated on
		// `version=expectedVersion`. With the row's version already at 6,
		// that UPDATE matches zero rows and the implementation throws
		// VersionConflictError.
		//
		// I3 review W4: typed Mock<typeof db.select> instead of `as any`.
		// Drizzle's select chain is `select() -> from() -> where() -> get()`;
		// we type the stub via the actual return-type narrowing rather than
		// erasing it.
		// I3 review HIGH-3: update() now wraps in db.transaction. Spy on
		// transaction so the callback runs inline against `db` — that way
		// the spy on db.select intercepts the in-tx reads.
		// biome-ignore lint/suspicious/noExplicitAny: minimal inline-tx stub
		const txSpy = vi.spyOn(db, "transaction").mockImplementation(((cb: any) => cb(db)) as any);
		type SelectFn = typeof db.select;
		type SelectChain = ReturnType<SelectFn>;
		const realSelect = db.select.bind(db);
		let firstCall = true;
		const stubSelect: SelectFn = ((...args: Parameters<SelectFn>) => {
			if (firstCall) {
				firstCall = false;
				const stubChain = {
					from: () => ({
						where: () => ({
							get: () => stale,
						}),
					}),
				};
				return stubChain as unknown as SelectChain;
			}
			return realSelect(...args) as SelectChain;
		}) as SelectFn;
		const spy = vi.spyOn(db, "select").mockImplementation(stubSelect);

		try {
			expect(() => update(db, created.id, { title: "Writer B (loser)" }, 5)).toThrow(
				VersionConflictError,
			);
		} finally {
			spy.mockRestore();
			txSpy.mockRestore();
		}

		// Writer A's value must survive — Writer B must NOT have overwritten.
		const final = db.select().from(knowledgeItems).where(eq(knowledgeItems.id, created.id)).get();
		expect(final?.title).toBe("Writer A");
		expect(final?.version).toBe(6);
	});

	// I3 review W1: distinguish "row deleted" from "version conflict".
	// Pre-fix the second SELECT returning nothing was masked as a
	// VersionConflictError reporting the caller's own expectedVersion.
	//
	// Within a transaction the "row deleted concurrently" path is hard to
	// trigger from a single in-process test (BEGIN IMMEDIATE serialises
	// writes, and the transaction sees a consistent snapshot). We assert
	// the contract by spying on the transaction so that the in-tx reads
	// return a stale snapshot (passes JS version check), the in-tx
	// UPDATE matches zero rows (predicate evaluated against current
	// state), and the in-tx re-read returns undefined → ItemDeletedError.
	it("throws ItemDeletedError when the in-tx re-read returns undefined", () => {
		const created = create(db, baseItem);
		bumpToVersion(created.id, 5);

		const stale = db.select().from(knowledgeItems).where(eq(knowledgeItems.id, created.id)).get();
		expect(stale?.version).toBe(5);

		// Clear edit log first so we can delete the row (HIGH-2 RESTRICT
		// would otherwise block).
		db.delete(knowledgeEditLog).where(eq(knowledgeEditLog.itemId, created.id)).run();
		db.delete(knowledgeItems).where(eq(knowledgeItems.id, created.id)).run();

		// Spy on db.transaction so the callback runs inline against `db`
		// (not a real tx). This makes the spy on db.select effective for
		// reads inside the "transaction" body. The first read returns the
		// stale snapshot (passing JS version check); the UPDATE returns
		// `changes: 0` because the row is gone; the re-read returns
		// undefined → ItemDeletedError.
		// biome-ignore lint/suspicious/noExplicitAny: minimal inline-tx stub
		const txSpy = vi.spyOn(db, "transaction").mockImplementation(((cb: any) => cb(db)) as any);
		type SelectFn = typeof db.select;
		type SelectChain = ReturnType<SelectFn>;
		const realSelect = db.select.bind(db);
		let firstCall = true;
		const stubSelect: SelectFn = ((...args: Parameters<SelectFn>) => {
			if (firstCall) {
				firstCall = false;
				const stubChain = {
					from: () => ({
						where: () => ({
							get: () => stale,
						}),
					}),
				};
				return stubChain as unknown as SelectChain;
			}
			return realSelect(...args) as SelectChain;
		}) as SelectFn;
		const selSpy = vi.spyOn(db, "select").mockImplementation(stubSelect);

		try {
			expect(() => update(db, created.id, { title: "Posthumous edit" }, 5)).toThrow(
				ItemDeletedError,
			);
		} finally {
			selSpy.mockRestore();
			txSpy.mockRestore();
		}
	});

	// I3 review sec HIGH-3: explicit allow-list of editable fields. A JS
	// caller passing a runtime-extra `version: 0` field via the typed
	// UpdateKnowledgeItemInput must NOT be able to pin the version low —
	// the safeChanges allow-list excludes `version` regardless of source.
	it("ignores caller-supplied `version` field — version is computed server-side", () => {
		const created = create(db, baseItem);
		bumpToVersion(created.id, 5);

		// Cast to a permissive shape to simulate a JS-side caller passing
		// an extra field through TypeScript's structural typing.
		const evil = { title: "intent", version: 0 } as unknown as Parameters<typeof update>[2];
		const result = update(db, created.id, evil, 5);

		// Version should be 6, not 1 (the evil pin).
		expect(result.version).toBe(6);
		expect(result.title).toBe("intent");
	});

	it("VersionConflictError carries the latest current version after the winning write", () => {
		const created = create(db, baseItem);
		bumpToVersion(created.id, 5);

		// Mutate the row's version directly via Drizzle (simulates a parallel
		// UPDATE that completed between the test's read and write). This is
		// the most reliable way to simulate concurrency under a single-thread
		// runtime.
		db.update(knowledgeItems)
			.set({ version: 7, updatedAt: new Date().toISOString() })
			.where(eq(knowledgeItems.id, created.id))
			.run();

		try {
			update(db, created.id, { title: "loser" }, 5);
			expect.unreachable("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(VersionConflictError);
			expect((err as VersionConflictError).currentVersion).toBe(7);
		}
	});
});
