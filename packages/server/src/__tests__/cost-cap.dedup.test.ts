import {
	agents,
	bets,
	createTestDb,
	type HyperIdleDb,
	products,
	sessions,
	tasks,
	teams,
} from "@hyperidle/db";
// @lore These exports do not yet exist on cost-cap.ts as of I3 red phase.
// The plan §3.7 specifies adding `releaseSessionDedup(sessionId)` and a
// test-only `getDedupCacheSize()` accessor (or a similar inspection hook).
// Tests assert post-fix behaviour; implementation will add the exports.
import {
	clearDeduplicationCache,
	getDedupCacheSize,
	recordCostAndCheck,
	releaseSessionDedup,
} from "@hyperidle/fabric";
import { EventBus } from "@hyperidle/shared";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * I3 — cost-cap dedup memory bound acceptance tests.
 *
 * Per AC (TRACK-I.md L156-159):
 *  - `emittedEvents` Set replaced with bounded structure (LRU or per-session).
 *  - Entries cleaned up when sessions end.
 *  - After 1000 session cost checks, dedup cache stays bounded.
 *
 * Per plan §3.7 the bounded structure is `Map<sessionId, {agentId, teamId,
 * keys: Set<string>}>` and the lifecycle hook is `releaseSessionDedup`.
 * `getDedupCacheSize()` is a test-only accessor that returns the *number of
 * dead sessions still tracked*.
 */

const NOW = new Date().toISOString();

function seedAgentWithCap(
	db: HyperIdleDb,
	{
		agentId,
		teamId,
		productId,
		costCap,
	}: { agentId: string; teamId: string; productId: string; costCap: number },
): void {
	db.insert(products)
		.values({ id: productId, name: `P-${productId}`, phase: "build", createdAt: NOW })
		.onConflictDoNothing()
		.run();
	db.insert(teams)
		.values({
			id: teamId,
			productId,
			capacity: 5,
			activeBets: 0,
			costCap: 1_000_000, // very high so team breach doesn't dominate
			costActual: 0,
			formedAt: NOW,
		})
		.onConflictDoNothing()
		.run();
	db.insert(agents)
		.values({
			id: agentId,
			name: `A-${agentId}`,
			role: "builder",
			status: "active",
			maxConcurrentSessions: 1,
			teamId,
			costCap,
			costActual: 0,
			createdAt: NOW,
		})
		.onConflictDoNothing()
		.run();
}

function seedSession(
	db: HyperIdleDb,
	{
		sessionId,
		agentId,
		teamId,
		productId,
	}: { sessionId: string; agentId: string; teamId: string; productId: string },
): void {
	db.insert(bets)
		.values({
			id: `bet-${sessionId}`,
			productId,
			teamId,
			pitch: "x",
			appetite: "small",
			status: "committed",
			createdAt: NOW,
		})
		.onConflictDoNothing()
		.run();
	db.insert(tasks)
		.values({
			id: `task-${sessionId}`,
			betId: `bet-${sessionId}`,
			productId,
			teamId,
			title: "T",
			state: "in_progress",
			createdAt: NOW,
			updatedAt: NOW,
		})
		.onConflictDoNothing()
		.run();
	db.insert(sessions)
		.values({
			id: sessionId,
			taskId: `task-${sessionId}`,
			agentId,
			modelTier: "workhorse",
			startedAt: NOW,
			state: "active",
		})
		.onConflictDoNothing()
		.run();
}

describe("I3: cost-cap dedup cache bounded", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;

	beforeEach(() => {
		db = createTestDb();
		eventBus = new EventBus();
		clearDeduplicationCache();
	});

	it("dedup cache size for one session stays small after 1000 cost checks", async () => {
		seedAgentWithCap(db, {
			agentId: "agent-1",
			teamId: "team-1",
			productId: "prod-1",
			costCap: 100,
		});
		seedSession(db, {
			sessionId: "sess-1",
			agentId: "agent-1",
			teamId: "team-1",
			productId: "prod-1",
		});

		// 1000 cost-check events for the SAME session. Each emit may add a
		// dedup key, but per session we only have a handful of unique
		// (eventType × capLevel × entityId) tuples — so the per-session
		// dedup set must stay tiny.
		for (let i = 0; i < 1000; i++) {
			await recordCostAndCheck(db, eventBus, {
				sessionId: "sess-1",
				cost: 200, // far above 100 cap → triggers breach + warning
				agentId: "agent-1",
				teamId: "team-1",
				factoryCap: 1_000_000,
				factorySpend: 0,
			});
		}

		const size = getDedupCacheSize();
		expect(size, `dedup cache size after 1000 checks: ${size}`).toBeLessThanOrEqual(10);
	});

	it("releaseSessionDedup() drops the per-session entry to zero", async () => {
		seedAgentWithCap(db, {
			agentId: "agent-1",
			teamId: "team-1",
			productId: "prod-1",
			costCap: 100,
		});
		seedSession(db, {
			sessionId: "sess-1",
			agentId: "agent-1",
			teamId: "team-1",
			productId: "prod-1",
		});

		await recordCostAndCheck(db, eventBus, {
			sessionId: "sess-1",
			cost: 200,
			agentId: "agent-1",
			teamId: "team-1",
		});

		expect(getDedupCacheSize()).toBeGreaterThan(0);

		releaseSessionDedup("sess-1");

		expect(getDedupCacheSize()).toBe(0);
	});

	it("releasing one session does not poison another session's dedup state", async () => {
		seedAgentWithCap(db, {
			agentId: "agent-1",
			teamId: "team-1",
			productId: "prod-1",
			costCap: 100,
		});
		seedAgentWithCap(db, {
			agentId: "agent-2",
			teamId: "team-2",
			productId: "prod-2",
			costCap: 100,
		});
		seedSession(db, {
			sessionId: "sess-1",
			agentId: "agent-1",
			teamId: "team-1",
			productId: "prod-1",
		});
		seedSession(db, {
			sessionId: "sess-2",
			agentId: "agent-2",
			teamId: "team-2",
			productId: "prod-2",
		});

		// Both sessions breach.
		await recordCostAndCheck(db, eventBus, {
			sessionId: "sess-1",
			cost: 200,
			agentId: "agent-1",
			teamId: "team-1",
		});
		await recordCostAndCheck(db, eventBus, {
			sessionId: "sess-2",
			cost: 200,
			agentId: "agent-2",
			teamId: "team-2",
		});

		const sizeBefore = getDedupCacheSize();
		expect(sizeBefore).toBeGreaterThan(0);

		releaseSessionDedup("sess-1");

		const sizeAfter = getDedupCacheSize();
		// sess-2's entries must remain.
		expect(sizeAfter).toBeGreaterThan(0);
		expect(sizeAfter).toBeLessThan(sizeBefore);

		// And sess-2 still suppresses duplicates: re-emitting must not
		// trigger a new event on the bus (proxy: count emissions).
		const events: Array<{ type: string }> = [];
		eventBus.on("cost_cap_breached", (e) => events.push(e));
		eventBus.on("cost_cap_warning", (e) => events.push(e));
		await recordCostAndCheck(db, eventBus, {
			sessionId: "sess-2",
			cost: 200,
			agentId: "agent-2",
			teamId: "team-2",
		});
		expect(events.length).toBe(0);
	});

	// I3 review C2: lazy dedup-entry registration. A session that runs
	// 1000 cost checks UNDER the cap must produce ZERO dedup entries
	// (no breach → no key → no entry). Prior implementation pre-
	// registered an empty entry on every recordCostAndCheck, leaking
	// for sessions that never breached.
	it("1000 cost checks under cap on one session create zero dedup entries", async () => {
		// @lore O2: costActual accumulates across all calls; use a cap large
		// enough that 1000 * 10 = 10_000 stays below the 80% warning threshold
		// (0.8 * 100_000 = 80_000). The old test used 10_000 which would breach
		// after 1000 iterations.
		seedAgentWithCap(db, {
			agentId: "agent-x",
			teamId: "team-x",
			productId: "prod-x",
			costCap: 100_000,
		});
		seedSession(db, {
			sessionId: "sess-x",
			agentId: "agent-x",
			teamId: "team-x",
			productId: "prod-x",
		});

		for (let i = 0; i < 1000; i++) {
			await recordCostAndCheck(db, eventBus, {
				sessionId: "sess-x",
				cost: 10, // far below 10_000 cap
				agentId: "agent-x",
				teamId: "team-x",
			});
		}

		expect(getDedupCacheSize()).toBe(0);
	});

	it("aggregate dedup cache stays bounded after 1000 distinct sessions ended", async () => {
		// Cycle 1000 short-lived sessions through the cost path. After each
		// session ends, releaseSessionDedup must drop its entry, keeping the
		// total map size bounded.
		for (let i = 0; i < 1000; i++) {
			const productId = `prod-${i}`;
			const teamId = `team-${i}`;
			const agentId = `agent-${i}`;
			const sessionId = `sess-${i}`;
			seedAgentWithCap(db, { agentId, teamId, productId, costCap: 100 });
			seedSession(db, { sessionId, agentId, teamId, productId });

			await recordCostAndCheck(db, eventBus, {
				sessionId,
				cost: 200,
				agentId,
				teamId,
			});
			releaseSessionDedup(sessionId);
		}

		// After all sessions have been released, the dedup cache should be
		// empty (or at most a tiny constant for any non-session entries).
		expect(getDedupCacheSize()).toBeLessThanOrEqual(10);
	});
});
