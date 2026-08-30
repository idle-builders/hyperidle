/**
 * BA9c — Routine event context: the scheduler assembles task/bet subject from
 * the database when an event fires and passes it through to the baked bundle.
 *
 * Acceptance criteria exercised here:
 *   AC1: A routine that fires on an event receives the event (type + timestamp) in its run.
 *   AC2: It receives the entity the event concerns, assembled as fully as that entity is
 *        assembled elsewhere (task+bet for task events, matching the kind:"task" shape).
 *   AC3: It receives the transition (fromState/toState) — the action that led to the event.
 *   AC4: Works for every event type a routine may name. Where an entity cannot be assembled
 *        richly (no taskId/betId in the event), the routine still receives the event itself.
 *   AC5: A routine owned by a team-less agent still receives event context.
 *   AC7: No restart needed — tested via the BA1 e2e test (routine-scheduler-baked-emit.
 *        integration.test.ts). Preserved here: starting scheduler AFTER inserting the
 *        routine still fires on the next matching event.
 *   AC8: Clock-fired routines behave exactly as before — no triggerEvent in their bundle.
 *
 * @lore BA9c: The subject assembly (getTaskById → getBetById) happens in the scheduler,
 * not the resolver. The resolver just threads whatever RoutineTriggerEvent the scheduler
 * assembled. This keeps the resolver simple and ensures the subject reflects the DB state
 * AT THE MOMENT of firing, not some earlier snapshot.
 */

import { findThread, insertThread, listThreads } from "@hyperidle/conversation";
import {
	agentWorkIntents,
	artifacts,
	bets,
	type HyperIdleDb,
	items,
	routineRuns,
	routines,
	sessions,
	tasks,
	teams,
	threads,
	users,
	type WriteExecutor,
} from "@hyperidle/db";
import type { BetStateChangedEvent, EventBus, TaskStateChangedEvent } from "@hyperidle/event-bus";
import {
	create as createKnowledgeItem,
	getAgentIdentity,
	get as getKnowledgeItem,
	list as listKnowledgeItems,
	recomputeAttention,
	sweep,
} from "@hyperidle/knowledge";
import type { RoutineSchedulerPorts } from "@hyperidle/routine";
import { fireGenericRoutine } from "@hyperidle/routine";
import { enqueueWorkIntent } from "@hyperidle/session-requests";
import { readServerConfig } from "@hyperidle/settings";
import { findUser, requireRunnableAgent } from "@hyperidle/users";
import * as work from "@hyperidle/work";
import { eq } from "drizzle-orm";
import { vi } from "vitest";
import { describe, expect, test } from "../../__testing__/test-fixtures.js";
import { startRoutineScheduler } from "../routine-scheduler-bindings.js";

const NOW = new Date().toISOString();

/**
 * Real ports including BA9c's new DB-lookup ports for rich subject shapes.
 * Mirrors makePorts() from routine-scheduler-baked-emit.integration.test.ts.
 */
function makePorts(): RoutineSchedulerPorts {
	return {
		work: {
			getBetById: (db, id) => work.get(db, "bet", id),
			getTaskById: (db, id) => work.get(db, "task", id),
			getItemById: (db, id) => work.get(db, "item", id),
			getArtifactById: (db, id) => work.get(db, "artifact", id),
			createItem: (exec, values) => work.create(exec, "item", values),
			findRetroItemByThreadIds: async (db, threadIds, marker) => {
				const rows = await work.list(db, "item", { threadIds, bodyMarker: marker });
				return rows[0] ? { id: rows[0].id } : undefined;
			},
		},
		conversation: {
			getThreadIdsByHost: (db, hostKind, hostId) =>
				listThreads(db, { host: { kind: hostKind, id: hostId } }).then((ts) => ts.map((t) => t.id)),
			insertThread,
			findThreadById: (db, id) => findThread(db, { id }),
		},
		knowledge: {
			runAutoPromotionSweep: (db, eventBus) => sweep(db, eventBus, "autoPromotion"),
			runStaleSweep: (db, eventBus, nowMs, thresholdMs, options) =>
				sweep(db, eventBus, "stale", { nowMs, thresholdMs, ...options }),
			listRecentByLayers: (db, layers, since) =>
				listKnowledgeItems(db, { recentByLayers: { layers, since } }),
			recomputeAttentionForCandidates: async (
				db: HyperIdleDb,
				eventBus: EventBus,
				candidateIds: readonly string[],
			) => {
				const result = await recomputeAttention(
					{
						db,
						eventBus,
						work: {
							findItemByReasoningMarker: async (exec: WriteExecutor, marker: string) => {
								const rows = await work.list(exec, "item", { marker });
								return rows[0] ? { id: rows[0].id } : undefined;
							},
							createItem: (exec, values) => work.create(exec, "item", values),
						},
						conversation: { insertThread },
					},
					{ filter: { ids: candidateIds as string[] } },
				);
				if (!("ok" in result)) throw new Error("unexpected attention result");
				return result;
			},
			getItemById: async (db, id) => {
				const item = await getKnowledgeItem(db, id);
				return item ?? undefined;
			},
		},
		settings: {
			readServerConfig: async (db) => {
				const cfg = await readServerConfig(db);
				return { modelGateway: cfg.modelGateway, harnessDisabled: cfg.harnessDisabled };
			},
		},
		workIntents: { enqueueWorkIntent },
		requireRunnableAgent,
		getAgentIdentity,
		getTeamById: async (db, id) => {
			const [row] = await db.select().from(teams).where(eq(teams.id, id)).limit(1);
			return row;
		},
		// BA9c: getAgentById/getUserById — from the users table (same table, different discriminant).
		getAgentById: (db, id) =>
			findUser(db, { id }).then((u) => (u ? { id: u.id, name: u.name, role: u.role } : undefined)),
		getUserById: (db, id) =>
			findUser(db, { id }).then((u) => (u ? { id: u.id, name: u.name, role: u.role } : undefined)),
		assembleSessionKnowledge: async () => [],
	};
}

/** Seed a team + owner agent. */
async function seedTeamAndOwner(
	db: HyperIdleDb,
	id: string,
): Promise<{ teamId: string; ownerAgentId: string }> {
	const teamId = `${id}-team`;
	const ownerAgentId = `${id}-owner`;
	await db.insert(teams).values({ id: teamId, name: `${id} team`, phase: "build", createdAt: NOW });
	await db.insert(users).values({
		id: ownerAgentId,
		kind: "ai",
		name: `Owner ${id}`,
		role: "builder",
		status: "active",
		teamId,
		createdAt: NOW,
	});
	return { teamId, ownerAgentId };
}

/** Seed a bet. */
async function seedBet(
	db: HyperIdleDb,
	id: string,
	teamId: string,
	opts: { description?: string; status?: string } = {},
): Promise<void> {
	await db.insert(bets).values({
		id,
		teamId,
		description: opts.description ?? `Bet ${id}`,
		appetite: "small",
		status: opts.status ?? "active",
		createdAt: NOW,
	});
}

/** Seed a task under a bet. */
async function seedTask(
	db: HyperIdleDb,
	id: string,
	betId: string,
	teamId: string,
	opts: { title?: string; state?: string } = {},
): Promise<void> {
	await db.insert(tasks).values({
		id,
		betId,
		teamId,
		title: opts.title ?? `Task ${id}`,
		state: opts.state ?? "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
}

/** Seed an event-triggered routine. */
async function seedEventRoutine(
	db: HyperIdleDb,
	id: string,
	ownerAgentId: string,
	eventType: string,
): Promise<void> {
	await db.insert(routines).values({
		id,
		name: `${id} event routine`,
		state: "active",
		ownerAgentId,
		triggerType: "event",
		eventType,
		active: true,
	});
}

// ---------------------------------------------------------------------------
// AC1+AC2+AC3: task_state_changed → task+bet subject in bundle
// ---------------------------------------------------------------------------

describe("BA9c — task_state_changed event fires routine with task+bet subject in bundle", () => {
	test("baked bundle carries triggerEvent with task and bet assembled from the DB", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		const { ownerAgentId } = await seedTeamAndOwner(db, "ba9c-task-1");
		const betId = "ba9c-task-1-bet";
		const taskId = "ba9c-task-1-task";
		const routineId = "ba9c-task-1-routine";

		await seedBet(db, betId, "ba9c-task-1-team", { description: "Ship the BA9c feature" });
		await seedTask(db, taskId, betId, "ba9c-task-1-team", {
			title: "BA9c-UNIQUE-TITLE-Implement event context",
			state: "in_progress",
		});
		await seedEventRoutine(db, routineId, ownerAgentId, "task_state_changed");

		const scheduler = await startRoutineScheduler(db, eventBus, agentOrchestration, {
			pollIntervalMs: 999_999,
			canProvision: true,
		});
		try {
			const evt: TaskStateChangedEvent = {
				type: "task_state_changed",
				streamId: taskId,
				taskId,
				fromState: "in_progress",
				toState: "done",
				timestamp: Date.now(),
			};
			eventBus.emit(evt);

			await vi.waitFor(
				async () => {
					const runs = await db
						.select()
						.from(routineRuns)
						.where(eq(routineRuns.routineId, routineId));
					expect(runs).toHaveLength(1);
				},
				{ timeout: 2000 },
			);

			const [run] = await db.select().from(routineRuns).where(eq(routineRuns.routineId, routineId));
			const [intent] = await db
				.select()
				.from(agentWorkIntents)
				.where(eq(agentWorkIntents.sourceId, run?.id ?? ""));
			expect(intent?.bakedRequestJson).toBeTruthy();

			const baked = JSON.parse(intent!.bakedRequestJson!);

			// AC1: event type + timestamp present
			expect(baked.contextBundle.triggerEvent.type).toBe("task_state_changed");
			expect(baked.contextBundle.triggerEvent.timestamp).toBeGreaterThan(0);

			// AC3: transition (fromState/toState) present
			expect(baked.contextBundle.triggerEvent.transition).toMatchObject({
				from: "in_progress",
				to: "done",
			});

			// AC2: task subject assembled from DB (title proves it was loaded, not copied from event)
			expect(baked.contextBundle.triggerEvent.subject.kind).toBe("task");
			expect(baked.contextBundle.triggerEvent.subject.task.title).toBe(
				"BA9c-UNIQUE-TITLE-Implement event context",
			);
			expect(baked.contextBundle.triggerEvent.subject.task.id).toBe(taskId);
			// AC2: bet assembled too
			expect(baked.contextBundle.triggerEvent.subject.bet.description).toBe(
				"Ship the BA9c feature",
			);
		} finally {
			scheduler.stop();
		}
	});
});

// ---------------------------------------------------------------------------
// AC2+AC3: bet_state_changed → bet subject in bundle
// ---------------------------------------------------------------------------

describe("BA9c — bet_state_changed event fires routine with bet subject in bundle", () => {
	test("baked bundle carries triggerEvent with bet assembled from the DB", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		const { ownerAgentId } = await seedTeamAndOwner(db, "ba9c-bet-1");
		const betId = "ba9c-bet-1-bet";
		const routineId = "ba9c-bet-1-routine";

		await seedBet(db, betId, "ba9c-bet-1-team", {
			description: "BA9c-UNIQUE-BET-Launch the product",
		});
		await seedEventRoutine(db, routineId, ownerAgentId, "bet_state_changed");

		const scheduler = await startRoutineScheduler(db, eventBus, agentOrchestration, {
			pollIntervalMs: 999_999,
			canProvision: true,
		});
		try {
			const evt: BetStateChangedEvent = {
				type: "bet_state_changed",
				streamId: betId,
				betId,
				fromState: "active",
				toState: "completed",
				timestamp: Date.now(),
			};
			eventBus.emit(evt);

			await vi.waitFor(
				async () => {
					const runs = await db
						.select()
						.from(routineRuns)
						.where(eq(routineRuns.routineId, routineId));
					expect(runs).toHaveLength(1);
				},
				{ timeout: 2000 },
			);

			const [run] = await db.select().from(routineRuns).where(eq(routineRuns.routineId, routineId));
			const [intent] = await db
				.select()
				.from(agentWorkIntents)
				.where(eq(agentWorkIntents.sourceId, run?.id ?? ""));
			const baked = JSON.parse(intent!.bakedRequestJson!);

			expect(baked.contextBundle.triggerEvent.type).toBe("bet_state_changed");
			expect(baked.contextBundle.triggerEvent.transition).toMatchObject({
				from: "active",
				to: "completed",
			});
			expect(baked.contextBundle.triggerEvent.subject.kind).toBe("bet");
			expect(baked.contextBundle.triggerEvent.subject.bet.description).toBe(
				"BA9c-UNIQUE-BET-Launch the product",
			);
		} finally {
			scheduler.stop();
		}
	});
});

// ---------------------------------------------------------------------------
// AC4: thread_message_appended → rich thread subject (after BA9c rich shapes)
// ---------------------------------------------------------------------------

describe("BA9c — thread_message_appended produces kind:thread rich subject", () => {
	test("thread_message_appended: bundle has triggerEvent with thread subject loaded from DB", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		const { ownerAgentId } = await seedTeamAndOwner(db, "ba9c-nosubj-1");
		const routineId = "ba9c-nosubj-1-routine";
		const threadId = "thread-ba9c-nosubj";

		// Seed the thread so the DB lookup succeeds.
		await db.insert(threads).values({
			id: threadId,
			hostKind: "task",
			hostId: "task-ba9c-nosubj",
			initiatorId: ownerAgentId,
			participants: JSON.stringify([ownerAgentId]),
			lastActiveAt: NOW,
			createdAt: NOW,
		});

		await seedEventRoutine(db, routineId, ownerAgentId, "thread_message_appended");

		const scheduler = await startRoutineScheduler(db, eventBus, agentOrchestration, {
			pollIntervalMs: 999_999,
			canProvision: true,
		});
		try {
			eventBus.emit({
				type: "thread_message_appended",
				streamId: threadId,
				threadId,
				messageId: "msg-ba9c-nosubj",
				messageType: "plain",
				senderId: "user-ba9c-nosubj",
				timestamp: Date.now(),
			});

			await vi.waitFor(
				async () => {
					const runs = await db
						.select()
						.from(routineRuns)
						.where(eq(routineRuns.routineId, routineId));
					expect(runs).toHaveLength(1);
				},
				{ timeout: 2000 },
			);

			const [run] = await db.select().from(routineRuns).where(eq(routineRuns.routineId, routineId));
			const [intent] = await db
				.select()
				.from(agentWorkIntents)
				.where(eq(agentWorkIntents.sourceId, run?.id ?? ""));
			const baked = JSON.parse(intent!.bakedRequestJson!);

			expect(baked.contextBundle.triggerEvent.type).toBe("thread_message_appended");
			expect(baked.contextBundle.triggerEvent.timestamp).toBeGreaterThan(0);
			// BA9c: thread events now produce rich kind:"thread" subject (not generic)
			expect(baked.contextBundle.triggerEvent.subject.kind).toBe("thread");
			expect(baked.contextBundle.triggerEvent.subject.thread.hostKind).toBe("task");
			expect(baked.contextBundle.triggerEvent.subject.thread.hostId).toBe("task-ba9c-nosubj");
			expect(baked.contextBundle.triggerEvent.subject.actorId).toBe("user-ba9c-nosubj");
		} finally {
			scheduler.stop();
		}
	});
});

// ---------------------------------------------------------------------------
// AC4 (rich shapes): item_created, knowledge_created, artifact_created
// ---------------------------------------------------------------------------

describe("BA9c — item_created produces kind:item rich subject", () => {
	test("item_created: bundle has triggerEvent with item subject loaded from DB", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		const { ownerAgentId } = await seedTeamAndOwner(db, "ba9c-item-1");
		const routineId = "ba9c-item-1-routine";
		const itemId = "item-ba9c-1";
		const threadId = "thread-ba9c-item-1";

		// Seed a thread to satisfy the item's FK
		await db.insert(threads).values({
			id: threadId,
			hostKind: "bet",
			hostId: "bet-ba9c-item-1",
			initiatorId: ownerAgentId,
			participants: JSON.stringify([ownerAgentId]),
			lastActiveAt: NOW,
			createdAt: NOW,
		});

		// Seed the work item
		await db.insert(items).values({
			id: itemId,
			title: "BA9c-ITEM-TITLE-PROBE",
			kind: "review",
			body: "Item body",
			sourceAgentId: ownerAgentId,
			layer: "meta",
			riskTier: "low",
			threadId,
			createdAt: NOW,
		});

		await seedEventRoutine(db, routineId, ownerAgentId, "item_created");

		const scheduler = await startRoutineScheduler(db, eventBus, agentOrchestration, {
			pollIntervalMs: 999_999,
			canProvision: true,
		});
		try {
			eventBus.emit({
				type: "item_created",
				streamId: itemId,
				itemId,
				conversationId: threadId,
				kind: "review",
				timestamp: Date.now(),
			});

			await vi.waitFor(
				async () => {
					const runs = await db
						.select()
						.from(routineRuns)
						.where(eq(routineRuns.routineId, routineId));
					expect(runs).toHaveLength(1);
				},
				{ timeout: 2000 },
			);

			const [run] = await db.select().from(routineRuns).where(eq(routineRuns.routineId, routineId));
			const [intent] = await db
				.select()
				.from(agentWorkIntents)
				.where(eq(agentWorkIntents.sourceId, run?.id ?? ""));
			const baked = JSON.parse(intent!.bakedRequestJson!);

			expect(baked.contextBundle.triggerEvent.type).toBe("item_created");
			// BA9c: item_created → rich kind:"item" subject
			expect(baked.contextBundle.triggerEvent.subject.kind).toBe("item");
			expect(baked.contextBundle.triggerEvent.subject.item.title).toBe("BA9c-ITEM-TITLE-PROBE");
		} finally {
			scheduler.stop();
		}
	});
});

describe("BA9c — knowledge_created produces kind:knowledge-item rich subject", () => {
	test("knowledge_created: bundle has triggerEvent with knowledge-item subject loaded from DB", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		const { ownerAgentId } = await seedTeamAndOwner(db, "ba9c-ki-1");
		const routineId = "ba9c-ki-1-routine";

		// Seed a knowledge item via the service (writes kernel + projection together).
		const ki = await createKnowledgeItem(db, {
			title: "BA9c-KI-TITLE-PROBE",
			body: "Knowledge body content",
			format: "markdown",
			status: "active",
			layer: null,
			updatedBy: ownerAgentId,
		});
		const kiId = ki.id;

		await seedEventRoutine(db, routineId, ownerAgentId, "knowledge_created");

		const scheduler = await startRoutineScheduler(db, eventBus, agentOrchestration, {
			pollIntervalMs: 999_999,
			canProvision: true,
		});
		try {
			eventBus.emit({
				type: "knowledge_created",
				streamId: kiId,
				itemId: kiId,
				timestamp: Date.now(),
			});

			await vi.waitFor(
				async () => {
					const runs = await db
						.select()
						.from(routineRuns)
						.where(eq(routineRuns.routineId, routineId));
					expect(runs).toHaveLength(1);
				},
				{ timeout: 2000 },
			);

			const [run] = await db.select().from(routineRuns).where(eq(routineRuns.routineId, routineId));
			const [intent] = await db
				.select()
				.from(agentWorkIntents)
				.where(eq(agentWorkIntents.sourceId, run?.id ?? ""));
			const baked = JSON.parse(intent!.bakedRequestJson!);

			expect(baked.contextBundle.triggerEvent.type).toBe("knowledge_created");
			// BA9c: knowledge_created → rich kind:"knowledge-item" subject
			expect(baked.contextBundle.triggerEvent.subject.kind).toBe("knowledge-item");
			expect(baked.contextBundle.triggerEvent.subject.item.title).toBe("BA9c-KI-TITLE-PROBE");
		} finally {
			scheduler.stop();
		}
	});
});

describe("BA9c — artifact_created produces kind:artifact rich subject", () => {
	test("artifact_created: bundle has triggerEvent with artifact subject loaded from DB", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		const { ownerAgentId } = await seedTeamAndOwner(db, "ba9c-art-1");
		const routineId = "ba9c-art-1-routine";
		const artifactId = "artifact-ba9c-1";
		const betId = "bet-ba9c-art-1";
		const taskId = "task-ba9c-art-1";

		// Seed bet and task (artifact needs producing task)
		await seedBet(db, betId, "ba9c-art-1-team");
		await seedTask(db, taskId, betId, "ba9c-art-1-team");

		// Seed artifact
		await db.insert(artifacts).values({
			id: artifactId,
			producingTaskId: taskId,
			kind: "document",
			label: "BA9c artifact label",
			previewJson: null,
			createdAt: NOW,
		});

		await seedEventRoutine(db, routineId, ownerAgentId, "artifact_created");

		const scheduler = await startRoutineScheduler(db, eventBus, agentOrchestration, {
			pollIntervalMs: 999_999,
			canProvision: true,
		});
		try {
			eventBus.emit({
				type: "artifact_created",
				streamId: artifactId,
				artifactId,
				taskId,
				kind: "document",
				timestamp: Date.now(),
			});

			await vi.waitFor(
				async () => {
					const runs = await db
						.select()
						.from(routineRuns)
						.where(eq(routineRuns.routineId, routineId));
					expect(runs).toHaveLength(1);
				},
				{ timeout: 2000 },
			);

			const [run] = await db.select().from(routineRuns).where(eq(routineRuns.routineId, routineId));
			const [intent] = await db
				.select()
				.from(agentWorkIntents)
				.where(eq(agentWorkIntents.sourceId, run?.id ?? ""));
			const baked = JSON.parse(intent!.bakedRequestJson!);

			expect(baked.contextBundle.triggerEvent.type).toBe("artifact_created");
			// BA9c: artifact_created → rich kind:"artifact" subject
			expect(baked.contextBundle.triggerEvent.subject.kind).toBe("artifact");
			expect(baked.contextBundle.triggerEvent.subject.artifact.kind).toBe("document");
		} finally {
			scheduler.stop();
		}
	});
});

describe("BA9c — user_created produces kind:user rich subject (not generic)", () => {
	test("user_created: bundle has triggerEvent with user subject loaded from DB", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		const { ownerAgentId } = await seedTeamAndOwner(db, "ba9c-usr-1");
		const routineId = "ba9c-usr-1-routine";
		const newUserId = "ba9c-usr-1-new-user";

		// Seed a human user (the one who just joined — the subject of user_created).
		await db.insert(users).values({
			id: newUserId,
			kind: "human",
			name: "BA9c-USER-NAME-PROBE",
			role: "member",
			status: "active",
			teamId: "ba9c-usr-1-team",
			createdAt: NOW,
		});

		await seedEventRoutine(db, routineId, ownerAgentId, "user_created");

		const scheduler = await startRoutineScheduler(db, eventBus, agentOrchestration, {
			pollIntervalMs: 999_999,
			canProvision: true,
		});
		try {
			eventBus.emit({
				type: "user_created",
				streamId: newUserId,
				userId: newUserId,
				assistantAgentId: ownerAgentId,
				at: new Date().toISOString(),
			});

			await vi.waitFor(
				async () => {
					const runs = await db
						.select()
						.from(routineRuns)
						.where(eq(routineRuns.routineId, routineId));
					expect(runs).toHaveLength(1);
				},
				{ timeout: 2000 },
			);

			const [run] = await db.select().from(routineRuns).where(eq(routineRuns.routineId, routineId));
			const [intent] = await db
				.select()
				.from(agentWorkIntents)
				.where(eq(agentWorkIntents.sourceId, run?.id ?? ""));
			const baked = JSON.parse(intent!.bakedRequestJson!);

			expect(baked.contextBundle.triggerEvent.type).toBe("user_created");
			// BA9c: user_created → rich kind:"user" subject (not generic)
			expect(baked.contextBundle.triggerEvent.subject.kind).toBe("user");
			expect(baked.contextBundle.triggerEvent.subject.user.name).toBe("BA9c-USER-NAME-PROBE");
			expect(baked.contextBundle.triggerEvent.subject.user.role).toBe("member");
		} finally {
			scheduler.stop();
		}
	});
});

describe("BA9c — session_ended with taskId produces kind:session (not kind:task)", () => {
	test("session_ended: subject is session even when taskId is present in event", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		const { teamId, ownerAgentId } = await seedTeamAndOwner(db, "ba9c-sess-1");
		const routineId = "ba9c-sess-1-routine";
		const betId = "bet-ba9c-sess-1";
		const taskId = "task-ba9c-sess-1";
		const sessionId = "session-ba9c-sess-1";

		// Seed bet + task (so the session carries a real taskId)
		await seedBet(db, betId, teamId);
		await seedTask(db, taskId, betId, teamId);

		// Seed a session row (state + outcome are the probe values)
		await db.insert(sessions).values({
			id: sessionId,
			agentId: ownerAgentId,
			taskId,
			modelTier: "fast",
			startedAt: NOW,
			state: "ended",
			outcome: "BA9c-SESSION-OUTCOME-PROBE",
		});

		await seedEventRoutine(db, routineId, ownerAgentId, "session_ended");

		const scheduler = await startRoutineScheduler(db, eventBus, agentOrchestration, {
			pollIntervalMs: 999_999,
			canProvision: true,
		});
		try {
			eventBus.emit({
				type: "session_ended",
				streamId: sessionId,
				sessionId,
				agentId: ownerAgentId,
				taskId, // this is the secondary FK — must NOT become the subject
				timestamp: Date.now(),
				outcome: "completed",
			});

			await vi.waitFor(
				async () => {
					const runs = await db
						.select()
						.from(routineRuns)
						.where(eq(routineRuns.routineId, routineId));
					expect(runs).toHaveLength(1);
				},
				{ timeout: 2000 },
			);

			const [run] = await db.select().from(routineRuns).where(eq(routineRuns.routineId, routineId));
			const [intent] = await db
				.select()
				.from(agentWorkIntents)
				.where(eq(agentWorkIntents.sourceId, run?.id ?? ""));
			const baked = JSON.parse(intent!.bakedRequestJson!);

			// Primary assertion: session_ended → kind:"session", NOT kind:"task"
			expect(baked.contextBundle.triggerEvent.type).toBe("session_ended");
			expect(baked.contextBundle.triggerEvent.subject.kind).toBe("session");
			// Probe value from the DB row — cannot pass if assembly is skipped
			expect(baked.contextBundle.triggerEvent.subject.session.outcome).toBe(
				"BA9c-SESSION-OUTCOME-PROBE",
			);
		} finally {
			scheduler.stop();
		}
	});
});

describe("BA9c — agent_added produces kind:agent rich subject", () => {
	test("agent_added: subject is agent with probe name loaded from DB", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		const { teamId, ownerAgentId } = await seedTeamAndOwner(db, "ba9c-agt-1");
		const routineId = "ba9c-agt-1-routine";
		const newAgentId = "ba9c-agt-1-new-agent";

		// Seed the agent being added
		await db.insert(users).values({
			id: newAgentId,
			kind: "ai",
			name: "BA9c-AGENT-NAME-PROBE",
			role: "builder",
			status: "active",
			teamId,
			createdAt: NOW,
		});

		await seedEventRoutine(db, routineId, ownerAgentId, "agent_added");

		const scheduler = await startRoutineScheduler(db, eventBus, agentOrchestration, {
			pollIntervalMs: 999_999,
			canProvision: true,
		});
		try {
			eventBus.emit({
				type: "agent_added",
				streamId: teamId,
				teamId,
				teamMembersId: "ba9c-agt-1-members",
				agentId: newAgentId,
				role: "builder",
				at: new Date().toISOString(),
			});

			await vi.waitFor(
				async () => {
					const runs = await db
						.select()
						.from(routineRuns)
						.where(eq(routineRuns.routineId, routineId));
					expect(runs).toHaveLength(1);
				},
				{ timeout: 2000 },
			);

			const [run] = await db.select().from(routineRuns).where(eq(routineRuns.routineId, routineId));
			const [intent] = await db
				.select()
				.from(agentWorkIntents)
				.where(eq(agentWorkIntents.sourceId, run?.id ?? ""));
			const baked = JSON.parse(intent!.bakedRequestJson!);

			expect(baked.contextBundle.triggerEvent.type).toBe("agent_added");
			// BA9c: agent_added → kind:"agent" (not kind:"team")
			expect(baked.contextBundle.triggerEvent.subject.kind).toBe("agent");
			// Probe value from DB row
			expect(baked.contextBundle.triggerEvent.subject.agent.name).toBe("BA9c-AGENT-NAME-PROBE");
		} finally {
			scheduler.stop();
		}
	});
});

describe("BA9c — team_created produces kind:team rich subject", () => {
	test("team_created: subject is team with probe name loaded from DB", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		const { teamId, ownerAgentId } = await seedTeamAndOwner(db, "ba9c-tm-1");
		const routineId = "ba9c-tm-1-routine";

		// The team itself is already seeded by seedTeamAndOwner.
		// Override the name with the probe value.
		await db.update(teams).set({ name: "BA9c-TEAM-NAME-PROBE" }).where(eq(teams.id, teamId));

		await seedEventRoutine(db, routineId, ownerAgentId, "team_created");

		const scheduler = await startRoutineScheduler(db, eventBus, agentOrchestration, {
			pollIntervalMs: 999_999,
			canProvision: true,
		});
		try {
			eventBus.emit({
				type: "team_created",
				streamId: teamId,
				teamId,
				teamMembersId: "ba9c-tm-1-members",
				agentIds: [],
				at: new Date().toISOString(),
			});

			await vi.waitFor(
				async () => {
					const runs = await db
						.select()
						.from(routineRuns)
						.where(eq(routineRuns.routineId, routineId));
					expect(runs).toHaveLength(1);
				},
				{ timeout: 2000 },
			);

			const [run] = await db.select().from(routineRuns).where(eq(routineRuns.routineId, routineId));
			const [intent] = await db
				.select()
				.from(agentWorkIntents)
				.where(eq(agentWorkIntents.sourceId, run?.id ?? ""));
			const baked = JSON.parse(intent!.bakedRequestJson!);

			expect(baked.contextBundle.triggerEvent.type).toBe("team_created");
			// BA9c: team_created → kind:"team"
			expect(baked.contextBundle.triggerEvent.subject.kind).toBe("team");
			// Probe value from DB row
			expect(baked.contextBundle.triggerEvent.subject.team.name).toBe("BA9c-TEAM-NAME-PROBE");
		} finally {
			scheduler.stop();
		}
	});
});

// ---------------------------------------------------------------------------
// AC5: team-less owner still receives triggerEvent
// ---------------------------------------------------------------------------

describe("BA9c — team-less agent owner still receives triggerEvent in contextBundle", () => {
	test("bundle has triggerEvent even when team is null", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		// No team for this agent
		await db.insert(users).values({
			id: "ba9c-noteam-owner",
			kind: "ai",
			name: "Teamless Owner",
			role: "builder",
			status: "active",
			teamId: null,
			createdAt: NOW,
		});

		await db.insert(teams).values({
			id: "ba9c-noteam-team",
			name: "BA9c no-team test team",
			phase: "build",
			createdAt: NOW,
		});
		await db.insert(bets).values({
			id: "ba9c-noteam-bet",
			teamId: "ba9c-noteam-team",
			description: "BA9c-NOTEAM-BET-description",
			appetite: "small",
			status: "active",
			createdAt: NOW,
		});

		await db.insert(routines).values({
			id: "ba9c-noteam-routine",
			name: "BA9c team-less routine",
			state: "active",
			ownerAgentId: "ba9c-noteam-owner",
			triggerType: "event",
			eventType: "bet_state_changed",
			active: true,
		});

		const scheduler = await startRoutineScheduler(db, eventBus, agentOrchestration, {
			pollIntervalMs: 999_999,
			canProvision: true,
		});
		try {
			const evt: BetStateChangedEvent = {
				type: "bet_state_changed",
				streamId: "ba9c-noteam-bet",
				betId: "ba9c-noteam-bet",
				fromState: "active",
				toState: "completed",
				timestamp: Date.now(),
			};
			eventBus.emit(evt);

			await vi.waitFor(
				async () => {
					const runs = await db
						.select()
						.from(routineRuns)
						.where(eq(routineRuns.routineId, "ba9c-noteam-routine"));
					expect(runs).toHaveLength(1);
				},
				{ timeout: 2000 },
			);

			const [run] = await db
				.select()
				.from(routineRuns)
				.where(eq(routineRuns.routineId, "ba9c-noteam-routine"));
			const [intent] = await db
				.select()
				.from(agentWorkIntents)
				.where(eq(agentWorkIntents.sourceId, run?.id ?? ""));
			const baked = JSON.parse(intent!.bakedRequestJson!);

			// Team-less: team is null
			expect(baked.contextBundle.team).toBeNull();
			// But triggerEvent is still present (AC5)
			expect(baked.contextBundle.triggerEvent.type).toBe("bet_state_changed");
			expect(baked.contextBundle.triggerEvent.subject.kind).toBe("bet");
			expect(baked.contextBundle.triggerEvent.subject.bet.description).toBe(
				"BA9c-NOTEAM-BET-description",
			);
		} finally {
			scheduler.stop();
		}
	});
});

// ---------------------------------------------------------------------------
// AC8: clock-fired routine has no triggerEvent in bundle
// ---------------------------------------------------------------------------

describe("BA9c — clock-fired routine has no triggerEvent in the baked bundle", () => {
	test("fireGenericRoutine without event produces bundle with no triggerEvent", async ({
		db,
		eventBus,
	}) => {
		const teamId = "ba9c-clock-team";
		const ownerAgentId = "ba9c-clock-owner";
		const routineId = "ba9c-clock-routine";

		await db
			.insert(teams)
			.values({ id: teamId, name: "Clock team", phase: "build", createdAt: NOW });
		await db.insert(users).values({
			id: ownerAgentId,
			kind: "ai",
			name: "Clock Owner",
			role: "builder",
			status: "active",
			teamId,
			createdAt: NOW,
		});
		await db.insert(routines).values({
			id: routineId,
			name: "Clock routine",
			state: "active",
			ownerAgentId,
			triggerType: "heartbeat",
			active: true,
		});

		const [routine] = await db.select().from(routines).where(eq(routines.id, routineId));
		const result = await fireGenericRoutine(db, eventBus, routine!, makePorts());
		expect(result.fired).toBe(true);

		const [run] = await db.select().from(routineRuns).where(eq(routineRuns.routineId, routineId));
		const [intent] = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceId, run?.id ?? ""));
		const baked = JSON.parse(intent!.bakedRequestJson!);

		// AC8: clock path — no triggerEvent in the bundle
		expect(baked.contextBundle.triggerEvent).toBeUndefined();
	});
});
