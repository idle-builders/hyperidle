/**
 * AU21 §9 Increment 8 (RED) — architecture.md §6 Decision F1: "`isAtCapacity`
 * (active-session count vs `maxConcurrentSessions`) folds into the existing
 * provision-time concurrency logic."
 *
 * Traced from source: this exact check is DUPLICATED today. `agent-selection/
 * src/service.ts`'s `atCapacity()` (`activeSessionCount >= agent.
 * maxConcurrentSessions`, missing agent -> true/fail-closed) is one
 * implementation, consumed by `routine`'s delegation decision
 * (`routine-service.ts`'s `resolveRoutineRunRequest`). `provisioner.ts`'s
 * `admitSession` Phase 3 (`layers/agent-orchestration/run-orchestration/
 * src/provisioner.ts:1072-1087`) is a SECOND, independent implementation of
 * the identical query (active `sessions` count for the agent vs
 * `maxConcurrentSessions`) — the real provision-time session-launch
 * admission gate, already live, that this wave's disposition rule (§7:
 * "dead/duplicate -> remove, a test proves the survivor works") targets.
 *
 * This module is the ONE canonical implementation both call sites converge
 * on: `provisioner.ts`'s Phase 3 gate reuses it (own-package internal
 * dedup — provisioner.ts is not touched by this test), and `routine`'s
 * `resolveRoutineRunRequest` gets it injected at the composition root
 * (`routine-scheduler-bindings.ts`, wired to THIS function instead of the
 * retired `agent-selection` package's duplicate).
 *
 * Reproduces `agent-selection`'s exact fail-closed-on-missing-agent
 * semantics (needed by the delegation caller, which may probe any
 * agentId) — `admitSession`'s own Phase 3 never hits that branch itself
 * since it already resolved+validated the agent in Phase 1.
 *
 * Currently RED: `../concurrency.js` does not exist yet — this import fails
 * to resolve, so every test below fails at collection/import time.
 *
 * @lore CONFUSION (resolved in-flight, flagged for reviewer): `isAgentAtCapacity`
 * takes a required reader third argument — `run-orchestration` may not read
 * another Service's tables directly (Table ACL, Mechanism A), the same reason
 * `provisioner.ts`'s own admission gate reads through an injected port rather
 * than a raw table query. This test file is itself ACL-exempt (test files
 * legitimately seed tables directly), so the reader below queries directly —
 * the behavioral assertions this test proves are otherwise unchanged.
 *
 * @lore AU26 G1 (architecture §D-L): the reader is now `ConcurrencyBoundReader`
 * (`getConcurrencyBound`) and is composed from TWO reads, because
 * `maxConcurrentSessions` moved off `users` into `agent_run_config`: `users`
 * answers existence (fail closed when absent) and `agent_run_config` answers
 * the bound (1 when never configured). The "fails closed for a nonexistent
 * agent" case below is exactly what that split must not lose.
 */

import { agentRunConfig, type HyperIdleDb, sessions, users } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";

/** Mirrors the real composition in `routine-scheduler-bindings.ts` — existence, then bound. */
const testBoundReader = {
	async getConcurrencyBound(
		db: HyperIdleDb,
		agentId: string,
	): Promise<{ readonly maxConcurrentSessions: number } | undefined> {
		const [user] = await db.select().from(users).where(eq(users.id, agentId)).limit(1);
		if (!user) return undefined;
		const [config] = await db
			.select({ maxConcurrentSessions: agentRunConfig.maxConcurrentSessions })
			.from(agentRunConfig)
			.where(eq(agentRunConfig.agentUserId, agentId))
			.limit(1);
		return { maxConcurrentSessions: config?.maxConcurrentSessions ?? 1 };
	},
};

async function seedAgent(
	db: HyperIdleDb,
	id: string,
	maxConcurrentSessions: number,
): Promise<void> {
	await db.insert(users).values({
		id,
		kind: "ai",
		name: `Agent ${id}`,
		role: "builder",
		status: "active",
		createdAt: new Date().toISOString(),
	});
	await db.insert(agentRunConfig).values({ agentUserId: id, maxConcurrentSessions });
}

async function seedSession(
	db: HyperIdleDb,
	options: { readonly id: string; readonly agentId: string; readonly state?: string },
): Promise<void> {
	await db.insert(sessions).values({
		id: options.id,
		agentId: options.agentId,
		modelTier: "fast",
		startedAt: new Date().toISOString(),
		state: options.state ?? "active",
	});
}

describe("isAgentAtCapacity — the one canonical provision-time concurrency check", () => {
	test("false when active session count is below maxConcurrentSessions", async ({ db }) => {
		const { isAgentAtCapacity } = await import("../concurrency.js");
		await seedAgent(db, "capacity-agent-1", 2);
		await seedSession(db, { id: "session-1a", agentId: "capacity-agent-1" });

		expect(await isAgentAtCapacity(db, "capacity-agent-1", testBoundReader)).toBe(false);
	});

	test("true when active session count meets maxConcurrentSessions", async ({ db }) => {
		const { isAgentAtCapacity } = await import("../concurrency.js");
		await seedAgent(db, "capacity-agent-2", 1);
		await seedSession(db, { id: "session-2a", agentId: "capacity-agent-2" });

		expect(await isAgentAtCapacity(db, "capacity-agent-2", testBoundReader)).toBe(true);
	});

	test("non-active sessions do not count toward the limit", async ({ db }) => {
		const { isAgentAtCapacity } = await import("../concurrency.js");
		await seedAgent(db, "capacity-agent-3", 1);
		await seedSession(db, { id: "session-3a", agentId: "capacity-agent-3", state: "completed" });

		expect(await isAgentAtCapacity(db, "capacity-agent-3", testBoundReader)).toBe(false);
	});

	test("fails closed (true) for an agent that does not exist", async ({ db }) => {
		const { isAgentAtCapacity } = await import("../concurrency.js");

		expect(await isAgentAtCapacity(db, "capacity-agent-missing", testBoundReader)).toBe(true);
	});
});
