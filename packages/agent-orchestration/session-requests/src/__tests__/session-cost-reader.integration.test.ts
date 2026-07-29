/**
 * AU21 §9 Increment 6, Wave 2 (Decision D) — `AgentOrchestrationPort`'s
 * per-session-cost READ, RED phase.
 *
 * Wave 1 (already shipped, `43b9c906`) built the WRITE path:
 * `session-cost-recorder.ts` persists `costCents` onto the matching
 * `agentSessionRequests` row at `session_ended`. This wave builds the READ
 * side that closes the real gap `architecture.md` §6 Decision D traces:
 * `tasks.ts:199` hardcodes `cost: null` because nothing has ever served
 * per-session cost back out. `AgentOrchestrationPort.sessions.
 * getSessionCostBySessionId` (§10 contracts, the new agent-orchestration
 * read door) needs a query function on the `session-requests` side to back
 * it — this file specifies that function's contract directly against the
 * real table, one layer below the HTTP seam (the seam's own contract test,
 * `agent-orchestration-port.integration.test.ts`, proves the ROUTE reaches
 * this function; this file proves the function itself).
 *
 * `getSessionCostBySessionId` does NOT YET EXIST in `../service.js` (or the
 * package barrel, `../index.js`) — every test below fails at import-
 * resolution time. RED for the right reason (missing implementation, not a
 * typo).
 *
 * Target contract (GREEN-phase, matching `findRequestSessionInternal`'s
 * existing `sessionId` match convention):
 *   - a known `sessionId` whose row has a recorded `costCents` → that number.
 *   - a known `sessionId` whose row's `costCents` is still `null` (session
 *     ended before Wave 1 landed, or cost recording raced) → `null`.
 *   - an unknown `sessionId` (no `agentSessionRequests` row references it at
 *     all) → `undefined` — the same three-way `number | null | undefined`
 *     shape `findSessionRequest(..., {by:"sessionId"})` already uses for its
 *     analogous `Pick<AgentSessionRequest,"id"> | undefined` return, so the
 *     seam's route can map `undefined` → 404 and `null` → "not costed yet"
 *     without collapsing the two distinct un-costed states.
 */
import { agentSessionRequests, type HyperIdleDb, users } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
// NOT YET CREATED — this import failing to resolve is this file's primary RED signal.
import { getSessionCostBySessionId } from "../index.js";

const NOW = new Date().toISOString();

async function seedRequest(
	db: HyperIdleDb,
	id: string,
	sessionId: string | null,
	costCents: number | null,
): Promise<void> {
	const agentId = `${id}-agent`;
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: "Agent",
		role: "builder",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(agentSessionRequests).values({
		id,
		sourceKind: "task",
		sourceId: `${id}-task`,
		streamId: `task:${id}`,
		agentId,
		promptMode: "task",
		sourceCorrelationJson: JSON.stringify({}),
		idempotencyKey: `${id}-key`,
		status: sessionId ? "running" : "pending",
		sessionId,
		costCents,
		createdAt: NOW,
		updatedAt: NOW,
	});
}

describe("getSessionCostBySessionId — AgentOrchestrationPort's per-session-cost read (Decision D, Increment 6)", () => {
	test("a session with recorded cost returns the recorded costCents", async ({ db }) => {
		await seedRequest(db, "scr-costed", "scr-costed-session", 4321);

		await expect(getSessionCostBySessionId(db, "scr-costed-session")).resolves.toBe(4321);
	});

	test("a known session with no recorded cost yet returns null (distinct from unknown)", async ({
		db,
	}) => {
		await seedRequest(db, "scr-uncosted", "scr-uncosted-session", null);

		await expect(getSessionCostBySessionId(db, "scr-uncosted-session")).resolves.toBeNull();
	});

	test("an unknown sessionId returns undefined (no matching row at all)", async ({ db }) => {
		await seedRequest(db, "scr-other", "scr-other-session", 100);

		await expect(getSessionCostBySessionId(db, "does-not-exist")).resolves.toBeUndefined();
	});
});
