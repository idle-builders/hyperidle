import { type HyperIdleDb, knowledgeEditLog, knowledgeItems } from "@hyperidle/db";
import { describe, expect, test, vi } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";
import { ItemDeletedError, VersionConflictError } from "../errors.js";
import { knowledgeEvents } from "../events.js";
import { create, getById, update } from "../knowledge-repository.js";

describe("I3: knowledge-repository optimistic locking", () => {
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

	async function bumpToVersion(db: HyperIdleDb, id: string, target: number): Promise<void> {
		let v = 1;
		while (v < target) {
			await update(db, id, { title: `seed-v${v + 1}` }, v);
			v += 1;
		}
	}

	test("two writers reading version 5 race: first update wins, second throws VersionConflictError", async ({
		db,
	}) => {
		knowledgeEvents.removeAllListeners();
		const created = await create(db, baseItem);
		await bumpToVersion(db, created.id, 5);
		expect((await getById(db, created.id))?.version).toBe(5);

		const writerA = async (): Promise<void> => {
			await update(db, created.id, { title: "Writer A wins" }, 5);
		};
		const writerB = async (): Promise<void> => {
			await update(db, created.id, { title: "Writer B loses" }, 5);
		};

		await writerA();
		await expect(writerB()).rejects.toThrow(VersionConflictError);

		const final = await getById(db, created.id);
		expect(final?.version).toBe(6);
		expect(final?.title).toBe("Writer A wins");
	});

	test("update with stale expectedVersion 4 throws VersionConflictError", async ({ db }) => {
		knowledgeEvents.removeAllListeners();
		const created = await create(db, baseItem);
		await bumpToVersion(db, created.id, 5);

		try {
			await update(db, created.id, { title: "stale" }, 4);
			expect.unreachable("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(VersionConflictError);
			const vce = err as VersionConflictError;
			expect(vce.currentVersion).toBe(5);
		}
	});

	test("update with correct expectedVersion succeeds and increments version", async ({ db }) => {
		knowledgeEvents.removeAllListeners();
		const created = await create(db, baseItem);
		await bumpToVersion(db, created.id, 5);

		const result = await update(db, created.id, { title: "fresh" }, 5);
		expect(result.version).toBe(6);
		expect(result.title).toBe("fresh");
	});

	test("rejects UPDATE when the row has been bumped between read and write (TOCTOU)", async ({
		db,
	}) => {
		knowledgeEvents.removeAllListeners();
		const created = await create(db, baseItem);
		await bumpToVersion(db, created.id, 5);

		const [stale] = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, created.id))
			.limit(1);
		expect(stale?.version).toBe(5);

		await db
			.update(knowledgeItems)
			.set({ title: "Writer A", version: 6, updatedAt: new Date().toISOString() })
			.where(eq(knowledgeItems.id, created.id));

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
							limit: () => Promise.resolve([stale]),
						}),
					}),
				};
				return stubChain as unknown as SelectChain;
			}
			return realSelect(...args) as SelectChain;
		}) as SelectFn;
		const spy = vi.spyOn(db, "select").mockImplementation(stubSelect);

		try {
			await expect(update(db, created.id, { title: "Writer B (loser)" }, 5)).rejects.toThrow(
				VersionConflictError,
			);
		} finally {
			spy.mockRestore();
			txSpy.mockRestore();
		}

		const [final] = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, created.id))
			.limit(1);
		expect(final?.title).toBe("Writer A");
		expect(final?.version).toBe(6);
	});

	test("throws ItemDeletedError when the in-tx re-read returns undefined", async ({ db }) => {
		knowledgeEvents.removeAllListeners();
		const created = await create(db, baseItem);
		await bumpToVersion(db, created.id, 5);

		const [stale] = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, created.id))
			.limit(1);
		expect(stale?.version).toBe(5);

		await db.delete(knowledgeEditLog).where(eq(knowledgeEditLog.itemId, created.id));
		await db.delete(knowledgeItems).where(eq(knowledgeItems.id, created.id));

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
							limit: () => Promise.resolve([stale]),
						}),
					}),
				};
				return stubChain as unknown as SelectChain;
			}
			return realSelect(...args) as SelectChain;
		}) as SelectFn;
		const selSpy = vi.spyOn(db, "select").mockImplementation(stubSelect);

		try {
			await expect(update(db, created.id, { title: "Posthumous edit" }, 5)).rejects.toThrow(
				ItemDeletedError,
			);
		} finally {
			selSpy.mockRestore();
			txSpy.mockRestore();
		}
	});

	test("ignores caller-supplied `version` field — version is computed server-side", async ({
		db,
	}) => {
		knowledgeEvents.removeAllListeners();
		const created = await create(db, baseItem);
		await bumpToVersion(db, created.id, 5);

		const evil = { title: "intent", version: 0 } as unknown as Parameters<typeof update>[2];
		const result = await update(db, created.id, evil, 5);

		expect(result.version).toBe(6);
		expect(result.title).toBe("intent");
	});

	test("VersionConflictError carries the latest current version after the winning write", async ({
		db,
	}) => {
		knowledgeEvents.removeAllListeners();
		const created = await create(db, baseItem);
		await bumpToVersion(db, created.id, 5);

		await db
			.update(knowledgeItems)
			.set({ version: 7, updatedAt: new Date().toISOString() })
			.where(eq(knowledgeItems.id, created.id));

		try {
			await update(db, created.id, { title: "loser" }, 5);
			expect.unreachable("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(VersionConflictError);
			expect((err as VersionConflictError).currentVersion).toBe(7);
		}
	});
});
