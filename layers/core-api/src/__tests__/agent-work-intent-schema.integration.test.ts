/**
 * AU9 Remediation-2 — Durable-rows checks (enumerated in architecture.md
 * "Durable-rows checks (enumerated)"). One insert-and-expect-rejection case per
 * enumerated check, plus one accept case per valid state, driven directly
 * against the real DB fixture — these are constraint tests, not custody-surface
 * helper tests, so there is no R2 banned-import concern here.
 */

import {
	type AgentSessionRequest,
	type AgentWorkIntent,
	agentSessionRequests,
	agentWorkIntents,
	type HyperIdleDb,
	users,
} from "@hyperidle/db";
import { describe, expect, test } from "../__testing__/test-fixtures.js";

async function seedAgent(db: HyperIdleDb, id: string): Promise<void> {
	await db.insert(users).values({
		id,
		kind: "ai",
		name: "Agent",
		role: "builder",
		status: "active",
		createdAt: new Date().toISOString(),
	});
}

function baseIntent(
	overrides: Partial<typeof agentWorkIntents.$inferInsert> = {},
): typeof agentWorkIntents.$inferInsert {
	const ts = new Date().toISOString();
	return {
		id: "intent-default",
		kind: "assistant_turn",
		sourceKind: "thread_message",
		sourceId: "source-default",
		idempotencyKey: "key-default",
		status: "pending",
		createdAt: ts,
		updatedAt: ts,
		...overrides,
	};
}

async function seedTerminalRequest(db: HyperIdleDb, id: string): Promise<AgentSessionRequest> {
	const agentId = `${id}-agent`;
	await seedAgent(db, agentId);
	const ts = new Date().toISOString();
	const [row] = await db
		.insert(agentSessionRequests)
		.values({
			id,
			sourceKind: "assistant",
			sourceId: `${id}-message`,
			streamId: `${id}-thread`,
			agentId,
			promptMode: "conversation",
			sourceCorrelationJson: "{}",
			idempotencyKey: id,
			status: "completed",
			createdAt: ts,
			updatedAt: ts,
		})
		.returning();
	if (!row) throw new Error("Failed to seed terminal request");
	return row;
}

describe("agent_work_intents durable-rows checks", () => {
	test("accepts a valid pending row", async ({ db }) => {
		const [row] = await db.insert(agentWorkIntents).values(baseIntent()).returning();
		expect(row).toBeDefined();
	});

	test("rejects a kind outside the six closed values", async ({ db }) => {
		await expect(
			db.insert(agentWorkIntents).values(baseIntent({ id: "bad-kind", kind: "assistant" })),
		).rejects.toThrow();
	});

	test("rejects a source_kind outside the six closed values", async ({ db }) => {
		await expect(
			db
				.insert(agentWorkIntents)
				.values(baseIntent({ id: "bad-source-kind", sourceKind: "assistant" })),
		).rejects.toThrow();
	});

	test("rejects legacy task_dispatch kind (dropped from the closed set)", async ({ db }) => {
		await expect(
			db.insert(agentWorkIntents).values(
				baseIntent({
					id: "bad-legacy-kind",
					kind: "task_dispatch",
					sourceKind: "task_dispatch_attempt",
				}),
			),
		).rejects.toThrow();
	});

	test("rejects an incompatible kind/source pairing", async ({ db }) => {
		await expect(
			db.insert(agentWorkIntents).values(
				baseIntent({
					id: "bad-pair",
					kind: "routine_run",
					sourceKind: "thread_message",
				}),
			),
		).rejects.toThrow();
	});

	test("accepts every closed kind/source pairing", async ({ db }) => {
		const pairs: ReadonlyArray<readonly [AgentWorkIntent["kind"], AgentWorkIntent["sourceKind"]]> =
			[
				["assistant_turn", "thread_message"],
				["session_start", "explicit_session_start"],
				["knowledge_action", "knowledge_action"],
				["routine_run", "routine_run"],
				["task_run", "task_dispatch_attempt"],
				["reengagement", "proposed_call"],
			];
		for (const [kind, sourceKind] of pairs) {
			const [row] = await db
				.insert(agentWorkIntents)
				.values(
					baseIntent({
						id: `pair-${kind}`,
						kind,
						sourceKind,
						sourceId: `pair-source-${kind}`,
						idempotencyKey: `pair-key-${kind}`,
					}),
				)
				.returning();
			expect(row).toBeDefined();
		}
	});

	test("rejects claimed without both claim_token and claim_expires_at", async ({ db }) => {
		await expect(
			db.insert(agentWorkIntents).values(baseIntent({ id: "bad-claim", status: "claimed" })),
		).rejects.toThrow();
	});

	test("accepts claimed with both claim_token and claim_expires_at", async ({ db }) => {
		const [row] = await db
			.insert(agentWorkIntents)
			.values(
				baseIntent({
					id: "good-claim",
					status: "claimed",
					claimToken: "token-good-claim",
					claimExpiresAt: new Date(Date.now() + 30_000).toISOString(),
				}),
			)
			.returning();
		expect(row).toBeDefined();
	});

	test("rejects handed_off without a request_id", async ({ db }) => {
		await expect(
			db.insert(agentWorkIntents).values(baseIntent({ id: "bad-handoff", status: "handed_off" })),
		).rejects.toThrow();
	});

	test("accepts handed_off with a correlated request_id", async ({ db }) => {
		const request = await seedTerminalRequest(db, "good-handoff-request");
		const [row] = await db
			.insert(agentWorkIntents)
			.values(
				baseIntent({
					id: "good-handoff",
					status: "handed_off",
					requestId: request.id,
				}),
			)
			.returning();
		expect(row).toBeDefined();
	});

	test("rejects a second intent correlated to the same request_id", async ({ db }) => {
		const request = await seedTerminalRequest(db, "shared-request");
		await db.insert(agentWorkIntents).values(
			baseIntent({
				id: "shared-request-first",
				status: "handed_off",
				requestId: request.id,
			}),
		);
		await expect(
			db.insert(agentWorkIntents).values(
				baseIntent({
					id: "shared-request-second",
					sourceId: "shared-request-second-source",
					idempotencyKey: "shared-request-second-key",
					status: "handed_off",
					requestId: request.id,
				}),
			),
		).rejects.toThrow();
	});

	test("request_id FK rejects an intent correlated to an unknown request", async ({ db }) => {
		await expect(
			db.insert(agentWorkIntents).values(
				baseIntent({
					id: "bad-fk-handoff",
					status: "handed_off",
					requestId: "does-not-exist",
				}),
			),
		).rejects.toThrow();
	});

	test("rejects failed without last_error_code", async ({ db }) => {
		await expect(
			db.insert(agentWorkIntents).values(baseIntent({ id: "bad-failed", status: "failed" })),
		).rejects.toThrow();
	});

	test("accepts failed with last_error_code", async ({ db }) => {
		const [row] = await db
			.insert(agentWorkIntents)
			.values(
				baseIntent({ id: "good-failed", status: "failed", lastErrorCode: "INVALID_WORK_SOURCE" }),
			)
			.returning();
		expect(row).toBeDefined();
	});

	test("rejects pending with claim/correlation fields set", async ({ db }) => {
		const request = await seedTerminalRequest(db, "pending-with-claim-request");
		await expect(
			db.insert(agentWorkIntents).values(
				baseIntent({
					id: "bad-pending",
					status: "pending",
					claimToken: "should-not-be-set",
					requestId: request.id,
				}),
			),
		).rejects.toThrow();
	});

	test("accepts a superseded status with no claim/request correlation", async ({ db }) => {
		// A re-emit for the same (kind, sourceId) identity with a fresher
		// idempotencyKey retires the older pending/claimed intent as
		// `superseded` rather than `failed` — it was never an error.
		const [row] = await db
			.insert(agentWorkIntents)
			.values(baseIntent({ id: "good-superseded", status: "superseded" }))
			.returning();
		expect(row).toBeDefined();
	});

	test("rejects a duplicate (kind, source_kind, source_id, idempotency_key)", async ({ db }) => {
		await db.insert(agentWorkIntents).values(
			baseIntent({
				id: "dup-first",
				sourceId: "dup-source",
				idempotencyKey: "dup-key",
			}),
		);
		await expect(
			db.insert(agentWorkIntents).values(
				baseIntent({
					id: "dup-second",
					sourceId: "dup-source",
					idempotencyKey: "dup-key",
				}),
			),
		).rejects.toThrow();
	});
});

describe("agent_session_requests durable-rows checks", () => {
	async function baseRequest(
		db: HyperIdleDb,
		overrides: Partial<typeof agentSessionRequests.$inferInsert> = {},
	): Promise<typeof agentSessionRequests.$inferInsert> {
		const agentId = `${overrides.id ?? "request-default"}-agent`;
		await seedAgent(db, agentId);
		const ts = new Date().toISOString();
		return {
			id: "request-default",
			sourceKind: "assistant",
			sourceId: "source-default",
			streamId: "stream-default",
			agentId,
			promptMode: "conversation",
			sourceCorrelationJson: "{}",
			idempotencyKey: "request-key-default",
			status: "pending",
			createdAt: ts,
			updatedAt: ts,
			...overrides,
		};
	}

	test("accepts a valid pending row", async ({ db }) => {
		const values = await baseRequest(db);
		const [row] = await db.insert(agentSessionRequests).values(values).returning();
		expect(row).toBeDefined();
	});

	test("rejects claimed without claim_token and claim_expires_at", async ({ db }) => {
		const values = await baseRequest(db, { id: "bad-claimed-request", status: "claimed" });
		await expect(db.insert(agentSessionRequests).values(values)).rejects.toThrow();
	});

	test("accepts claimed with claim_token and claim_expires_at", async ({ db }) => {
		const values = await baseRequest(db, {
			id: "good-claimed-request",
			status: "claimed",
			claimToken: "token-good",
			claimExpiresAt: new Date(Date.now() + 30_000).toISOString(),
		});
		const [row] = await db.insert(agentSessionRequests).values(values).returning();
		expect(row).toBeDefined();
	});

	test("rejects running without a session_id", async ({ db }) => {
		const values = await baseRequest(db, { id: "bad-running-request", status: "running" });
		await expect(db.insert(agentSessionRequests).values(values)).rejects.toThrow();
	});

	test("accepts running with a session_id", async ({ db }) => {
		const values = await baseRequest(db, {
			id: "good-running-request",
			status: "running",
			sessionId: "session-good-running",
		});
		const [row] = await db.insert(agentSessionRequests).values(values).returning();
		expect(row).toBeDefined();
	});

	test("rejects a closed status with a live claim still set", async ({ db }) => {
		const values = await baseRequest(db, {
			id: "bad-closed-request",
			status: "completed",
			claimToken: "should-be-cleared",
			claimExpiresAt: new Date(Date.now() + 30_000).toISOString(),
		});
		await expect(db.insert(agentSessionRequests).values(values)).rejects.toThrow();
	});

	test("accepts a closed status with no live claim", async ({ db }) => {
		const values = await baseRequest(db, { id: "good-closed-request", status: "completed" });
		const [row] = await db.insert(agentSessionRequests).values(values).returning();
		expect(row).toBeDefined();
	});

	test("rejects a termination_reason outside the four closed values", async ({ db }) => {
		const values = await baseRequest(db, {
			id: "bad-termination-reason",
			status: "running",
			sessionId: "session-bad-reason",
			terminationReason: "not_a_real_reason",
		});
		await expect(db.insert(agentSessionRequests).values(values)).rejects.toThrow();
	});

	// @lore AU21 Increment 14a: "cost_cap" removed from the closed set — the
	// cap gate that produced it is HARD-DELETED, no replacement termination
	// reason.
	test("accepts every closed termination_reason value", async ({ db }) => {
		const reasons = ["user_done", "user_crashed", "handoff", "shutdown"] as const;
		for (const reason of reasons) {
			const values = await baseRequest(db, {
				id: `good-termination-${reason}`,
				sourceId: `termination-source-${reason}`,
				idempotencyKey: `termination-key-${reason}`,
				status: "running",
				sessionId: `session-${reason}`,
				terminationReason: reason,
			});
			const [row] = await db.insert(agentSessionRequests).values(values).returning();
			expect(row).toBeDefined();
		}
	});

	test("unique index rejects a second correlated request for the same source+idempotency key", async ({
		db,
	}) => {
		const first = await baseRequest(db, {
			id: "idem-first",
			sourceId: "idem-source",
			idempotencyKey: "idem-key",
		});
		await db.insert(agentSessionRequests).values(first);
		const second = await baseRequest(db, {
			id: "idem-second",
			sourceId: "idem-source",
			idempotencyKey: "idem-key",
		});
		await expect(db.insert(agentSessionRequests).values(second)).rejects.toThrow();
	});
});
