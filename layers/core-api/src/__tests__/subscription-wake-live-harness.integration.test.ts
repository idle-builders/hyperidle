/**
 * Per harness (claude / codex / opencode / cursor-agent), `requireHarness(...)`,
 * zero stubs, hard-fail if absent — never `skipIf` to green (CLAUDE.md,
 * testing.md).
 *
 */

import {
	documents,
	type HyperIdleDb,
	messages,
	tasks,
	teams,
	threads,
	users,
	userTeams,
} from "@hyperidle/db";
import type {
	DocumentRow,
	EditTaskInput,
	EditUserInput,
	SearchDocumentsInput,
	TaskView,
	UserView,
} from "@hyperidle/domain-model";
import { canReadThread, type HostKind } from "@hyperidle/domain-model";
import {
	HARNESS_TEST_MODELS,
	requireHarness,
	type SupportedHarnessName,
	stopAllLiveHarnessSessions,
} from "@hyperidle/harness-registry/test-utils";
import { agentRunConfig, type RunnerDb } from "@hyperidle/runner-db";
import type { SubscriptionFireDeps } from "@hyperidle/user";
import { giveUserKey, registerSubscriptionFire } from "@hyperidle/user";
import { eq } from "drizzle-orm";
import {
	assertSessionRowDone,
	HARNESS_TYPE,
	runnerFor,
	setUpLiveHarnessRun,
	waitForEffect,
	waitForSessionCompleted,
} from "../__testing__/live-harness-test-support.js";
import { afterEach, describe, expect, test } from "../__testing__/test-fixtures.js";
import type { Action } from "../actions/action.js";

const NOW = "2026-09-23T00:00:00.000Z";

afterEach(() => {
	stopAllLiveHarnessSessions();
});
const WAKE_TOKEN = "SUBSCRIPTION_WAKE_OK";

async function seedFounderTeamAgentAndDocument(
	db: HyperIdleDb,
	runnerDb: RunnerDb,
	opts: {
		readonly founderId: string;
		readonly agentId: string;
		readonly teamId: string;
		readonly taskId: string;
		readonly threadId: string;
		readonly documentId: string;
		readonly harnessType: string;
		readonly modelId: string;
	},
): Promise<void> {
	await db.insert(teams).values({ id: opts.teamId, name: opts.teamId, createdAt: NOW });
	await db.insert(users).values({
		id: opts.founderId,
		kind: "human",
		name: "Live Harness Founder",
		role: "founder",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(userTeams).values({ userId: opts.founderId, teamId: opts.teamId });
	await db.insert(users).values({
		id: opts.agentId,
		kind: "ai",
		name: "Live Harness Subscriber",
		role: "builder",
		status: "active",
		agentCategory: "team",
		createdAt: NOW,
	});
	await db.insert(userTeams).values({ userId: opts.agentId, teamId: opts.teamId });
	await runnerDb.insert(agentRunConfig).values({
		agentUserId: opts.agentId,
		harnessType: opts.harnessType,
		modelId: opts.modelId,
		maxConcurrentSessions: 1,
	});
	await db.insert(threads).values({
		id: opts.threadId,
		hostKind: "team",
		hostId: opts.teamId,
		initiatorId: opts.founderId,
		participants: "[]",
		lastActiveAt: NOW,
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: opts.taskId,
		threadId: opts.threadId,
		parentTaskId: null,
		teamId: opts.teamId,
		ownerAgentId: null,
		title: opts.taskId,
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(documents).values({
		id: opts.documentId,
		scopeKind: "team",
		scopeId: opts.teamId,
		title: "Live harness wake target",
		body: "(untouched)",
		format: "markdown",
		status: "active",
		readCount: 0,
		updatedBy: opts.founderId,
		createdAt: NOW,
		updatedAt: NOW,
	});
}

/** `SubscriptionFireDeps.searchTasks`/`.searchThreads`, hand-wired the same way
 * `subscription-fire.integration.test.ts`'s own `buildDeps` does — this
 * Service may not import `@hyperidle/task`/`@hyperidle/thread` in
 * production, so a real test wires the same reach rule (`canReadThread`,
 * a raw select scoped by team) by hand instead of stubbing reach itself. */
function buildFireDeps(db: HyperIdleDb, actions: readonly Action[]): SubscriptionFireDeps {
	const searchDocuments = runnerFor<SearchDocumentsInput, DocumentRow[]>(
		actions,
		"search_documents",
	);
	return {
		searchTasks: async (_ctx, input) => {
			const rows = await db
				.select({
					id: tasks.id,
					teamId: tasks.teamId,
					ownerAgentId: tasks.ownerAgentId,
					startedBy: tasks.startedBy,
				})
				.from(tasks);
			return { ok: true, data: rows.filter((r) => input.ids.includes(r.id)) };
		},
		searchThreads: async (ctx, input) => {
			const rows = await db.select().from(threads);
			const readable = rows
				.filter((r) => input.ids.includes(r.id))
				.filter((r) =>
					canReadThread(ctx.actor, {
						hostKind: r.hostKind as HostKind,
						members: JSON.parse(r.participants) as string[],
					}),
				);
			return {
				ok: true,
				data: readable.map((r) => ({ id: r.id, members: JSON.parse(r.participants) as string[] })),
			};
		},
		searchDocuments,
	};
}

type WakeVariant = "instructed" | "empty";

const VARIANT_ID_SUFFIX: Record<WakeVariant, string> = { instructed: "", empty: "-empty" };

/** The subscription each variant writes: the instructed one names a document; the empty one holds no prompt. */
function subscriptionToAdd(
	variant: WakeVariant,
	instruction: string,
): { readonly event: "task.changed"; readonly prompt?: string } {
	return variant === "empty"
		? { event: "task.changed" }
		: { event: "task.changed", prompt: instruction };
}

describe("a real task.changed wakes a subscribed agent, who reads the change and edits the document its prompt names (real harness)", () => {
	/**
	 * `instructed`: the subscription's prompt names a document to edit, and the
	 * proof is that document edited and no message sent. `empty`: the
	 * subscription has no prompt at all — a fresh install's state — and the
	 * proof is that the session ends returned rather than stalling or crashing.
	 */
	async function runSubscriptionWakeProof(
		harness: SupportedHarnessName,
		db: HyperIdleDb,
		runnerDb: RunnerDb,
		variant: WakeVariant = "instructed",
	): Promise<void> {
		const suffix = `${harness}${VARIANT_ID_SUFFIX[variant]}`;
		const founderId = `founder-sub-wake-${suffix}`;
		const agentId = `agent-sub-wake-${suffix}`;
		const teamId = `team-sub-wake-${suffix}`;
		const taskId = `task-sub-wake-${suffix}`;
		const threadId = `thread-sub-wake-${suffix}`;
		const documentId = `doc-sub-wake-${suffix}`;
		const personKey = `person-key-sub-wake-${suffix}`;
		const harnessType = HARNESS_TYPE[harness];

		await seedFounderTeamAgentAndDocument(db, runnerDb, {
			founderId,
			agentId,
			teamId,
			taskId,
			threadId,
			documentId,
			harnessType,
			modelId: HARNESS_TEST_MODELS[harness].model,
		});
		await giveUserKey(db, founderId, personKey);

		const run = await setUpLiveHarnessRun(db, runnerDb, `subscription-wake-${suffix}`, personKey);
		const disposeFire = registerSubscriptionFire(db, run.eventBus, buildFireDeps(db, run.actions));

		try {
			await run.runner.start();

			const editUser = runnerFor<EditUserInput, UserView>(run.actions, "edit_user");
			const editTask = runnerFor<EditTaskInput, TaskView>(run.actions, "edit_task");

			const instruction =
				`Call edit_document with id: "${documentId}" and body: "${WAKE_TOKEN}" — ` +
				"call it now. Do not send any message to anyone.";
			const subscribeResult = await editUser(
				{
					actor: founderId,
					db,
					eventBus: run.eventBus,
					now: new Date().toISOString(),
					internal: true,
				},
				{
					id: agentId,
					subscriptions: {
						add: [subscriptionToAdd(variant, instruction)],
					},
				},
			);
			if (!subscribeResult.ok) {
				throw new Error(
					`edit_user (subscribe) failed: ${JSON.stringify(subscribeResult.problems)}`,
				);
			}

			// The real fire: editing the task through the real `edit_task` action
			// emits `task.changed` on the SAME event bus `registerSubscriptionFire`
			// listens on above — this is production's own wake path, not a
			// hand-rolled change row.
			const editResult = await editTask(
				{ actor: founderId, db, eventBus: run.eventBus, now: new Date().toISOString() },
				{ id: taskId, state: "blocked" },
			);
			if (!editResult.ok) {
				throw new Error(`edit_task failed: ${JSON.stringify(editResult.problems)}`);
			}

			await expectVariantOutcome(variant, { db, harness, agentId, documentId });

			// The persisted session row is the independent proof that the provisioner
			// wrote the same verdict as the in-memory effect above.
			const sessionId = await waitForSessionCompleted(runnerDb, agentId, harness, 180_000);
			await assertSessionRowDone(runnerDb, sessionId, harness);
		} finally {
			disposeFire();
			await run.teardown();
		}
	}

	async function expectVariantOutcome(
		variant: WakeVariant,
		seen: {
			readonly db: HyperIdleDb;
			readonly harness: SupportedHarnessName;
			readonly agentId: string;
			readonly documentId: string;
		},
	): Promise<void> {
		if (variant === "empty") {
			// No prompt was given — the agent decides for itself and returns. The
			// session-row check in the caller is the proof it ended without stalling.
			return;
		}
		await expectInstructionFollowed(seen.db, seen.harness, seen.agentId, seen.documentId);
	}

	async function expectInstructionFollowed(
		db: HyperIdleDb,
		harness: SupportedHarnessName,
		agentId: string,
		documentId: string,
	): Promise<void> {
		// Wait for the document to be edited — this is the agent's real effect.
		await waitForEffect(`document ${documentId} body=${WAKE_TOKEN}`, async () => {
			const [row] = await db.select().from(documents).where(eq(documents.id, documentId));
			return row?.body === WAKE_TOKEN ? row : undefined;
		});

		const [documentRow] = await db.select().from(documents).where(eq(documents.id, documentId));
		expect(
			documentRow?.body,
			`document ${documentId} was not edited by ${harness}: ${JSON.stringify(documentRow)}`,
		).toBe(WAKE_TOKEN);

		// The desktop-walk defect: a subscription session's forced return used
		// to be send_message, so every wake ended with an unwanted direct
		// message even when the instruction never asked for one. return_status
		// is the forced return now — no message row for this agent, on any
		// harness.
		const agentMessages = await db.select().from(messages).where(eq(messages.senderId, agentId));
		expect(
			agentMessages,
			`${harness} sent an unforced message: ${JSON.stringify(agentMessages)}`,
		).toHaveLength(0);
	}

	describe("[harness:claude]", () => {
		requireHarness("claude");
		test(
			"a subscription wake on claude-code ends with the named document edited",
			async ({ db, runnerDb }) => runSubscriptionWakeProof("claude", db, runnerDb),
			180_000,
		);
	});

	describe("[harness:codex]", () => {
		requireHarness("codex");
		test(
			"a subscription wake on codex ends with the named document edited",
			async ({ db, runnerDb }) => runSubscriptionWakeProof("codex", db, runnerDb),
			180_000,
		);
	});

	describe("[harness:opencode]", () => {
		requireHarness("opencode");
		test(
			"a subscription wake on opencode ends with the named document edited",
			async ({ db, runnerDb }) => runSubscriptionWakeProof("opencode", db, runnerDb),
			180_000,
		);
	});

	describe("[harness:cursor-agent]", () => {
		requireHarness("cursor-agent");
		test(
			"a subscription wake on cursor-agent ends with the named document edited",
			async ({ db, runnerDb }) => runSubscriptionWakeProof("cursor-agent", db, runnerDb),
			180_000,
		);
	});

	describe("[harness:claude] no instruction", () => {
		requireHarness("claude");
		test(
			"a subscription wake with no instruction on claude-code decides for itself and ends returned",
			async ({ db, runnerDb }) => runSubscriptionWakeProof("claude", db, runnerDb, "empty"),
			180_000,
		);
	});

	describe("[harness:codex] no instruction", () => {
		requireHarness("codex");
		test(
			"a subscription wake with no instruction on codex decides for itself and ends returned",
			async ({ db, runnerDb }) => runSubscriptionWakeProof("codex", db, runnerDb, "empty"),
			180_000,
		);
	});

	describe("[harness:opencode] no instruction", () => {
		requireHarness("opencode");
		test(
			"a subscription wake with no instruction on opencode decides for itself and ends returned",
			async ({ db, runnerDb }) => runSubscriptionWakeProof("opencode", db, runnerDb, "empty"),
			180_000,
		);
	});

	describe("[harness:cursor-agent] no instruction", () => {
		requireHarness("cursor-agent");
		test(
			"a subscription wake with no instruction on cursor-agent decides for itself and ends returned",
			async ({ db, runnerDb }) => runSubscriptionWakeProof("cursor-agent", db, runnerDb, "empty"),
			180_000,
		);
	});
});
