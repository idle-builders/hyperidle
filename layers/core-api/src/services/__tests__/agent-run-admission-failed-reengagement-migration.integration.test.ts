/**
 * AU21 Increment 3, reengagement wave (RED) — protected proof obligation
 * named explicitly in this wave's brief: confirm the `reengagement`
 * subscriber (Wave 0's existing retry-count liveness-net reaction,
 * `reengageOnAdmissionFailure`) still fires once the intent carries a REAL
 * baked payload produced by the REAL migrated emit call site, not merely the
 * still-present `resolveIntentInputInternal` "reengagement" case Wave 0's own
 * `agent-run-admission-failed-subscribers.integration.test.ts` deliberately
 * forces (a `status: "held"` proposed call → "Proposed call grant is not
 * eligible" — the exact drain-time mechanism THIS wave deletes).
 *
 * This file drives the real, already-migrated-by-this-wave emit call site
 * (`POST /api/threads/:threadId/messages/:messageId/verdict`, decision:
 * "approve" → `transitionProposedCall({to:"granted"})`,
 * `proposed-call-workflow.ts`) to create a REAL baked `reengagement` intent,
 * then forces a genuine drain-time failure — a real Postgres trigger
 * rejecting the `agent_session_requests` insert (the same fault-injection
 * idiom `agent-run-admission-failed-knowledge-action-migration.integration.test.ts`
 * already uses), forced terminal on the first attempt via `maxAttempts: 1`.
 * This is a legitimate downstream failure class for an ALREADY-validly-baked
 * payload: with zero re-validation at drain (Decision B step 2), the only way
 * a baked `reengagement` intent can still fail pre-handoff is a genuine
 * infra/DB fault at the hand-off write itself — exactly what this trigger
 * simulates.
 *
 * Currently RED: the "granted" transition does not yet bake a payload (this
 * wave's GREEN phase adds it), so the emitted intent's `bakedRequestJson` is
 * null — asserted directly below as the first, cheapest RED signal — meaning
 * the drain still runs the (still-present) per-kind `resolveIntentInputInternal`
 * "reengagement" case, not the baked hand-off path this test targets.
 */

import {
	agentWorkIntents,
	artifacts,
	bets,
	type HyperIdleDb,
	messages,
	proposedCalls,
	serviceConnections,
	tailoredGrants,
	tasks,
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import type { AgentRunAdmissionFailedEvent } from "@hyperidle/domain-model";
import { drainIntents } from "@hyperidle/session-requests";
import { eq, sql } from "drizzle-orm";
import { describe, expect, test, vi } from "../../__testing__/test-fixtures.js";

const NOW = new Date().toISOString();

async function rejectSessionRequestWrites(db: HyperIdleDb): Promise<void> {
	await db.execute(
		sql`drop trigger if exists au21_reengage_reject_session_request_write on agent_session_requests`,
	);
	await db.execute(sql`
		create or replace function au21_reengage_reject_session_request_write() returns trigger as $$
		begin raise exception 'AU21 injected agent_session_requests write failure'; end;
		$$ language plpgsql
	`);
	await db.execute(sql`
		create trigger au21_reengage_reject_session_request_write
		before insert on agent_session_requests
		for each row execute function au21_reengage_reject_session_request_write()
	`);
}

describe("agent_run_admission_failed — reengagement reaction fires for a REAL migrated (baked) intent", () => {
	test("a real baked reengagement intent that fails terminally at drain still re-provisions via the liveness-net pattern", async ({
		db,
		app,
		eventBus,
	}) => {
		const idPrefix = "au21-reengage-migration-1";
		const teamId = `${idPrefix}-team`;
		const betId = `${idPrefix}-bet`;
		const taskId = `${idPrefix}-task`;
		const agentId = `${idPrefix}-agent`;
		const threadId = `${idPrefix}-thread`;
		const messageId = `${idPrefix}-message`;
		const artifactId = `${idPrefix}-artifact`;

		await db.insert(teams).values({ id: teamId, name: teamId, phase: "build", createdAt: NOW });
		await db
			.insert(teamMembers)
			.values({ id: `${teamId}-members`, teamId, capacity: 5, activeBets: 0, formedAt: NOW });
		await db.insert(users).values({
			id: agentId,
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(bets).values({
			id: betId,
			teamId,
			description: "reengagement migration proof bet",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(tasks).values({
			id: taskId,
			betId,
			teamId,
			ownerAgentId: agentId,
			title: "reengagement migration proof task",
			state: "in_progress",
			createdAt: NOW,
			updatedAt: NOW,
		});
		await db.insert(threads).values({
			id: threadId,
			hostKind: "bet",
			hostId: betId,
			initiatorId: agentId,
			participants: JSON.stringify([agentId]),
			lastActiveAt: NOW,
			createdAt: NOW,
		});
		await db.insert(messages).values({
			id: messageId,
			senderId: agentId,
			threadId,
			type: "review",
			payload: JSON.stringify({
				title: "Review",
				reasoning: ["reason"],
				artifactRef: { id: artifactId, kind: "action_operation" },
			}),
			clientKey: messageId,
			createdAt: NOW,
		});
		await db.insert(artifacts).values({
			id: artifactId,
			producingTaskId: taskId,
			kind: "action_operation",
			createdAt: NOW,
		});
		await db.insert(proposedCalls).values({
			id: `${idPrefix}-pc`,
			reviewMessageId: messageId,
			subjectThreadId: threadId,
			artifactId,
			originSessionId: `${idPrefix}-origin`,
			toolId: "commit_file",
			args: JSON.stringify({ path: "result.txt" }),
			identityHash: `${idPrefix}-hash`,
			reversibility: "irreversible",
			status: "captured",
			stagedByAgentId: agentId,
			createdAt: NOW,
		});
		await db.insert(users).values({
			id: "u-au21-reengage-migration-founder",
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(serviceConnections).values({
			id: "sc-au21-reengage-migration",
			userId: "u-au21-reengage-migration-founder",
			service: "github",
			authSource: "token",
			encryptedToken: "au21-reengage-migration-encrypted-placeholder",
			serverUrl: null,
			health: "needs-attention",
			lastValidatedAt: null,
			createdAt: NOW,
			updatedAt: NOW,
		});

		const res = await app.request(`/api/threads/${threadId}/messages/${messageId}/verdict`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ decision: "approve", rationale: "LGTM" }),
		});
		expect(res.status).toBe(200);

		const [pcRow] = await db
			.select()
			.from(tailoredGrants)
			.where(eq(tailoredGrants.taskScope, taskId));
		expect(pcRow).toBeDefined();
		const proposedCallId = pcRow?.proposedCallId ?? "";

		const [intentBeforeDrain] = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.kind, "reengagement"));
		// RED today: the "granted" transition does not yet bake the request.
		expect(intentBeforeDrain?.bakedRequestJson).toBeTruthy();

		await rejectSessionRequestWrites(db);

		const emitted: AgentRunAdmissionFailedEvent[] = [];
		eventBus.on("agent_run_admission_failed", (event) => emitted.push(event));

		const { queueDeps } = await import("../durable-agent-queue.js");
		const deps = { ...queueDeps(db), eventBus };
		await drainIntents(deps, { maxAttempts: 1 });

		expect(emitted).toHaveLength(1);
		expect(emitted[0]).toMatchObject({
			kind: "reengagement",
			sourceId: proposedCallId,
			terminal: true,
		});

		await vi.waitFor(async () => {
			const [grant] = await db
				.select()
				.from(tailoredGrants)
				.where(eq(tailoredGrants.proposedCallId, proposedCallId));
			expect(grant?.retryCount).toBe(1);
			const retryIntents = await db
				.select()
				.from(agentWorkIntents)
				.where(eq(agentWorkIntents.kind, "reengagement"));
			// The original (baked, now-failed) + a fresh re-provision intent
			// recorded by the liveness net's admission-failure reaction.
			expect(retryIntents.length).toBeGreaterThanOrEqual(2);

			// @lore AU26 E3: the K1 assertion here proved this retry site baked the
			// owning human's held connections onto the fresh re-provision intent.
			// That bake is deleted — connections are read live at spawn — so the
			// fresh intent correctly carries none. What still matters is that the
			// liveness net produced a real fresh intent at all.
			const freshRetryIntent = retryIntents.find((row) => row.id !== intentBeforeDrain?.id);
			expect(freshRetryIntent?.bakedRequestJson ?? "").not.toContain("injectedConnections");
		});
	});
});
