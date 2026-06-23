import { type HyperIdleDb, operationOutcomes, stagedOperations } from "@hyperidle/db";
import type { EventBus, StagedOperationSpec } from "@hyperidle/shared";
import { and, eq, isNull } from "drizzle-orm";

/**
 * AL7 — Staged Operation Dispatcher
 *
 * Executes staged operations after an approve verdict. Enforces at-most-once
 * execution via a conditional status=pending → executing claim.
 *
 * @lore AL7: The at-most-once claim is `WHERE id=? AND status='pending'` CAS.
 * If the UPDATE returns 0 rows, the op was already claimed (duplicate delivery,
 * re-open false re-fire) — we skip silently. This is independent of the
 * idempotencyKey UNIQUE constraint (which is an anti-fork guard, not the
 * execution gate).
 *
 * @lore AL7: Dispatch is keyed on reviewMessageId (C1 fix). Thread-keyed dispatch
 * would fire ALL ops for ALL reviews on that thread — catastrophic for multi-review
 * threads. One review message → one dispatch call → only that message's ops fire.
 *
 * @lore AL7: executeCapability is injected so the fixture tool can be used in
 * tests without a live GitHub credential. In production, the map resolves
 * "fixture:staged-op" (fixture/demo), "github:merge-pr" (real forge path), and
 * surfaces unknown tools as failed Outcomes — never silently swallowed.
 *
 * @lore AL7 W4: operation_executed streamId = subjectThreadId (the bet host thread).
 * The UI subscribes per thread to refresh the Outcome band. The architecture
 * plan §4 says "streamId: subjectThreadId" — aligning here so the follow-on
 * live-refresh wiring subscribes to the correct stream. Live refresh is deferred
 * to AL8 connector work; this aligns the contract so it does not need a rewrite.
 */

export interface StagedOperationDispatchDeps {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	readonly executeCapability: (op: StagedOperationSpec) => Promise<{ payload: unknown }>;
}

/**
 * Resolve all pending staged operations for a given review message.
 * Called after an approve verdict on that message.
 *
 * At-most-once: conditionally claims status=pending → executing.
 * If the claim fails (0 rows updated), the op was already processed — skip.
 * Awaited inline so callers observe the execution result before returning.
 *
 * @lore AL7 C1: keyed on reviewMessageId, NOT subjectThreadId.
 */
export async function resolveStagedOperations(
	deps: StagedOperationDispatchDeps,
	reviewMessageId: string,
): Promise<void> {
	// Find all pending ops for this review message.
	const pending = await deps.db
		.select()
		.from(stagedOperations)
		.where(
			and(
				eq(stagedOperations.reviewMessageId, reviewMessageId),
				eq(stagedOperations.status, "pending"),
			),
		);

	for (const op of pending) {
		await executeOne(deps, op.id);
	}
}

/**
 * On boot, convert any crash-stranded "executing" ops (no outcome row) to
 * "failed" with an "interrupted" error message.
 *
 * Does NOT re-execute — cannot know if the side-effect already landed.
 *
 * @lore AL7 C2: "executing" with no outcome = process died mid-execute.
 * Re-execution risks double-side-effect. Surface as failed so humans can inspect.
 */
export async function sweepStrandedOperations(deps: StagedOperationDispatchDeps): Promise<void> {
	// Find executing ops with no outcome row (LEFT JOIN IS NULL pattern).
	// Include subjectThreadId so operation_executed can carry the correct streamId.
	const stranded = await deps.db
		.select({
			id: stagedOperations.id,
			reviewMessageId: stagedOperations.reviewMessageId,
			subjectThreadId: stagedOperations.subjectThreadId,
		})
		.from(stagedOperations)
		.leftJoin(operationOutcomes, eq(operationOutcomes.stagedOperationId, stagedOperations.id))
		.where(
			and(eq(stagedOperations.status, "executing"), isNull(operationOutcomes.stagedOperationId)),
		);

	const now = new Date().toISOString();

	for (const row of stranded) {
		await deps.db
			.update(stagedOperations)
			.set({ status: "failed" })
			.where(eq(stagedOperations.id, row.id));

		await deps.db.insert(operationOutcomes).values({
			stagedOperationId: row.id,
			status: "failed",
			payload: null,
			error: "Operation interrupted: process crashed during execution. Manual inspection required.",
			executedAt: now,
		});

		// streamId = subjectThreadId (W4 fix): the UI subscribes per bet host thread,
		// not per op. See @lore AL7 W4 at the top of this file.
		deps.eventBus.emit({
			type: "operation_executed",
			streamId: row.subjectThreadId,
			stagedOperationId: row.id,
			reviewMessageId: row.reviewMessageId,
			status: "failed",
			timestamp: Date.now(),
		});
	}
}

/**
 * Internal: attempt to claim and execute a single staged operation.
 * At-most-once via conditional UPDATE.
 *
 * NIT-1: renamed from ExecuteOne (PascalCase) to executeOne (camelCase — project convention).
 * NIT-3: dropped the defensive `if (!row)` re-select guard. The claim returns the row via
 * `.returning({ ... })` so a separate select is unnecessary. The old guard was unreachable
 * AND would strand a claimed op with no Outcome if it ever fired — strictly worse.
 */
async function executeOne(deps: StagedOperationDispatchDeps, opId: string): Promise<void> {
	// CAS claim: pending → executing. Returns all columns of the claimed row.
	// If claimed.length === 0, the op was already claimed (concurrent/re-delivered) — skip.
	const claimed = await deps.db
		.update(stagedOperations)
		.set({ status: "executing" })
		.where(and(eq(stagedOperations.id, opId), eq(stagedOperations.status, "pending")))
		.returning();

	if (claimed.length === 0) {
		// Already claimed by another delivery or concurrently — skip.
		return;
	}

	// Use the returned row directly — no extra select needed (NIT-3).
	const row = claimed[0];
	if (!row) return; // TypeScript narrowing only; claimed.length === 1 here.

	const now = new Date().toISOString();
	let outcomeStatus: "ok" | "failed";
	let outcomePayload: unknown = null;
	let outcomeError: string | null = null;

	try {
		const spec: StagedOperationSpec = {
			id: row.id,
			capabilityTool: row.capabilityTool,
			operation: row.operation,
			params: JSON.parse(row.params) as Record<string, unknown>,
			idempotencyKey: row.idempotencyKey,
			reversibility: row.reversibility,
		};

		const result = await deps.executeCapability(spec);
		outcomeStatus = "ok";
		outcomePayload = result.payload;
	} catch (err) {
		outcomeStatus = "failed";
		outcomeError = err instanceof Error ? err.message : String(err);
	}

	// Write outcome (immutable terminal record — PK = opId enforces 0..1).
	await deps.db.insert(operationOutcomes).values({
		stagedOperationId: opId,
		status: outcomeStatus,
		payload: outcomePayload !== null ? JSON.stringify(outcomePayload) : null,
		error: outcomeError,
		executedAt: now,
	});

	// Transition staged op to terminal status.
	await deps.db
		.update(stagedOperations)
		.set({ status: outcomeStatus === "ok" ? "executed" : "failed" })
		.where(eq(stagedOperations.id, opId));

	// Emit event after state is persisted.
	// streamId = subjectThreadId (W4 fix): the UI subscribes per bet host thread.
	deps.eventBus.emit({
		type: "operation_executed",
		streamId: row.subjectThreadId,
		stagedOperationId: opId,
		reviewMessageId: row.reviewMessageId,
		status: outcomeStatus,
		timestamp: Date.now(),
	});
}

/**
 * Call the GitHub REST API to merge a pull request.
 *
 * Params (agent-authored, fully bound at stage time):
 *   owner: string      — GitHub org/user, e.g. "hyperidle"
 *   repo: string       — repository name, e.g. "hyperidle"
 *   prNumber: number   — PR number, e.g. 42
 *   mergeMethod?: "merge"|"squash"|"rebase"  — defaults to "squash"
 *   commitTitle?: string
 *   commitMessage?: string
 *
 * Returns: { sha: string; merged: boolean; message: string }
 *
 * @lore AL7 CRITICAL-1: GitHub merge-pr is the real archetype-A tool path.
 * Reads GITHUB_TOKEN from env. If the token is absent, throws immediately so
 * the Outcome captures a clear "no token" failure — never a silent skip.
 * Live proof requires GITHUB_TOKEN in the environment. Without it the handler
 * is contract-proven (unit-tested via vi.fn() stub on fetch) but not live-run.
 * This is recorded in the progress file + AC mapping.
 *
 * Source: https://docs.github.com/en/rest/pulls/pulls?apiVersion=2022-11-28#merge-a-pull-request
 */
async function githubMergePr(op: StagedOperationSpec): Promise<{ payload: unknown }> {
	const token = process.env.GITHUB_TOKEN;
	if (!token) {
		throw new Error(
			"github:merge-pr requires GITHUB_TOKEN in the environment. " +
				"Set GITHUB_TOKEN to a fine-grained PAT with 'pull_requests: write' scope.",
		);
	}

	const { owner, repo, prNumber, mergeMethod, commitTitle, commitMessage } = op.params as {
		owner: string;
		repo: string;
		prNumber: number;
		mergeMethod?: "merge" | "squash" | "rebase";
		commitTitle?: string;
		commitMessage?: string;
	};

	if (!(owner && repo) || typeof prNumber !== "number") {
		throw new Error(
			`github:merge-pr: invalid params. Required: owner (string), repo (string), prNumber (number). ` +
				`Got: owner=${String(owner)}, repo=${String(repo)}, prNumber=${String(prNumber)}`,
		);
	}

	const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}/merge`;

	const body: Record<string, unknown> = {
		merge_method: mergeMethod ?? "squash",
	};
	if (commitTitle) body.commit_title = commitTitle;
	if (commitMessage) body.commit_message = commitMessage;
	// Forward idempotency key as a stable commit identifier so GitHub-side
	// deduplication can correlate (W1: forwards idempotencyKey to external tool).
	body.sha = op.idempotencyKey;

	const response = await fetch(url, {
		method: "PUT",
		headers: {
			Accept: "application/vnd.github+json",
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
			"X-GitHub-Api-Version": "2022-11-28",
			"User-Agent": "HyperIdle-AL7-StagedOpDispatcher",
		},
		body: JSON.stringify(body),
	});

	const data = (await response.json()) as Record<string, unknown>;

	if (!response.ok) {
		// Surface the GitHub error verbatim — never swallow. Rule #8.
		const msg = typeof data.message === "string" ? data.message : JSON.stringify(data);
		throw new Error(`GitHub merge-pr failed (HTTP ${response.status}): ${msg}`);
	}

	return {
		payload: {
			sha: data.sha,
			merged: data.merged,
			message: data.message,
		},
	};
}

/**
 * The set of (capabilityTool, operation) pairs that the kernel knows how to
 * dispatch. Used at STAGE TIME to enforce the kernel-held-verb half of the
 * capability split: an agent cannot stage an op for an arbitrary/forged string
 * the kernel has no executor for.
 *
 * @lore AL7 — what this IS and what it is NOT:
 * This is a kernel-dispatchable-verb guard, NOT a per-agent provisioning check.
 * It enforces: "the staged capability must be a verb the kernel can dispatch."
 * It does NOT enforce: "this specific agent was provisioned this capability."
 * Per-agent capability provisioning (AL8 tool grant / trust tier) and the
 * harness capability descriptor (AM2 StagedOperation OPEN vocab shape) are
 * downstream surfaces that do not exist yet. buildToolRegistry gates by ROLE,
 * not by per-agent external-capability grants. When AL8/AM2 land, this
 * allowlist can be retired in favour of the descriptor lookup.
 *
 * Format: `"${capabilityTool}/${operation}"` — e.g. "github/merge_pr".
 */
export const KERNEL_DISPATCHABLE_CAPABILITIES: ReadonlySet<string> = new Set([
	"fixture:staged-op/echo", // deterministic in-process capability for tests + demos
	"github/merge_pr", // real archetype-A forge path — requires GITHUB_TOKEN
]);

/**
 * Check whether a (capabilityTool, operation) pair is a kernel-dispatchable
 * verb. Returns false for any unrecognized pair.
 *
 * This enforces the kernel-held-verb gate: an agent cannot stage an operation
 * the kernel has no executor for. It does NOT check per-agent provisioning —
 * that is deferred to AL8 (tool grant) + AM2 (harness capability descriptor).
 */
export function isKernelDispatchableCapability(capabilityTool: string, operation: string): boolean {
	return KERNEL_DISPATCHABLE_CAPABILITIES.has(`${capabilityTool}/${operation}`);
}

/**
 * The built-in capability executor map.
 *
 * @lore AL7 CRITICAL-1: Two registered paths:
 * 1. "fixture:staged-op" — deterministic in-process capability for tests + demos.
 *    Echoes params as ok payload; throws when params.simulateFailure === true.
 * 2. "github:merge-pr" — the real archetype-A forge path. Calls the GitHub REST
 *    API to merge a pull request (requires GITHUB_TOKEN env var). HyperIdle
 *    triggers; GitHub executes. Proves the loop end-to-end against a real forge.
 *    LIVE PROOF STATUS: Not run in this env (no GITHUB_TOKEN). Contract-proven
 *    via unit test with fetch stub. See plans/AL7/code-review.md CRITICAL-1 note.
 * Unknown tools always fail with a clear error — never silently swallowed.
 */
export function buildExecuteCapability(): (
	op: StagedOperationSpec,
) => Promise<{ payload: unknown }> {
	return async (op: StagedOperationSpec): Promise<{ payload: unknown }> => {
		if (op.capabilityTool === "fixture:staged-op") {
			if (op.params.simulateFailure === true) {
				throw new Error(`fixture:staged-op simulateFailure triggered for op ${op.id}`);
			}
			return { payload: { echoed: op.params } };
		}

		if (op.capabilityTool === "github" && op.operation === "merge_pr") {
			return githubMergePr(op);
		}

		// All other tools: unknown capability → fail loudly. "approve did nothing" is forbidden.
		throw new Error(
			`Unknown capability tool: ${op.capabilityTool}/${op.operation}. No executor registered. Manual inspection required.`,
		);
	};
}
