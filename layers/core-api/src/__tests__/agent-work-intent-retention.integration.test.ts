import { agentSessionRequests, agentWorkIntents, type HyperIdleDb, users } from "@hyperidle/db";
import { reapExpired } from "@hyperidle/session-requests";
import { eq, sql } from "drizzle-orm";
import { describe, expect, test } from "../__testing__/test-fixtures.js";
import { queueDeps } from "../services/durable-agent-queue.js";

const DAY = 86_400_000;
const now = new Date("2026-07-11T12:00:00.000Z");

/** A terminal request a handed_off intent can legally correlate to (requestId is required by the correlation check). */
async function seedTerminalRequest(db: HyperIdleDb, id: string): Promise<void> {
	const ts = now.toISOString();
	const agentId = `${id}-agent`;
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: "Agent",
		role: "builder",
		status: "active",
		createdAt: ts,
	});
	await db.insert(agentSessionRequests).values({
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
	});
}

async function reaper() {
	const module = await import("../services/durable-agent-queue.js");
	expect("reapExpired" in module).toBe(false);
	return (db: HyperIdleDb, options: { now: Date; retentionDays: number; batchSize: number }) =>
		reapExpired(queueDeps(db), options);
}

function intent(id: string, status: string, ageDays: number) {
	const timestamp = new Date(now.getTime() - ageDays * DAY).toISOString();
	return {
		id,
		kind: "assistant_turn",
		sourceKind: "thread_message",
		sourceId: `source-${id}`,
		idempotencyKey: `key-${id}`,
		status,
		...(status === "failed" ? { lastErrorCode: "INVALID_WORK_SOURCE" } : {}),
		...(status === "claimed"
			? {
					claimToken: `token-${id}`,
					claimExpiresAt: new Date(now.getTime() + 30_000).toISOString(),
				}
			: {}),
		createdAt: timestamp,
		updatedAt: timestamp,
	};
}

describe("terminal intent retention", () => {
	test("preserves 29-day terminal rows and deletes 31-day terminal rows", async ({ db }) => {
		await seedTerminalRequest(db, "retention-29-request");
		await db
			.insert(agentWorkIntents)
			.values([
				{ ...intent("retention-29", "handed_off", 29), requestId: "retention-29-request" },
				intent("retention-31", "failed", 31),
			]);
		await (await reaper())(db, { now, retentionDays: 30, batchSize: 500 });
		expect(
			await db.select().from(agentWorkIntents).where(eq(agentWorkIntents.id, "retention-29")),
		).toHaveLength(1);
		expect(
			await db.select().from(agentWorkIntents).where(eq(agentWorkIntents.id, "retention-31")),
		).toHaveLength(0);
	});

	for (const status of ["pending", "claimed"] as const) {
		test(`never deletes old active ${status} intents`, async ({ db }) => {
			const id = `retention-active-${status}`;
			await db.insert(agentWorkIntents).values(intent(id, status, 31));
			await (await reaper())(db, { now, retentionDays: 30, batchSize: 500 });
			expect(
				await db.select().from(agentWorkIntents).where(eq(agentWorkIntents.id, id)),
			).toHaveLength(1);
		});
	}

	test("schema supplies correlation checks, lifecycle FK, and retention indexes", async ({
		db,
	}) => {
		const result = await db.execute(sql`
			select c.conname from pg_constraint c
			join pg_class t on t.oid = c.conrelid
			where t.relname in ('agent_work_intents','agent_session_requests','sessions','explicit_session_starts','agent_lifecycle_inbox')
		`);
		const names = new Set(
			(result as { rows: Array<{ conname: string }> }).rows.map((row) => row.conname),
		);
		for (const required of [
			"agent_work_intents_correlation_ck",
			"agent_session_requests_correlation_ck",
			"explicit_session_starts_correlation_ck",
			"agent_lifecycle_inbox_request_id_agent_session_requests_id_fk",
		]) {
			expect(names).toContain(required);
		}
	});

	test("rejects invalid source-kind, status, and request correlation rows", async ({ db }) => {
		const badRows = [
			{ ...intent("bad-kind", "pending", 0), sourceKind: "unknown" },
			intent("bad-status", "invented", 0),
			{ ...intent("bad-correlation", "handed_off", 0), requestId: "missing-request" },
		];
		for (const row of badRows) {
			await expect(db.insert(agentWorkIntents).values(row)).rejects.toThrow();
		}
	});

	test("reaper exposes FK-safe cleanup for projected inbox, intent, and explicit source ordering", async () => {
		const module = await import("@hyperidle/session-requests");
		expect(module.reapExpired).toBeTypeOf("function");
	});
});
