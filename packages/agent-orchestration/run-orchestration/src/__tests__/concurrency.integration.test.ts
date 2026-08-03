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
 * `admitSession` Phase 3 (`packages/agent-orchestration/run-orchestration/
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
 * takes a required `ConcurrencyUserReader` (`getUserById`) third argument —
 * `run-orchestration` may not read the `users` table directly (Table ACL,
 * Mechanism A; `users` is owned by `packages/core-api/users`), the same
 * reason `provisioner.ts`'s own admission gate reads it through an injected
 * `SessionLifecycleUserReader` port rather than a raw table query. This test
 * file is itself ACL-exempt (test files legitimately seed tables directly),
 * so `testGetUserById` below queries `users` directly to build that reader —
 * the behavioral assertions this test proves are otherwise unchanged.
 */

import { type HyperIdleDb, sessions, users } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";

async function testGetUserById(
	db: HyperIdleDb,
	agentId: string,
): Promise<{ readonly maxConcurrentSessions: number } | undefined> {
	const [row] = await db.select().from(users).where(eq(users.id, agentId)).limit(1);
	return row;
}

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
		maxConcurrentSessions,
		createdAt: new Date().toISOString(),
	});
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

		expect(await isAgentAtCapacity(db, "capacity-agent-1", { getUserById: testGetUserById })).toBe(
			false,
		);
	});

	test("true when active session count meets maxConcurrentSessions", async ({ db }) => {
		const { isAgentAtCapacity } = await import("../concurrency.js");
		await seedAgent(db, "capacity-agent-2", 1);
		await seedSession(db, { id: "session-2a", agentId: "capacity-agent-2" });

		expect(await isAgentAtCapacity(db, "capacity-agent-2", { getUserById: testGetUserById })).toBe(
			true,
		);
	});

	test("non-active sessions do not count toward the limit", async ({ db }) => {
		const { isAgentAtCapacity } = await import("../concurrency.js");
		await seedAgent(db, "capacity-agent-3", 1);
		await seedSession(db, { id: "session-3a", agentId: "capacity-agent-3", state: "completed" });

		expect(await isAgentAtCapacity(db, "capacity-agent-3", { getUserById: testGetUserById })).toBe(
			false,
		);
	});

	test("fails closed (true) for an agent that does not exist", async ({ db }) => {
		const { isAgentAtCapacity } = await import("../concurrency.js");

		expect(
			await isAgentAtCapacity(db, "capacity-agent-missing", { getUserById: testGetUserById }),
		).toBe(true);
	});
});
