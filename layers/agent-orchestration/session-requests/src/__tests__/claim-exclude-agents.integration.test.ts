/**
 * BA5 §2.3/§4.1/§13 (L5) — the filesystem hold's claim-time filter.
 *
 * `ClaimOptions.excludeAgentIds` is the ONLY mechanism the hold adds to this
 * Service: a held agent's pending rows are simply never candidates for the
 * `{next:true}` claim, whether the row is `pending` or a stale `claimed`
 * lease. This Service reads no filesystems table — the caller
 * (`start-runtime.ts`) hands plain agent ids through the boot-wired
 * filesystems port (architecture.md §2.3).
 */

import { agentSessionRequests, type HyperIdleDb, teams, users } from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import { claimSessionRequest } from "../service.js";

const TEAM_ID = "team-t12-claim-exclude";

async function seedAgent(db: HyperIdleDb, agentId: string): Promise<void> {
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: agentId,
		role: "builder",
		status: "active",
		teamId: TEAM_ID,
		createdAt: new Date().toISOString(),
	});
}

async function seedPendingRequest(
	db: HyperIdleDb,
	id: string,
	agentId: string,
	createdAt: string,
): Promise<void> {
	await db.insert(agentSessionRequests).values({
		id,
		sourceKind: "task",
		sourceId: `${id}-source`,
		streamId: `task:${id}-source`,
		agentId,
		promptMode: "task",
		idempotencyKey: id,
		sourceCorrelationJson: JSON.stringify({ taskId: `${id}-source`, teamId: TEAM_ID }),
		status: "pending",
		createdAt,
		updatedAt: createdAt,
	});
}

async function seedExpiredClaimedRequest(
	db: HyperIdleDb,
	id: string,
	agentId: string,
	createdAt: string,
): Promise<void> {
	await db.insert(agentSessionRequests).values({
		id,
		sourceKind: "task",
		sourceId: `${id}-source`,
		streamId: `task:${id}-source`,
		agentId,
		promptMode: "task",
		idempotencyKey: id,
		sourceCorrelationJson: JSON.stringify({ taskId: `${id}-source`, teamId: TEAM_ID }),
		status: "claimed",
		claimedBy: "stale-worker",
		claimedAt: createdAt,
		claimToken: "stale-token",
		claimExpiresAt: "2000-01-01T00:00:00.000Z",
		createdAt,
		updatedAt: createdAt,
	});
}

test("excludeAgentIds skips a held agent's pending row, claiming another agent's", async ({
	db,
}) => {
	await db
		.insert(teams)
		.values({ id: TEAM_ID, name: "T12", phase: "build", createdAt: "2026-01-01" });
	await seedAgent(db, "agent-t12-a");
	await seedAgent(db, "agent-t12-b");
	// A is OLDER — without the exclusion the plain claim order would pick A.
	await seedPendingRequest(db, "req-t12-a", "agent-t12-a", "2026-01-01T00:00:00.000Z");
	await seedPendingRequest(db, "req-t12-b", "agent-t12-b", "2026-01-01T00:00:01.000Z");

	const claimed = await claimSessionRequest(
		db,
		{ next: true },
		{
			workerId: "worker-t12",
			now: new Date("2026-01-01T00:01:00.000Z"),
			leaseMs: 30_000,
			excludeAgentIds: ["agent-t12-a"],
		},
	);

	expect(claimed?.id).toBe("req-t12-b");
});

test("excludeAgentIds also skips a held agent's expired claimed row — it is not reclaimed either", async ({
	db,
}) => {
	await db
		.insert(teams)
		.values({ id: TEAM_ID, name: "T12", phase: "build", createdAt: "2026-01-01" });
	await seedAgent(db, "agent-t12-c");
	await seedExpiredClaimedRequest(db, "req-t12-c", "agent-t12-c", "2026-01-01T00:00:00.000Z");

	const claimed = await claimSessionRequest(
		db,
		{ next: true },
		{
			workerId: "worker-t12",
			now: new Date("2026-01-01T00:01:00.000Z"),
			leaseMs: 30_000,
			excludeAgentIds: ["agent-t12-c"],
		},
	);

	expect(claimed).toBeNull();
});

test("an empty exclude list claims normally — oldest pending request first", async ({ db }) => {
	await db
		.insert(teams)
		.values({ id: TEAM_ID, name: "T12", phase: "build", createdAt: "2026-01-01" });
	await seedAgent(db, "agent-t12-d");
	await seedAgent(db, "agent-t12-e");
	await seedPendingRequest(db, "req-t12-d", "agent-t12-d", "2026-01-01T00:00:00.000Z");
	await seedPendingRequest(db, "req-t12-e", "agent-t12-e", "2026-01-01T00:00:01.000Z");

	const claimed = await claimSessionRequest(
		db,
		{ next: true },
		{ workerId: "worker-t12", now: new Date("2026-01-01T00:01:00.000Z"), leaseMs: 30_000 },
	);

	expect(claimed?.id).toBe("req-t12-d");
});
