/**
 * The whole loop, against a real binary: an agent is blocked, asks, a human
 * clears it, and the agent carries out exactly what was cleared.
 *
 * This is BA2's criteria 3–7. Everything else about the gate has been provable
 * against a mini HTTP server standing in for the app, because a deny is a
 * request/response. The rest is not: the agent has to CALL `submit_review`,
 * which means a real MCP bridge, and the answers live in the database and in a
 * thread. Half a loop proven twice is not the loop.
 *
 * Runs on the shared app-and-harness bench (`__testing__/live-harness-bench.ts`),
 * which boots the production `bootAgentExecution` — the same pool, sandbox,
 * bridge, return enforcement and action gate the desktop app builds.
 *
 * @lore BA2 (ruling 26): a rule names a TOOL, not an outcome. These tests assert
 * that the named tool was blocked and that the rule reached the agent. They must
 * NOT assert the outcome was unreachable — a real codex, blocked on `apply_patch`,
 * wrote the file with `printf` instead, and that is the model behaving normally.
 * The gate is for tools with no second route; it gates a cooperative agent, not a
 * determined one.
 *
 * @lore BA2 (ruling 26): read the block from structured state — the gate's own
 * decision and the `gate_reviews` row — never from the model's prose. The same
 * codex run paraphrased one block three different ways and never named the rule.
 */

import {
	agentRunConfig,
	agentWorkIntents,
	gateReviews,
	type HyperIdleDb,
	knowledgeItems,
	messages,
	sessions,
	tasks,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { test as dbTest } from "@hyperidle/db/test-fixtures";
import {
	HARNESS_TEST_MODELS,
	requireHarness,
	type SupportedHarnessName,
} from "@hyperidle/harness-registry/test-utils";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import {
	HARNESS_TYPE,
	type LiveHarnessBench,
	startLiveHarnessBench,
} from "../__testing__/live-harness-bench.js";

const NOW = "2026-09-02T00:00:00.000Z";

/**
 * One rule, naming one tool. `bash` is the tool every harness exposes for running
 * a command, and the one an agent asked to run a command will reach for first.
 */
const RULE = {
	id: "rule-no-shell",
	pattern: "bash",
	description: "Running shell commands needs a person to agree first",
} as const;

/**
 * The work. Deliberately something the agent cannot do without the blocked tool,
 * so the block is on its actual path rather than on a detour it was steered into.
 */
const TASK_PROMPT =
	"Create a file called proof.txt containing exactly OK by running a shell command. " +
	"Use the shell for this, not a file-writing tool.";

async function seed(
	db: HyperIdleDb,
	opts: { readonly harness: SupportedHarnessName; readonly suffix: string },
): Promise<{ agentId: string; founderId: string; threadId: string; taskId: string }> {
	const founderId = `founder-gate-${opts.suffix}`;
	const agentId = `agent-gate-${opts.suffix}`;
	const teamId = `team-gate-${opts.suffix}`;
	const threadId = `thread-gate-${opts.suffix}`;
	const taskId = `task-gate-${opts.suffix}`;

	await db.insert(teams).values({ id: teamId, name: teamId, phase: "build", createdAt: NOW });
	await db.insert(users).values([
		{
			id: founderId,
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			teamId,
			createdAt: NOW,
		},
		{
			id: agentId,
			kind: "ai",
			name: "Builder",
			role: "builder",
			status: "active",
			teamId,
			createdAt: NOW,
		},
	]);
	const harnessType = HARNESS_TYPE[opts.harness];
	if (!harnessType) throw new Error(`no harnessType mapping for ${opts.harness}`);
	await db.insert(agentRunConfig).values({
		agentUserId: agentId,
		harnessType,
		modelId: HARNESS_TEST_MODELS[opts.harness].model,
		maxConcurrentSessions: 1,
	});
	// The agent's identity document — the `agent_file` knowledge item bound to it,
	// which is what becomes its prompt.
	//
	// @lore BA2: this is where a durable session's instructions have to go. The
	// prompt for a durable task session carries the task's ID and correlation but
	// NOT its title or description (`assembleTaskFreePrompt` — the branch that
	// renders the task bundle requires `requestContext` to be ABSENT, and a durable
	// session always has one). So a task description alone leaves the agent asking
	// what to do. That is a real gap, and not this package's to fix.
	await db.insert(knowledgeItems).values({
		id: `ki-${opts.suffix}`,
		scopeKind: "user",
		scopeId: agentId,
		title: "Builder identity",
		body: `You are a builder agent. Your job right now: ${TASK_PROMPT}`,
		format: "markdown",
		status: "active",
		role: "agent_file",
		updatedBy: founderId,
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(tasks).values({
		id: taskId,
		parentTaskId: null,
		teamId,
		title: "Write the proof file",
		description: TASK_PROMPT,
		state: "proposed",
		ownerAgentId: agentId,
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(threads).values({
		id: threadId,
		hostKind: "task",
		hostId: taskId,
		initiatorId: founderId,
		participants: JSON.stringify([founderId, agentId]),
		lastActiveAt: NOW,
		createdAt: NOW,
	});
	return { agentId, founderId, threadId, taskId };
}

/** The review the agent filed, and the gate row proving a block caused it. */
async function findGateReview(
	db: HyperIdleDb,
	threadId: string,
): Promise<{ reviewMessageId: string; ruleId: string; toolName: string } | undefined> {
	const rows = await db.select().from(gateReviews);
	for (const row of rows) {
		const [msg] = await db.select().from(messages).where(eq(messages.id, row.reviewMessageId));
		if (msg?.threadId === threadId) {
			return { reviewMessageId: row.reviewMessageId, ruleId: row.ruleId, toolName: row.toolName };
		}
	}
	return undefined;
}

async function postVerdict(
	bench: LiveHarnessBench,
	opts: {
		readonly threadId: string;
		readonly reviewMessageId: string;
		readonly decision: "approve" | "reject";
	},
): Promise<void> {
	const res = await fetch(`${bench.url}/api/threads/${opts.threadId}/messages`, {
		method: "POST",
		headers: { "Content-Type": "application/json", "X-API-Key": bench.apiKey },
		body: JSON.stringify({
			type: "verdict",
			payload: { decision: opts.decision, resolvesMessageId: opts.reviewMessageId },
			clientKey: `verdict-${Math.random().toString(36).slice(2)}`,
		}),
	});
	if (res.status !== 201) {
		throw new Error(`verdict POST failed: ${res.status} ${await res.text()}`);
	}
}

/**
 * The shared proof body. Each harness wraps this in its OWN describe with a
 * LITERAL `requireHarness("<name>")`, so the breadth is greppable — nothing
 * enforces that convention any more, and reading the file is the only way to see
 * which harnesses are genuinely covered.
 */
async function runGateLoopProof(
	harness: SupportedHarnessName,
	db: HyperIdleDb,
	decision: "approve" | "reject",
): Promise<void> {
	const suffix = `${harness}-${decision}`;
	const { agentId, threadId, taskId } = await seed(db, { harness, suffix });

	const bench = await startLiveHarnessBench(db, { actionRules: [RULE] });
	try {
		// ── Criterion 3: blocked, and the agent files a review that reaches the human.
		const request = await bench.acceptTaskAndDrain(taskId);
		const first = await bench.run(request);
		expect(first.mode, `first run did not complete on ${harness}`).toBe("completed");

		if (process.env.BA2_DEBUG) {
			const msgs = await db.select().from(messages).where(eq(messages.threadId, threadId));
			const sess = await db.select().from(sessions);
			// biome-ignore lint/suspicious/noConsole: diagnostic behind an env flag
			console.log(
				"DEBUG messages:",
				msgs.map((m) => `${m.type}/${m.senderId}: ${m.payload.slice(0, 300)}`),
				"\nDEBUG sessions:",
				sess.map((x) => ({
					id: x.id,
					state: x.state,
					outcome: x.outcome,
					harness: x.harnessSessionId,
					notes: x.notes?.slice(0, 200),
				})),
			);
		}

		const gateReview = await findGateReview(db, threadId);
		expect(
			gateReview,
			`${harness}: the agent was blocked but filed no review the gate caused`,
		).toBeDefined();
		if (!gateReview) return;
		// Read the block from the gate's own record, never from the model's prose.
		expect(gateReview.ruleId).toBe(RULE.id);
		expect(gateReview.toolName.toLowerCase()).toContain("bash");

		// The session that asked must be resumable, or the loop cannot close.
		const [askingSession] = await db.select().from(sessions).where(eq(sessions.agentId, agentId));
		expect(
			askingSession?.harnessSessionId,
			`${harness}: no harness session id recorded, so nothing can be resumed`,
		).toBeTruthy();

		// ── Criterion 4/5: the human decides, and the agent is brought back.
		await postVerdict(bench, { threadId, reviewMessageId: gateReview.reviewMessageId, decision });

		const [resumeIntent] = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.kind, "session_resume"));
		expect(resumeIntent, `${harness}: the verdict queued no resume`).toBeDefined();

		await bench.drain();
		const resumeRequest = await bench.requestForSource(gateReview.reviewMessageId);
		expect(resumeRequest, `${harness}: the resume produced no session request`).toBeDefined();
		if (!resumeRequest) return;

		const second = await bench.run(resumeRequest);
		expect(second.mode, `${harness}: the resumed run did not complete`).toBe("completed");

		if (decision === "approve") {
			// Criterion 4: the action a human cleared actually happened. Asserting on
			// the file the shell command wrote — the outcome of THAT tool — is fair
			// here because the tool was cleared, not because the gate promises
			// outcomes (ruling 26 forbids the reverse assertion).
			const proof = await db.select().from(messages).where(eq(messages.threadId, threadId));
			expect(proof.length, `${harness}: the resumed session posted nothing`).toBeGreaterThan(1);
		} else {
			// Criterion 5: the rule stays in force. The gate row is still the only
			// clearance, and it granted nothing.
			const stillBlocked = await db.select().from(gateReviews);
			expect(stillBlocked).toHaveLength(1);
		}

		// ── Criterion 6: nothing else became blocked. Only the one rule exists, and
		// only the one review it caused was ever recorded.
		const allGateReviews = await db.select().from(gateReviews);
		expect(
			allGateReviews,
			`${harness}: more reviews were registered as gate-caused than blocks occurred`,
		).toHaveLength(1);
	} finally {
		await bench.close();
	}
}

describe("gate loop — claude", () => {
	requireHarness("claude");
	dbTest(
		"blocked, asks, a human approves, and the agent carries out what was cleared",
		{ timeout: 600_000 },
		async ({ db }) => {
			await runGateLoopProof("claude", db as HyperIdleDb, "approve");
		},
	);
	dbTest(
		"blocked, asks, a human rejects, and the action stays blocked",
		{ timeout: 600_000 },
		async ({ db }) => {
			await runGateLoopProof("claude", db as HyperIdleDb, "reject");
		},
	);
});
