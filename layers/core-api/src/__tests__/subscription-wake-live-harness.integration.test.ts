/**
 * @lore The live-harness proof for a subscription wake: a real `task.changed`
 * change wakes a subscribed agent for real, and the woken agent reads the
 * subscription's own instruction (its `prompt` document, embedded directly
 * into the session's assembled AGENTS.md/CLAUDE.md — `buildSubscriptionSection`,
 * `run-orchestration/src/context.ts`) and edits the document that instruction
 * names — nothing but the model actually reading its instruction and calling
 * `edit_document` produces the effect this test checks for. A subscription
 * session's own forced return action is `return_status` (the self-check
 * bridge tool, `provisioner.ts`'s `requiresReturnStatusReturn`), never
 * `send_message` — this test also proves no message row was written for the
 * agent, the exact desktop-walk defect (T15's send_message-forcing fix made
 * every subscription wake end with an unwanted direct message even when the
 * instruction never asked for one). A second case wakes a subscription with
 * no instruction at all — what every subscription on a fresh install holds —
 * and proves the session is shown what happened, is told nobody wrote an
 * instruction yet, and still ends returned.
 *
 * Per harness (claude / codex / opencode / cursor-agent), `requireHarness(...)`,
 * zero stubs, hard-fail if absent — never `skipIf` to green (CLAUDE.md,
 * testing.md).
 *
 * @lore This file builds its composition through
 * `../__testing__/live-harness-test-support.js`'s shared `setUpLiveHarnessRun`,
 * for the same reasons `thread-turn-live-harness` already documents:
 * `layers/core-api` may not import `@hyperidle/agent-execution` (that boot
 * is an Application's job), and `bootCoreApi`'s own composed `actionTools`
 * are "read exactly once". `registerSubscriptionFire` (`@hyperidle/user`,
 * the same module `app.ts` registers in production) is wired by hand on the
 * SAME `eventBus` the action calls below share, so firing `edit_task`'s real
 * `task.changed` event actually reaches the fire mechanism — nothing about
 * the wake path here is a stand-in.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
	agentRunConfig,
	agentSessionRequests,
	agentWorkIntents,
	documents,
	type HyperIdleDb,
	messages,
	tasks,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { test as dbTest } from "@hyperidle/db/test-fixtures";
import type {
	DocumentRow,
	EditTaskInput,
	EditUserInput,
	SearchDocumentsInput,
	TaskView,
	UserView,
} from "@hyperidle/domain-model";
import { canReadThread, type HostKind } from "@hyperidle/domain-model";
import { createSandboxAdapter } from "@hyperidle/harness-registry";
import {
	HARNESS_TEST_MODELS,
	requireHarness,
	type SupportedHarnessName,
	stopAllLiveHarnessSessions,
} from "@hyperidle/harness-registry/test-utils";
import { findSessionById } from "@hyperidle/run-orchestration";
import { drainIntents } from "@hyperidle/session-requests";
import type { SubscriptionFireDeps } from "@hyperidle/user";
import { registerSubscriptionFire } from "@hyperidle/user";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect } from "vitest";
import { queueDeps } from "../__testing__/durable-agent-queue-test-deps.js";
import {
	assertRunOutcomeCompleted,
	buildLiveHarnessAdapterPool,
	HARNESS_TYPE,
	runnerFor,
	setUpLiveHarnessRun,
} from "../__testing__/live-harness-test-support.js";
import type { Action } from "../actions/action.js";

const NOW = "2026-09-23T00:00:00.000Z";

// @lore stop-all afterEach: see thread-turn-live-harness.integration.test.ts's identical
// afterEach for the full rationale — a vitest timeout skips this file's own
// try/finally cleanup, and dispose() alone does not stop a running session.
// The deliberate no-instruction ("proceed") cases below keep sending the
// product's real default seed on purpose — they test what the product
// really sends, so this change adds cleanup only and leaves their prompt alone.
afterEach(() => {
	stopAllLiveHarnessSessions();
});
const WAKE_TOKEN = "SUBSCRIPTION_WAKE_OK";

async function seedFounderTeamAgentAndDocument(
	db: HyperIdleDb,
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
		teamId: opts.teamId,
		createdAt: NOW,
	});
	await db.insert(users).values({
		id: opts.agentId,
		kind: "ai",
		name: "Live Harness Subscriber",
		role: "builder",
		status: "active",
		agentCategory: "team",
		teamId: opts.teamId,
		createdAt: NOW,
	});
	// @lore AU26 G1: the run-config selector (`harnessType`) lives in
	// `agent_run_config`, an agent-orchestration-owned table the drain reads
	// live — not on the `users` identity row.
	await db.insert(agentRunConfig).values({
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
function buildFireDeps(
	db: HyperIdleDb,
	actions: readonly Action[],
	agentWorkIntentRecorder: SubscriptionFireDeps["agentWorkIntentRecorder"],
): SubscriptionFireDeps {
	const searchDocuments = runnerFor<SearchDocumentsInput, DocumentRow[]>(
		actions,
		"search_documents",
	);
	return {
		agentWorkIntentRecorder,
		searchTasks: async (_ctx, input) => {
			const rows = await db
				.select({ id: tasks.id, teamId: tasks.teamId, ownerAgentId: tasks.ownerAgentId })
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
			return { ok: true, data: readable.map((r) => ({ id: r.id })) };
		},
		searchDocuments,
		// Present (even trivial) so `resolveSubscriptionWakeRequest` bakes a
		// `kind:"subscription"` contextBundle at all — that bundle is what
		// carries the subscription's `prompt` text into the session's
		// assembled AGENTS.md/CLAUDE.md (`buildSubscriptionSection`). An
		// absent `assembleSessionDocuments` leaves the session with no
		// instruction whatsoever (the bundle-less path), which is not what
		// production wires.
		assembleSessionDocuments: async () => [],
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
	 * proof is that the session is shown what happened with no instruction
	 * block, decides for itself, and still ends returned rather than stalling or
	 * crashing.
	 */
	async function runSubscriptionWakeProof(
		harness: SupportedHarnessName,
		db: HyperIdleDb,
		variant: WakeVariant = "instructed",
	): Promise<void> {
		const suffix = `${harness}${VARIANT_ID_SUFFIX[variant]}`;
		const founderId = `founder-sub-wake-${suffix}`;
		const agentId = `agent-sub-wake-${suffix}`;
		const teamId = `team-sub-wake-${suffix}`;
		const taskId = `task-sub-wake-${suffix}`;
		const threadId = `thread-sub-wake-${suffix}`;
		const documentId = `doc-sub-wake-${suffix}`;
		const harnessType = HARNESS_TYPE[harness];

		await seedFounderTeamAgentAndDocument(db, {
			founderId,
			agentId,
			teamId,
			taskId,
			threadId,
			documentId,
			harnessType,
			modelId: HARNESS_TEST_MODELS[harness].model,
		});

		const run = await setUpLiveHarnessRun(db, `subscription-wake-${harness}`);
		const disposeFire = registerSubscriptionFire(
			db,
			run.eventBus,
			buildFireDeps(db, run.actions, run.agentWorkIntentRecorder),
		);

		try {
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
			const subId = subscribeResult.data.subscriptions[0]?.id;
			if (!subId) throw new Error("no subscription id returned");

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

			let changeId = "";
			const deadline = Date.now() + 5000;
			for (;;) {
				const [intent] = await db
					.select()
					.from(agentWorkIntents)
					.where(
						and(
							eq(agentWorkIntents.sourceKind, "subscription"),
							eq(agentWorkIntents.kind, "subscription_run"),
						),
					);
				if (intent?.sourceId.startsWith(`${subId}:`)) {
					changeId = intent.sourceId.slice(`${subId}:`.length);
					break;
				}
				if (Date.now() > deadline) {
					throw new Error(
						`no subscription_run intent recorded for subscription ${subId} within the timeout`,
					);
				}
				await new Promise((r) => setTimeout(r, 50));
			}

			await drainIntents({ ...queueDeps(db), eventBus: run.eventBus });

			const [request] = await db
				.select()
				.from(agentSessionRequests)
				.where(eq(agentSessionRequests.sourceId, `${subId}:${changeId}`));
			if (!request) {
				throw new Error(
					`drainIntents did not produce an agent_session_requests row for ${subId}:${changeId}`,
				);
			}

			const adapterPool = await buildLiveHarnessAdapterPool(run);
			// The prompt the harness actually reads is the sandbox's own AGENTS.md,
			// written before the harness starts and deleted with the sandbox when
			// the session ends — so it is read the moment the harness has started.
			const workspace = createSandboxAdapter("local");
			const spawnSandbox = workspace.spawn.bind(workspace);
			let sandboxPath = "";
			workspace.spawn = async (baseDir) => {
				const handle = await spawnSandbox(baseDir);
				sandboxPath = handle.path;
				return handle;
			};
			let assembledPrompt = "";
			const readAssembledPrompt = () => {
				assembledPrompt = fs.readFileSync(path.join(sandboxPath, "AGENTS.md"), "utf8");
			};

			const result = await run.composition.runSession(
				{
					db,
					eventBus: run.eventBus,
					adapterPool,
					workspace,
					onHarnessStarted: readAssembledPrompt,
				},
				{ mode: "durable", request, sandboxBasePath: run.sandboxBasePath, completion: "await" },
			);

			expect(result.mode).toBe("completed");
			if (result.mode !== "completed") return;
			await assertRunOutcomeCompleted(db, request, result, harness);

			await expectVariantOutcome(variant, { db, harness, agentId, documentId, assembledPrompt });

			const sessionRow = await findSessionById(db, result.sessionId);
			expect(
				sessionRow?.state,
				`session row for ${harness} (session ${result.sessionId}) was not marked done`,
			).toBe("done");
			expect(
				sessionRow?.outcome,
				`session row for ${harness} (session ${result.sessionId}) was not marked completed`,
			).toBe("completed");
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
			readonly assembledPrompt: string;
		},
	): Promise<void> {
		if (variant === "empty") {
			expectNoInstructionShown(seen.assembledPrompt);
			return;
		}
		await expectInstructionFollowed(seen.db, seen.harness, seen.agentId, seen.documentId);
	}

	function expectNoInstructionShown(assembledPrompt: string): void {
		expect(assembledPrompt).toContain("### What happened");
		expect(assembledPrompt).not.toContain("### Instruction");
		expect(assembledPrompt).toContain("Nobody has written an instruction for this event yet");
		expect(assembledPrompt).not.toContain("Speak only if");
	}

	async function expectInstructionFollowed(
		db: HyperIdleDb,
		harness: SupportedHarnessName,
		agentId: string,
		documentId: string,
	): Promise<void> {
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
		dbTest(
			"a subscription wake on claude-code ends with the named document edited",
			async ({ db }) => runSubscriptionWakeProof("claude", db),
			180_000,
		);
	});

	describe("[harness:codex]", () => {
		requireHarness("codex");
		dbTest(
			"a subscription wake on codex ends with the named document edited",
			async ({ db }) => runSubscriptionWakeProof("codex", db),
			180_000,
		);
	});

	describe("[harness:opencode]", () => {
		requireHarness("opencode");
		dbTest(
			"a subscription wake on opencode ends with the named document edited",
			async ({ db }) => runSubscriptionWakeProof("opencode", db),
			180_000,
		);
	});

	describe("[harness:cursor-agent]", () => {
		requireHarness("cursor-agent");
		dbTest(
			"a subscription wake on cursor-agent ends with the named document edited",
			async ({ db }) => runSubscriptionWakeProof("cursor-agent", db),
			180_000,
		);
	});

	describe("[harness:claude] no instruction", () => {
		requireHarness("claude");
		dbTest(
			"a subscription wake with no instruction on claude-code decides for itself and ends returned",
			async ({ db }) => runSubscriptionWakeProof("claude", db, "empty"),
			180_000,
		);
	});

	describe("[harness:codex] no instruction", () => {
		requireHarness("codex");
		dbTest(
			"a subscription wake with no instruction on codex decides for itself and ends returned",
			async ({ db }) => runSubscriptionWakeProof("codex", db, "empty"),
			180_000,
		);
	});

	describe("[harness:opencode] no instruction", () => {
		requireHarness("opencode");
		dbTest(
			"a subscription wake with no instruction on opencode decides for itself and ends returned",
			async ({ db }) => runSubscriptionWakeProof("opencode", db, "empty"),
			180_000,
		);
	});

	describe("[harness:cursor-agent] no instruction", () => {
		requireHarness("cursor-agent");
		dbTest(
			"a subscription wake with no instruction on cursor-agent decides for itself and ends returned",
			async ({ db }) => runSubscriptionWakeProof("cursor-agent", db, "empty"),
			180_000,
		);
	});
});
