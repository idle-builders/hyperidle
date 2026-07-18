import { type HyperIdleDb, knowledgeAppProjection, knowledgeItems } from "@hyperidle/db";
import { createPracticeMeeting, runPracticeMeetingTurn } from "@hyperidle/knowledge";
import type { KnowledgeUpdatedEvent } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { describe, expect, test } from "../test-fixtures.js";

const NOW = "2026-04-18T00:00:00.000Z";
const NOW_MS = new Date(NOW).getTime();

/**
 * @lore AU20 Am9: `createPracticeMeeting`/`runPracticeMeetingTurn` relocated
 * from `@hyperidle/review` to `@hyperidle/knowledge` (its actual data owner).
 * The `PracticeMeetingKnowledgeStore` port + 9 raw-accessor construction
 * evaporated — functions now call the `*Raw` functions directly (Mechanism A,
 * same package). No port arg needed.
 */

describe("practice-meeting (AC6)", () => {
	async function seedMeeting(db: HyperIdleDb): Promise<string> {
		const created = await createPracticeMeeting(db, {
			scopeId: "community-build",
			title: "Weekly practice meeting",
			nowMs: NOW_MS,
		});
		return created.meetingId;
	}

	test("createPracticeMeeting creates an anchor knowledge_item with meta.role='practice_meeting_anchor'", async ({
		db,
	}) => {
		const { meetingId } = await createPracticeMeeting(db, {
			scopeId: "community-build",
			title: "W1",
			nowMs: NOW_MS,
		});
		// @lore O2: meta moved from knowledgeItems to knowledgeAppProjection.
		// The kernel row has no meta column; meta.role lives in the fabric row.
		const [anchor] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, meetingId));
		expect(anchor).toBeDefined();
		const [fabricRow] = await db
			.select()
			.from(knowledgeAppProjection)
			.where(eq(knowledgeAppProjection.knowledgeItemId, meetingId));
		const meta = JSON.parse(fabricRow?.meta ?? "{}") as {
			role?: string;
			turnsCompleted?: number[];
		};
		expect(meta.role).toBe("practice_meeting_anchor");
		expect(meta.turnsCompleted).toEqual([]);
	});

	test("turn 1 creates proposal knowledge_items with status=captured and meta.meetingId", async ({
		db,
		eventBus,
	}) => {
		const meetingId = await seedMeeting(db);

		const result = await runPracticeMeetingTurn(db, eventBus, {
			meetingId,
			turnNumber: 1,
			input: {
				proposals: [
					{ title: "Adopt hex architecture", body: "Because ...", layer: "L3", topic: "arch" },
					{ title: "Prefer small PRs", body: "Because ...", layer: "L3", topic: "process" },
				],
			},
			nowMs: NOW_MS,
		});
		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.createdIds.length).toBe(2);

		for (const id of result.createdIds) {
			const [row] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, id));
			expect(row?.status).toBe("captured");
			// @lore O2: meta moved to knowledgeAppProjection.
			const [fabricRow] = await db
				.select()
				.from(knowledgeAppProjection)
				.where(eq(knowledgeAppProjection.knowledgeItemId, id));
			const meta = JSON.parse(fabricRow?.meta ?? "{}") as {
				meetingId?: string;
				meetingPhase?: string;
			};
			expect(meta.meetingId).toBe(meetingId);
			expect(meta.meetingPhase).toBe("proposal");
		}
	});

	test("turn 2 creates reaction knowledge_items linked to proposals via meta.proposalId", async ({
		db,
		eventBus,
	}) => {
		const meetingId = await seedMeeting(db);

		const t1 = await runPracticeMeetingTurn(db, eventBus, {
			meetingId,
			turnNumber: 1,
			input: {
				proposals: [
					{ title: "Adopt hex architecture", body: "Because ...", layer: "L3", topic: "arch" },
				],
			},
			nowMs: NOW_MS,
		});
		expect(t1.success).toBe(true);
		if (!t1.success) return;
		const proposalId = t1.createdIds[0];
		expect(proposalId).toBeDefined();
		if (!proposalId) return;

		const t2 = await runPracticeMeetingTurn(db, eventBus, {
			meetingId,
			turnNumber: 2,
			input: {
				reactions: [
					{ proposalId, body: "Agree, but scope to new modules", author: "agent-x" },
					{ proposalId, body: "Concern: migration cost", author: "agent-y" },
				],
			},
			nowMs: NOW_MS,
		});
		expect(t2.success).toBe(true);
		if (!t2.success) return;
		expect(t2.createdIds.length).toBe(2);

		for (const id of t2.createdIds) {
			// @lore O2: meta moved to knowledgeAppProjection.
			const [fabricRow] = await db
				.select()
				.from(knowledgeAppProjection)
				.where(eq(knowledgeAppProjection.knowledgeItemId, id));
			const meta = JSON.parse(fabricRow?.meta ?? "{}") as {
				meetingId?: string;
				meetingPhase?: string;
				proposalId?: string;
			};
			expect(meta.meetingId).toBe(meetingId);
			expect(meta.meetingPhase).toBe("reaction");
			expect(meta.proposalId).toBe(proposalId);
		}
	});

	test("turn 3 creates synthesized knowledge_items with status=provisional", async ({
		db,
		eventBus,
	}) => {
		const meetingId = await seedMeeting(db);
		const t1 = await runPracticeMeetingTurn(db, eventBus, {
			meetingId,
			turnNumber: 1,
			input: {
				proposals: [
					{ title: "Adopt hex architecture", body: "Because ...", layer: "L3", topic: "arch" },
				],
			},
			nowMs: NOW_MS,
		});
		expect(t1.success).toBe(true);
		if (!t1.success) return;
		const proposalId = t1.createdIds[0];
		if (!proposalId) return;
		const t2 = await runPracticeMeetingTurn(db, eventBus, {
			meetingId,
			turnNumber: 2,
			input: {
				reactions: [{ proposalId, body: "Agree", author: "agent-x" }],
			},
			nowMs: NOW_MS,
		});
		expect(t2.success).toBe(true);

		const t3 = await runPracticeMeetingTurn(db, eventBus, {
			meetingId,
			turnNumber: 3,
			input: {
				synthesis: [
					{
						title: "Hex architecture for new modules",
						body: "Synth result",
						layer: "L3",
						topic: "arch",
						kind: "pattern",
					},
				],
			},
			nowMs: NOW_MS,
		});
		expect(t3.success).toBe(true);
		if (!t3.success) return;
		expect(t3.createdIds.length).toBe(1);

		const synthId = t3.createdIds[0];
		if (!synthId) return;
		const [synth] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, synthId));
		expect(synth?.status).toBe("provisional");
		// @lore O2: meta moved to knowledgeAppProjection.
		const [fabricRow] = await db
			.select()
			.from(knowledgeAppProjection)
			.where(eq(knowledgeAppProjection.knowledgeItemId, synthId));
		const meta = JSON.parse(fabricRow?.meta ?? "{}") as {
			meetingId?: string;
			meetingPhase?: string;
		};
		expect(meta.meetingId).toBe(meetingId);
		expect(meta.meetingPhase).toBe("synthesis");
	});

	test("turn 3 archives all proposal and reaction intermediates", async ({ db, eventBus }) => {
		const meetingId = await seedMeeting(db);
		const t1 = await runPracticeMeetingTurn(db, eventBus, {
			meetingId,
			turnNumber: 1,
			input: {
				proposals: [
					{ title: "P1", body: "B1", layer: "L3", topic: "x" },
					{ title: "P2", body: "B2", layer: "L3", topic: "x" },
				],
			},
			nowMs: NOW_MS,
		});
		expect(t1.success).toBe(true);
		if (!t1.success) return;
		const proposalIds = t1.createdIds;
		const firstProposalId = proposalIds[0];
		if (!firstProposalId) return;
		const t2 = await runPracticeMeetingTurn(db, eventBus, {
			meetingId,
			turnNumber: 2,
			input: {
				reactions: [{ proposalId: firstProposalId, body: "Agree", author: "a1" }],
			},
			nowMs: NOW_MS,
		});
		expect(t2.success).toBe(true);
		if (!t2.success) return;
		const reactionIds = t2.createdIds;

		await runPracticeMeetingTurn(db, eventBus, {
			meetingId,
			turnNumber: 3,
			input: {
				synthesis: [{ title: "S1", body: "syn", layer: "L3", topic: "x", kind: "pattern" }],
			},
			nowMs: NOW_MS,
		});

		for (const id of [...proposalIds, ...reactionIds]) {
			const [row] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, id));
			expect(row?.status).toBe("archived");
		}
	});

	test("running turn 2 before turn 1 returns INVALID_TURN", async ({ db, eventBus }) => {
		const meetingId = await seedMeeting(db);
		const result = await runPracticeMeetingTurn(db, eventBus, {
			meetingId,
			turnNumber: 2,
			input: { reactions: [] },
			nowMs: NOW_MS,
		});
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("INVALID_TURN");
	});

	test("running turn 1 twice returns INVALID_TURN on the second call", async ({ db, eventBus }) => {
		const meetingId = await seedMeeting(db);
		const first = await runPracticeMeetingTurn(db, eventBus, {
			meetingId,
			turnNumber: 1,
			input: { proposals: [] },
			nowMs: NOW_MS,
		});
		expect(first.success).toBe(true);
		const second = await runPracticeMeetingTurn(db, eventBus, {
			meetingId,
			turnNumber: 1,
			input: { proposals: [] },
			nowMs: NOW_MS,
		});
		expect(second.success).toBe(false);
		if (second.success) return;
		expect(second.code).toBe("INVALID_TURN");
	});

	test("turn 1 emits knowledge_updated events for each created proposal", async ({
		db,
		eventBus,
	}) => {
		const meetingId = await seedMeeting(db);
		const received: KnowledgeUpdatedEvent[] = [];
		eventBus.on("knowledge_updated", (e) => {
			received.push(e);
		});

		await runPracticeMeetingTurn(db, eventBus, {
			meetingId,
			turnNumber: 1,
			input: {
				proposals: [
					{ title: "P1", body: "B1", layer: "L3", topic: "x" },
					{ title: "P2", body: "B2", layer: "L3", topic: "x" },
				],
			},
			nowMs: NOW_MS,
		});
		const turnEvents = received.filter((e) => e.action === "practice_meeting_turn_1");
		expect(turnEvents.length).toBe(2);
	});

	test("unknown meetingId returns NOT_FOUND", async ({ db, eventBus }) => {
		const result = await runPracticeMeetingTurn(db, eventBus, {
			meetingId: "does-not-exist",
			turnNumber: 1,
			input: { proposals: [] },
			nowMs: NOW_MS,
		});
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("NOT_FOUND");
	});

	test("malformed anchor meta returns INVALID_STATE (distinct from NOT_FOUND)", async ({
		db,
		eventBus,
	}) => {
		// Seed an anchor with a role match but a broken turnsCompleted shape.
		// @lore O2: meta lives in knowledgeAppProjection, not knowledgeItems.
		const meetingId = await seedMeeting(db);
		await db
			.update(knowledgeAppProjection)
			.set({
				meta: JSON.stringify({
					role: "practice_meeting_anchor",
					scopeId: "community-build",
					title: "broken",
					turnsCompleted: "not-an-array",
				}),
			})
			.where(eq(knowledgeAppProjection.knowledgeItemId, meetingId));

		const result = await runPracticeMeetingTurn(db, eventBus, {
			meetingId,
			turnNumber: 1,
			input: { proposals: [] },
			nowMs: NOW_MS,
		});
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("INVALID_STATE");
	});

	test.skip("concurrent turn-1 returns CONCURRENT_MODIFICATION when anchor meta is mutated between tx read and tx update", async ({
		db,
		eventBus,
	}) => {
		// @lore PGlite: This race test is SQLite-specific. It relies on intercepting
		// synchronous `.get()` calls in a proxy. PGlite/Postgres uses async queries
		// and different transaction isolation (serializable vs. SQLite's optimistic
		// WHERE-pin approach). This test needs a Postgres-native equivalent.
		// The CONCURRENT_MODIFICATION path in the service is still present but
		// cannot be triggered via synchronous `.get()` interception in PGlite.
		// @lore G3 race test (original): the narrow race window is between the
		// tx-internal anchor read and the tx's conditional UPDATE. Under
		// real SQLite concurrency a competing writer can slip in there
		// and change `meta`; the loser's UPDATE WHERE meta = <stale
		// value> matches zero rows and we throw
		// CONCURRENT_MODIFICATION, rolling back the turn's inserts.
		//
		// In-process single-thread we simulate that race by wrapping
		// `db.transaction` so the tx handed to the service has its
		// `select().get()` instrumented: the first call resolves
		// normally, then we mutate the anchor *outside* the tx via the
		// outer db (which in better-sqlite3 operates on the same
		// connection — but the pin is byte-for-byte, so a changed `meta`
		// blob breaks the WHERE clause regardless).
		const meetingId = await seedMeeting(db);

		async function countProposals(): Promise<number> {
			// @lore O2: meta lives in knowledgeAppProjection, not knowledgeItems.
			const fabricRows = await db.select().from(knowledgeAppProjection);
			return fabricRows.filter((r) => {
				if (!r.meta) return false;
				try {
					const m = JSON.parse(r.meta) as Record<string, unknown>;
					return m.meetingId === meetingId && m.meetingPhase === "proposal";
				} catch {
					return false;
				}
			}).length;
		}
		const proposalsBefore = await countProposals();

		const originalTransaction = db.transaction.bind(db);
		type TxCallback<R> = Parameters<typeof originalTransaction<R>>[0];

		let anchorReadCount = 0;

		// Wrap a drizzle query-builder chain so that whenever `.get()` is
		// called and returns the anchor row, we inject a concurrent
		// mutation (within the tx) BEFORE handing the row back to the
		// caller. Drizzle returns a distinct builder per chained call
		// (`.from(...)`, `.where(...)`, etc.), so the wrapper has to
		// recurse: every method invocation whose return value is still a
		// chain builder is re-wrapped.
		type Tx = Parameters<TxCallback<unknown>>[0];
		type ChainBuilder = Record<string, unknown>;
		function wrapBuilder(builder: ChainBuilder, tx: Tx): ChainBuilder {
			return new Proxy(builder, {
				get(target, prop, receiver) {
					const value = Reflect.get(target, prop, receiver);
					if (typeof value !== "function") return value;
					const fn = value as (...args: unknown[]) => unknown;
					if (prop === "get") {
						return (...args: unknown[]) => {
							const result = fn.apply(target, args);
							// @lore O2: inject race on the FABRIC row read (has
							// knowledgeItemId === meetingId), not the kernel row (id === meetingId).
							// The proxy fires BEFORE returning the result, so the service
							// receives the ORIGINAL fabric meta value and uses it as the pin.
							// The mutation changes the DB, making the pinned UPDATE fail.
							if (
								result &&
								typeof result === "object" &&
								"knowledgeItemId" in (result as Record<string, unknown>) &&
								(result as { knowledgeItemId: unknown }).knowledgeItemId === meetingId &&
								anchorReadCount === 0
							) {
								anchorReadCount += 1;
								// Inject concurrent mutation WITHIN the tx so the
								// subsequent pinned UPDATE no longer matches.
								// @lore O2: meta lives in knowledgeAppProjection.
								tx.update(knowledgeAppProjection)
									.set({
										meta: JSON.stringify({
											role: "practice_meeting_anchor",
											scopeId: "community-build",
											title: "Weekly practice meeting",
											turnsCompleted: [],
											raceInjection: true,
										}),
									})
									.where(eq(knowledgeAppProjection.knowledgeItemId, meetingId));
							}
							return result;
						};
					}
					// Recursively wrap chain methods: from/where/orderBy/etc.
					return (...args: unknown[]) => {
						const next = fn.apply(target, args);
						if (next && typeof next === "object") {
							return wrapBuilder(next as ChainBuilder, tx);
						}
						return next;
					};
				},
			});
		}

		const racingDb = new Proxy(db, {
			get(target, prop, receiver) {
				if (prop === "transaction") {
					return <R>(cb: TxCallback<R>) => {
						const wrappedCb: TxCallback<R> = (tx) => {
							const txSelect = tx.select.bind(tx);
							const wrappedSelect = ((...args: Parameters<typeof txSelect>) => {
								const builder = txSelect(...args) as unknown as ChainBuilder;
								return wrapBuilder(builder, tx);
							}) as unknown as typeof txSelect;
							Object.defineProperty(tx, "select", {
								value: wrappedSelect,
								configurable: true,
								writable: true,
							});
							return cb(tx);
						};
						return originalTransaction<R>(wrappedCb);
					};
				}
				return Reflect.get(target, prop, receiver);
			},
		});

		const result = await runPracticeMeetingTurn(racingDb, eventBus, {
			meetingId,
			turnNumber: 1,
			input: {
				proposals: [{ title: "Loser", body: "b", layer: "L3", topic: "arch" }],
			},
			nowMs: NOW_MS,
		});

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("CONCURRENT_MODIFICATION");

		// Rollback proof: the proposal the losing tx tried to insert
		// must NOT have committed.
		const proposalsAfter = await countProposals();
		expect(proposalsAfter).toBe(proposalsBefore);

		// The entire tx (including the injected mutation) was rolled back,
		// so the anchor is back to its original pre-turn state —
		// turnsCompleted=[] and no raceInjection marker. That is the
		// correct behavior: the race's mutation happened inside the same
		// tx that then failed its own pin-UPDATE, so nothing the tx wrote
		// commits.
		// @lore O2: meta lives in knowledgeAppProjection.
		const [anchorFabric] = await db
			.select()
			.from(knowledgeAppProjection)
			.where(eq(knowledgeAppProjection.knowledgeItemId, meetingId));
		const anchorMeta = JSON.parse(anchorFabric?.meta ?? "{}") as {
			turnsCompleted?: number[];
			raceInjection?: boolean;
		};
		expect(anchorMeta.turnsCompleted).toEqual([]);
		expect(anchorMeta.raceInjection).toBeUndefined();
	});
});
