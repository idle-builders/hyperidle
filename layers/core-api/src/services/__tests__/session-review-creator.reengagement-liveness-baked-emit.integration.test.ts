/**
 * AU21 Increment 3, reengagement wave (RED) — the SECOND real emit site
 * architecture.md §6 Decision B names for `reengagement`
 * (`proposed-call-workflow.ts:399`, inside `applyLivenessRetry`'s
 * `retryCount === 0` branch — the AC11b liveness net's first-no-show
 * re-provision, wired into production via `registerReviewSubscriptions`'s
 * `session_ended` liveness handler).
 *
 * When a session ends WITHOUT consuming its tailored grant (crash/no-show),
 * the liveness net records a FRESH `reengagement` intent to re-provision
 * once. This intent must ALSO be resolved + baked at emit time, exactly like
 * the "granted" transition's intent (`threads.reengagement-baked-emit.
 * integration.test.ts`) — same resolver, second real call site.
 *
 * Currently RED: `applyLivenessRetry`'s retry-intent `intentRecorder.record`
 * call carries no `bakedRequest` field today, so the recorded row's
 * `bakedRequestJson` is null.
 *
 * @lore this file wires `registerReviewSubscriptions` directly (matching
 * `AL7-two-session-loop.integration.test.ts`'s own `makeLivenessPorts`
 * precedent) rather than relying on the `app`/`eventBus` fixture, because
 * `test-fixtures.ts`'s `app` fixture uses plain `createApp` — it does NOT
 * invoke `registerCoreDomainServices`/`registerReviewSubscriptions` the way
 * production's `createServer` boot path does (only
 * `registerAgentRunAdmissionReactions` is fixture-wired). Uses the REAL
 * `enqueueWorkIntent`/`requireRunnableAgent`/a real `tasks` reader — not
 * mocks standing in for the resolver under test (a mock-validating-its-own-
 * mock proves nothing).
 *
 * @lore forward-compat: the `ports` object below carries a `requireRunnableAgent`
 * field `ReviewPorts` does not declare YET (this wave's GREEN phase widens
 * it, per the sibling resolver files' Mechanism C convention). It is passed
 * as a plain (non-freshly-literal, unannotated) variable, so TypeScript's
 * excess-property check does not fire — `npm run check` stays green through
 * this RED phase without requiring the production type widening first.
 */

import {
	agentWorkIntents,
	artifacts,
	type HyperIdleDb,
	messages,
	proposedCalls,
	tailoredGrants,
	tasks,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import type { SessionEndedEvent } from "@hyperidle/event-bus";
import { registerReviewSubscriptions } from "@hyperidle/review";
import { enqueueWorkIntent } from "@hyperidle/session-requests";
import { requireRunnableAgent } from "@hyperidle/users";
import { and, eq } from "drizzle-orm";
import { describe, expect, test, vi } from "../../__testing__/test-fixtures.js";

const NOW = new Date().toISOString();

async function getTaskById(db: HyperIdleDb, id: string) {
	const [row] = await db.select().from(tasks).where(eq(tasks.id, id));
	return row;
}

describe("reengagement liveness-net retry is resolved and baked at emit time (session_ended, unconsumed grant)", () => {
	test("first no-show re-provision bakes the reengagement request onto the retry intent", async ({
		db,
		eventBus,
	}) => {
		const idPrefix = "au21-reengage-liveness-1";
		const teamId = `${idPrefix}-team`;
		const rootTaskId = `${idPrefix}-bet`;
		const taskId = `${idPrefix}-task`;
		const agentId = `${idPrefix}-agent`;
		const pcId = `${idPrefix}-pc`;

		await db.insert(teams).values({ id: teamId, name: teamId, phase: "build", createdAt: NOW });
		await db.insert(users).values({
			id: agentId,
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(tasks).values({
			id: rootTaskId,
			parentTaskId: null,
			teamId: teamId,
			title: "Reengagement liveness baked-emit test bet",
			description: "Reengagement liveness baked-emit test bet",
			state: "in_progress",
			createdAt: NOW,
			updatedAt: NOW,
		});
		await db.insert(tasks).values({
			id: taskId,
			parentTaskId: rootTaskId,
			teamId,
			ownerAgentId: agentId,
			title: "Reengagement liveness baked-emit test task",
			state: "in_progress",
			createdAt: NOW,
			updatedAt: NOW,
		});
		await db.insert(threads).values({
			id: `${idPrefix}-thread`,
			hostKind: "task",
			hostId: taskId,
			initiatorId: agentId,
			participants: JSON.stringify([agentId]),
			lastActiveAt: NOW,
			createdAt: NOW,
		});
		await db.insert(messages).values({
			id: `${idPrefix}-msg`,
			senderId: agentId,
			threadId: `${idPrefix}-thread`,
			type: "review",
			payload: JSON.stringify({ title: "Review", reasoning: ["reason"] }),
			clientKey: `${idPrefix}-msg`,
			createdAt: NOW,
		});
		await db.insert(artifacts).values({
			id: `${idPrefix}-artifact`,
			producingTaskId: taskId,
			kind: "action_operation",
			createdAt: NOW,
		});
		await db.insert(proposedCalls).values({
			id: pcId,
			reviewMessageId: `${idPrefix}-msg`,
			subjectThreadId: `${idPrefix}-thread`,
			artifactId: `${idPrefix}-artifact`,
			originSessionId: `${idPrefix}-origin`,
			toolId: "commit_file",
			args: JSON.stringify({ path: "result.txt" }),
			identityHash: `${idPrefix}-hash`,
			reversibility: "irreversible",
			status: "granted",
			stagedByAgentId: agentId,
			createdAt: NOW,
		});
		await db.insert(tailoredGrants).values({
			proposedCallId: pcId,
			taskScope: taskId,
			agentScope: agentId,
			approvedToolId: "commit_file",
			approvedArgs: JSON.stringify({ path: "result.txt" }),
			consumed: false, // NOT consumed — session ended before the approved op ran
			retryCount: 0,
			mintedAt: NOW,
		});

		const ports = {
			work: {
				getTaskById,
				updateTaskById: async (): Promise<void> => {},
				createItem: async (): Promise<void> => {},
				getRiskTierByTaskId: async (): Promise<null> => null,
			},
			conversation: {
				insertThread: async (): Promise<void> => {},
				updateThread: async (): Promise<void> => {},
				getThreadById: async (): Promise<undefined> => undefined,
			},
			users: {
				getUserById: async (): Promise<undefined> => undefined,
				listUsersByKind: async (): Promise<never[]> => [],
			},
			org: { resolveReviewRecipients: async (): Promise<never[]> => [] },
			// @lore AU44: AgentWorkIntentRecorderInput still declares bakedRequest? for back-compat.
			// Cast via unknown avoids the contravariance mismatch — safe since liveness always bakes.
			intentRecorder: (
				input: Parameters<import("@hyperidle/domain-model").AgentWorkIntentRecorderFn>[0],
			) => enqueueWorkIntent(db, input as unknown as Parameters<typeof enqueueWorkIntent>[1]),
			// See top-of-file `@lore forward-compat`.
			requireRunnableAgent,
		};

		const unsub = registerReviewSubscriptions(db, eventBus, ports);
		const event: SessionEndedEvent = {
			type: "session_ended",
			streamId: "stream-au21-reengage-liveness",
			sessionId: `sess-${idPrefix}`,
			agentId,
			taskId,
			outcome: "completed",
			timestamp: Date.now(),
		};
		eventBus.emit(event);

		await vi.waitFor(async () => {
			const grants = await db
				.select()
				.from(tailoredGrants)
				.where(eq(tailoredGrants.proposedCallId, pcId));
			expect(grants[0]?.retryCount).toBe(1);
		});
		unsub();

		const [retryIntent] = await db
			.select()
			.from(agentWorkIntents)
			.where(and(eq(agentWorkIntents.kind, "reengagement"), eq(agentWorkIntents.sourceId, pcId)));
		expect(retryIntent).toBeDefined();

		// RED today: `applyLivenessRetry`'s retry-intent `record` call carries no
		// `bakedRequest` field.
		expect(retryIntent?.bakedRequestJson).toBeTruthy();
		const baked = retryIntent?.bakedRequestJson
			? (JSON.parse(retryIntent.bakedRequestJson) as Record<string, unknown>)
			: undefined;
		expect(baked).toMatchObject({
			defaultAgentId: agentId,
			sourceKind: "proposed_call",
			sourceId: pcId,
			streamId: `task:${taskId}`,
			taskId,
			teamId,
			sourceCorrelation: {
				taskId,
				proposedCallId: pcId,
				grantedAgentId: agentId,
			},
		});
	});
});
