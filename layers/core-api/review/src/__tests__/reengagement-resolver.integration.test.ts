/**
 * AU21 Increment 3, reengagement wave (RED) — architecture.md §6 Decision B's
 * placement ruling: "`reengagement` → extends
 * `layers/core-api/review/src/proposed-call-workflow.ts` in place (already
 * the emit site, `:290,399`)."
 *
 * This resolver must do EXACTLY what `resolveIntentInputInternal`'s
 * "reengagement" case does today (`session-requests/src/service.ts:783-804`),
 * reading only `review`'s own tables (`proposedCalls`/`tailoredGrants` via
 * the already-in-file `findProposedCall`) + the shared ast-`<userId>`
 * runnability invariant + `work`'s own `getTaskById` (injected — Mechanism C,
 * `@hyperidle/review` cannot statically import `@hyperidle/work` or
 * `@hyperidle/users`, per its `package.json`: `@hyperidle/db` +
 * framework packages only):
 *   1. Load the proposed call (by id) WITH its tailored grant.
 *   2. Reject if no grant exists, or the call's `status !== "granted"`.
 *   3. Validate the grant's `agentScope` is a runnable AI agent (never trust
 *      the flagging/requesting actor).
 *   4. Load the grant's `taskScope` task via the injected `getTaskById`;
 *      reject if missing.
 *   5. Bake the request: `defaultAgentId` (the grant's `agentScope`),
 *      `sourceKind: "proposed_call"`, `sourceId` (the proposed call's own
 *      id), `streamId: task:<taskId>`, `taskId`, `teamId`,
 *      `sourceCorrelation` (`taskId`, `proposedCallId`, `grantedAgentId`).
 *
 * Currently RED: no `resolveReengagementRequest` export exists anywhere in
 * `proposed-call-workflow.ts` (nor from the `@hyperidle/review` barrel) —
 * this import resolves to `undefined`, and calling it throws.
 *
 * @lore naming: the architecture doc does not pin an exact export name for
 * this resolver. `resolveReengagementRequest` is this wave's best-guess
 * interpretation (matching the sibling `resolveKnowledgeActionRequest`/
 * `resolveTaskRunRequest` naming convention), flagged for reviewer
 * confirmation — if the implementer picks a different name, only this
 * import line (and the sibling emit-site test files) need to change. Deps
 * shape (`ReengagementResolverDeps { requireRunnableAgent, getTaskById }`) is
 * likewise a best guess, matching `TaskRunResolverDeps`'s flat-fields
 * convention rather than `KnowledgeActionResolverDeps`'s single-field shape
 * (this resolver genuinely needs two injected cross-Service reads, not one).
 *
 * @lore Mechanism C: `requireRunnableAgent` (`@hyperidle/users`) and a
 * `getTaskById` (`@hyperidle/work`) are injected via a `deps` 3rd argument,
 * not statically imported. Test files live under `__tests__/` (guard-exempt,
 * matching every sibling resolver test's own precedent), so this file wires
 * the REAL `requireRunnableAgent` and a thin `getTaskById` reading `tasks`
 * directly — the same shape the real emit sites (`routes/threads.ts`'s
 * "granted" verdict handler, `proposed-call-workflow.ts`'s own
 * `applyLivenessRetry`) will wire in production.
 */

import { findThread } from "@hyperidle/conversation";
import {
	artifacts,
	type HyperIdleDb,
	knowledgeAppProjection,
	knowledgeItems,
	messages,
	proposedCalls,
	tailoredGrants,
	tasks,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { assembleSessionKnowledge } from "@hyperidle/knowledge";
import { getTeam } from "@hyperidle/org";
import { requireRunnableAgent } from "@hyperidle/users";
import { eq } from "drizzle-orm";

const NOW = new Date().toISOString();

async function getTaskById(db: HyperIdleDb, id: string) {
	const [row] = await db.select().from(tasks).where(eq(tasks.id, id));
	return row;
}

async function seedAgent(
	db: HyperIdleDb,
	options: { readonly id: string; readonly kind?: string; readonly status?: string },
): Promise<void> {
	await db.insert(users).values({
		id: options.id,
		kind: options.kind ?? "ai",
		name: "Agent",
		role: "builder",
		status: options.status ?? "active",
		createdAt: NOW,
	});
}

/**
 * Seeds team + root task (parentTaskId: null), returns the task id and teamId.
 *
 * @lore BB1: bets table deleted. Root tasks (parentTaskId === null) replace bets
 * as the top-level work container. `seedTask` no longer inserts into bets.
 */
async function seedTask(
	db: HyperIdleDb,
	options: { readonly id: string; readonly ownerAgentId?: string },
): Promise<{ readonly taskId: string; readonly teamId: string }> {
	const teamId = `${options.id}-team`;
	await db.insert(teams).values({ id: teamId, name: teamId, phase: "build", createdAt: NOW });
	await db.insert(tasks).values({
		id: options.id,
		parentTaskId: null,
		teamId,
		ownerAgentId: options.ownerAgentId,
		title: "Reengagement resolver test task",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
	return { taskId: options.id, teamId };
}

/**
 * Seeds a granted proposed call + its tailored grant, returns the proposed
 * call id. `proposedCalls`' FK chain (reviewMessageId -> messages,
 * subjectThreadId -> threads, artifactId -> artifacts -> tasks) is real and
 * PGlite enforces it — `artifactTaskId` (defaulting to the grant's own
 * `taskId`) is the task the seeded artifact/thread hang off; it only needs
 * to differ from `taskId` for the "grant's task no longer exists" scenario
 * (the grant's `taskScope` is a plain text column, NOT FK-checked, so it can
 * point at a task id absent from `tasks` while the surrounding review
 * artifacts stay FK-valid against a real placeholder task).
 */
async function seedGrantedProposedCall(
	db: HyperIdleDb,
	options: {
		readonly id: string;
		readonly taskId: string;
		readonly agentScope: string;
		readonly stagedByAgentId: string;
		readonly callStatus?: string;
		readonly artifactTaskId?: string;
	},
): Promise<void> {
	const artifactTaskId = options.artifactTaskId ?? options.taskId;
	await db.insert(threads).values({
		id: `${options.id}-thread`,
		hostKind: "task",
		hostId: artifactTaskId,
		initiatorId: options.stagedByAgentId,
		participants: JSON.stringify([options.stagedByAgentId]),
		lastActiveAt: NOW,
		createdAt: NOW,
	});
	await db.insert(messages).values({
		id: `${options.id}-msg`,
		senderId: options.stagedByAgentId,
		threadId: `${options.id}-thread`,
		type: "review",
		payload: JSON.stringify({ title: "Review", reasoning: ["reason"] }),
		clientKey: `${options.id}-msg`,
		createdAt: NOW,
	});
	await db.insert(artifacts).values({
		id: `${options.id}-artifact`,
		producingTaskId: artifactTaskId,
		kind: "action_operation",
		createdAt: NOW,
	});
	await db.insert(proposedCalls).values({
		id: options.id,
		reviewMessageId: `${options.id}-msg`,
		subjectThreadId: `${options.id}-thread`,
		artifactId: `${options.id}-artifact`,
		originSessionId: `${options.id}-origin`,
		toolId: "commit_file",
		args: JSON.stringify({ path: "result.txt" }),
		identityHash: `${options.id}-hash`,
		reversibility: "irreversible",
		status: options.callStatus ?? "granted",
		stagedByAgentId: options.stagedByAgentId,
		createdAt: NOW,
	});
	await db.insert(tailoredGrants).values({
		proposedCallId: options.id,
		taskScope: options.taskId,
		agentScope: options.agentScope,
		approvedToolId: "commit_file",
		approvedArgs: JSON.stringify({ path: "result.txt" }),
		retryCount: 0,
		mintedAt: NOW,
	});
}

// @lore these FK-referenced rows (messages/threads/artifacts) are NOT seeded
// deliberately — `proposedCalls`' FKs reference them, but PGlite's fixture
// pool does not appear to enforce them for this narrow resolver-only test
// (the resolver never reads those tables). If GREEN-phase wiring surfaces an
// FK violation here, seed minimal thread/message/artifact rows too — flagged
// for reviewer, not resolved blindly.

describe("resolveReengagementRequest — emit-time reengagement resolver (review)", () => {
	test("bakes the full request for a valid granted call, matching resolveIntentInputInternal's shape", async ({
		db,
	}) => {
		const { resolveReengagementRequest } = await import("../proposed-call-workflow.js");
		await seedAgent(db, { id: "ast-reengage-resolver-1" });
		const { taskId, teamId } = await seedTask(db, {
			id: "task-reengage-resolver-1",
			ownerAgentId: "ast-reengage-resolver-1",
		});
		await seedGrantedProposedCall(db, {
			id: "pc-reengage-resolver-1",
			taskId,
			agentScope: "ast-reengage-resolver-1",
			stagedByAgentId: "ast-reengage-resolver-1",
		});

		const baked = await resolveReengagementRequest(db, "pc-reengage-resolver-1", {
			requireRunnableAgent,
			getTaskById,
		});

		expect(baked).toMatchObject({
			defaultAgentId: "ast-reengage-resolver-1",
			sourceKind: "proposed_call",
			sourceId: "pc-reengage-resolver-1",
			streamId: `task:${taskId}`,
			taskId,
			teamId,
			sourceCorrelation: {
				taskId,
				proposedCallId: "pc-reengage-resolver-1",
				grantedAgentId: "ast-reengage-resolver-1",
			},
		});
	});

	test("rejects a proposed call with no tailored grant", async ({ db }) => {
		const { resolveReengagementRequest } = await import("../proposed-call-workflow.js");
		await seedAgent(db, { id: "ast-reengage-resolver-nogrant" });
		const { taskId } = await seedTask(db, {
			id: "task-reengage-resolver-nogrant",
			ownerAgentId: "ast-reengage-resolver-nogrant",
		});
		await db.insert(threads).values({
			id: "pc-reengage-resolver-nogrant-thread",
			hostKind: "task",
			hostId: taskId,
			initiatorId: "ast-reengage-resolver-nogrant",
			participants: JSON.stringify(["ast-reengage-resolver-nogrant"]),
			lastActiveAt: NOW,
			createdAt: NOW,
		});
		await db.insert(messages).values({
			id: "pc-reengage-resolver-nogrant-msg",
			senderId: "ast-reengage-resolver-nogrant",
			threadId: "pc-reengage-resolver-nogrant-thread",
			type: "review",
			payload: JSON.stringify({ title: "Review", reasoning: ["reason"] }),
			clientKey: "pc-reengage-resolver-nogrant-msg",
			createdAt: NOW,
		});
		await db.insert(artifacts).values({
			id: "pc-reengage-resolver-nogrant-artifact",
			producingTaskId: taskId,
			kind: "action_operation",
			createdAt: NOW,
		});
		await db.insert(proposedCalls).values({
			id: "pc-reengage-resolver-nogrant",
			reviewMessageId: "pc-reengage-resolver-nogrant-msg",
			subjectThreadId: "pc-reengage-resolver-nogrant-thread",
			artifactId: "pc-reengage-resolver-nogrant-artifact",
			originSessionId: "pc-reengage-resolver-nogrant-origin",
			toolId: "commit_file",
			args: JSON.stringify({}),
			identityHash: "pc-reengage-resolver-nogrant-hash",
			reversibility: "irreversible",
			status: "captured",
			stagedByAgentId: "ast-reengage-resolver-nogrant",
			createdAt: NOW,
		});

		await expect(
			resolveReengagementRequest(db, "pc-reengage-resolver-nogrant", {
				requireRunnableAgent,
				getTaskById,
			}),
		).rejects.toThrow();
	});

	test("rejects a proposed call whose grant exists but call status is not 'granted' (e.g. 'held')", async ({
		db,
	}) => {
		const { resolveReengagementRequest } = await import("../proposed-call-workflow.js");
		await seedAgent(db, { id: "ast-reengage-resolver-held" });
		const { taskId } = await seedTask(db, {
			id: "task-reengage-resolver-held",
			ownerAgentId: "ast-reengage-resolver-held",
		});
		await seedGrantedProposedCall(db, {
			id: "pc-reengage-resolver-held",
			taskId,
			agentScope: "ast-reengage-resolver-held",
			stagedByAgentId: "ast-reengage-resolver-held",
			callStatus: "held",
		});

		await expect(
			resolveReengagementRequest(db, "pc-reengage-resolver-held", {
				requireRunnableAgent,
				getTaskById,
			}),
		).rejects.toThrow();
	});

	test("rejects when the grant's agentScope is not a runnable AI agent (never trusts a human)", async ({
		db,
	}) => {
		const { resolveReengagementRequest } = await import("../proposed-call-workflow.js");
		// Deliberately do NOT seed "human-reengage-1" as an AI agent — the
		// resolver must reload the real users row for `grant.agentScope` and
		// reject, never trust the persisted scope blindly.
		await seedAgent(db, { id: "ast-reengage-resolver-staged" });
		const { taskId } = await seedTask(db, { id: "task-reengage-resolver-human" });
		await seedGrantedProposedCall(db, {
			id: "pc-reengage-resolver-human",
			taskId,
			agentScope: "human-reengage-1",
			stagedByAgentId: "ast-reengage-resolver-staged",
		});

		await expect(
			resolveReengagementRequest(db, "pc-reengage-resolver-human", {
				requireRunnableAgent,
				getTaskById,
			}),
		).rejects.toThrow();
	});

	test("rejects when the resolved agent exists but is not runnable (inactive AI agent)", async ({
		db,
	}) => {
		const { resolveReengagementRequest } = await import("../proposed-call-workflow.js");
		await seedAgent(db, {
			id: "ast-reengage-resolver-inactive",
			kind: "ai",
			status: "paused",
		});
		const { taskId } = await seedTask(db, {
			id: "task-reengage-resolver-inactive",
			ownerAgentId: "ast-reengage-resolver-inactive",
		});
		await seedGrantedProposedCall(db, {
			id: "pc-reengage-resolver-inactive",
			taskId,
			agentScope: "ast-reengage-resolver-inactive",
			stagedByAgentId: "ast-reengage-resolver-inactive",
		});

		await expect(
			resolveReengagementRequest(db, "pc-reengage-resolver-inactive", {
				requireRunnableAgent,
				getTaskById,
			}),
		).rejects.toThrow();
	});

	test("rejects when the grant's task no longer exists", async ({ db }) => {
		const { resolveReengagementRequest } = await import("../proposed-call-workflow.js");
		await seedAgent(db, { id: "ast-reengage-resolver-notask" });
		// A real placeholder task only for the review artifact chain's FKs — the
		// grant's `taskScope` (below) deliberately points at a DIFFERENT, absent
		// task id (`taskScope` is plain text, not FK-checked).
		const { taskId: artifactTaskId } = await seedTask(db, {
			id: "task-reengage-resolver-notask-placeholder",
			ownerAgentId: "ast-reengage-resolver-notask",
		});
		await seedGrantedProposedCall(db, {
			id: "pc-reengage-resolver-notask",
			taskId: "task-does-not-exist",
			agentScope: "ast-reengage-resolver-notask",
			stagedByAgentId: "ast-reengage-resolver-notask",
			artifactTaskId,
		});

		await expect(
			resolveReengagementRequest(db, "pc-reengage-resolver-notask", {
				requireRunnableAgent,
				getTaskById,
			}),
		).rejects.toThrow();
	});
});

/**
 * AU21 §9 Increment 12 (Decision H3), Wave B — `reengagement` bakes a
 * `contextBundle` (`kind:"task"`) with task/ancestors/agent/team content +
 * ranked knowledge.
 *
 * @lore BB1: `getBetById` removed — bets table is gone. `ancestors` replaces
 * `bet` in the contextBundle. A root task has no ancestors (empty array).
 *
 * @lore Mechanism C: `getTeamById` (`@hyperidle/org`) and
 * `assembleSessionKnowledge` (`@hyperidle/knowledge`) are INJECTED, following
 * `ReengagementResolverDeps`'s existing `getTaskById`-injection precedent.
 */
describe("resolveReengagementRequest — contextBundle baking (Increment 12 Wave B)", () => {
	test("bakes a contextBundle (kind:'task') with task/ancestors/agent/team content + ranked knowledge", async ({
		db,
	}) => {
		const { resolveReengagementRequest } = await import("../proposed-call-workflow.js");
		await seedAgent(db, { id: "ast-reengage-ctx-1" });
		const { taskId, teamId } = await seedTask(db, {
			id: "task-reengage-ctx-1",
			ownerAgentId: "ast-reengage-ctx-1",
		});
		await seedGrantedProposedCall(db, {
			id: "pc-reengage-ctx-1",
			taskId,
			agentScope: "ast-reengage-ctx-1",
			stagedByAgentId: "ast-reengage-ctx-1",
		});

		await db.insert(knowledgeItems).values({
			id: "item-reengage-ctx-l4",
			scopeKind: "factory",
			scopeId: null,
			title: "Factory-wide practice",
			body: "Applies everywhere.",
			format: "markdown",
			status: "active",
			version: 1,
			updatedBy: "ast-reengage-ctx-1",
			createdAt: NOW,
			updatedAt: NOW,
		});
		await db.insert(knowledgeAppProjection).values({
			id: "proj-reengage-ctx-l4",
			knowledgeItemId: "item-reengage-ctx-l4",
			layer: "L4",
			scopeId: null,
		});

		const baked = await resolveReengagementRequest(db, "pc-reengage-ctx-1", {
			requireRunnableAgent,
			getTaskById,
			getTeamById: (d: HyperIdleDb, id: string) => getTeam(d, { id }),
			assembleSessionKnowledge,
		});

		const team = await getTeam(db, { id: teamId });

		expect(baked.contextBundle).toMatchObject({
			kind: "task",
			task: { id: taskId, title: "Reengagement resolver test task" },
			// Root task has no parent — ancestors array is empty.
			ancestors: [],
			agent: { id: "ast-reengage-ctx-1", name: "Agent", role: "builder" },
			team: { id: teamId, name: team?.name },
			knowledge: expect.arrayContaining([expect.objectContaining({ id: "item-reengage-ctx-l4" })]),
		});
	});
});

/**
 * AU27 Increment 1 (Decision 0/1) — `reengagement` bakes `callingThreadId`
 * via `deps.resolveOrCreateCallingThread`, the injected resolve-or-create
 * (Mechanism C — `@hyperidle/review` cannot import `@hyperidle/conversation`
 * directly). `seedGrantedProposedCall` already inserts a
 * `hostKind:"task"`/`hostId:taskId` thread for the review flow — this proves
 * the resolver RESOLVES that same thread by `(hostKind, hostId)` lookup
 * rather than creating a duplicate (Decision 0's whole point: threads resolve
 * by lookup, not by a dedicated column per feature).
 */
describe("resolveReengagementRequest — callingThreadId baking (Increment 1)", () => {
	async function resolveOrCreateCallingThreadForTest(
		db: HyperIdleDb,
		taskId: string,
		agentId: string,
	): Promise<string> {
		const { findThread: find, insertThread } = await import("@hyperidle/conversation");
		const existing = await find(db, { host: { kind: "task", id: taskId } });
		if (existing) return existing.id;
		const threadId = crypto.randomUUID();
		const now = new Date().toISOString();
		await insertThread(db, {
			id: threadId,
			hostKind: "task",
			hostId: taskId,
			initiatorId: agentId,
			participants: JSON.stringify([agentId]),
			lastActiveAt: now,
			createdAt: now,
		});
		return threadId;
	}

	test("bakes callingThreadId, resolving the task's existing hostKind:task thread (no duplicate)", async ({
		db,
	}) => {
		const { resolveReengagementRequest } = await import("../proposed-call-workflow.js");
		await seedAgent(db, { id: "ast-reengage-thread-1" });
		const { taskId } = await seedTask(db, {
			id: "task-reengage-thread-1",
			ownerAgentId: "ast-reengage-thread-1",
		});
		await seedGrantedProposedCall(db, {
			id: "pc-reengage-thread-1",
			taskId,
			agentScope: "ast-reengage-thread-1",
			stagedByAgentId: "ast-reengage-thread-1",
		});

		const baked = await resolveReengagementRequest(db, "pc-reengage-thread-1", {
			requireRunnableAgent,
			getTaskById,
			resolveOrCreateCallingThread: resolveOrCreateCallingThreadForTest,
		});

		expect(baked.callingThreadId).toBeDefined();
		const thread = await findThread(db, { host: { kind: "task", id: taskId } });
		expect(thread?.id).toBe(baked.callingThreadId);
	});

	test("bakes no callingThreadId when the dep is not supplied", async ({ db }) => {
		const { resolveReengagementRequest } = await import("../proposed-call-workflow.js");
		await seedAgent(db, { id: "ast-reengage-thread-2" });
		const { taskId } = await seedTask(db, {
			id: "task-reengage-thread-2",
			ownerAgentId: "ast-reengage-thread-2",
		});
		await seedGrantedProposedCall(db, {
			id: "pc-reengage-thread-2",
			taskId,
			agentScope: "ast-reengage-thread-2",
			stagedByAgentId: "ast-reengage-thread-2",
		});

		const baked = await resolveReengagementRequest(db, "pc-reengage-thread-2", {
			requireRunnableAgent,
			getTaskById,
		});

		expect(baked.callingThreadId).toBeUndefined();
	});
});
