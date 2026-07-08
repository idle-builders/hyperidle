/**
 * AK3: Bet decomposition service.
 *
 * On commit (bet_state_changed toState=active), decomposes the bet's goal
 * into an accepted task breakdown owned by eligible team agents. Produces
 * tasks that the existing task-dispatcher → provision-registry → session-provisioning
 * path picks up automatically (no second provisioning route).
 *
 * Architecture decisions (see plans/AK3/architecture.md):
 * - CRITICAL-1: PM context enters through the agent session request path.
 * - CRITICAL-2: v1 inserts tasks server-side (no session-less tool call);
 *   runDecompositionTurn override is test-injectable (AH3 idiom).
 * - CRITICAL-3: resolveOrphanedDecompositions boot-time sweep closes crash-orphan hole.
 *
 * @lore AK3: runBetDecomposition NEVER throws. It always writes a terminal
 * decompositionStatus ('done' | 'blocked') to the bets row before returning.
 * The subscriber calls it fire-and-forget; a throw would be silently swallowed.
 *
 * @lore AK3: The CAS guard (NULL → 'running') lives in the SUBSCRIBER, not here.
 * runBetDecomposition is called after the CAS succeeds. If the status is already
 * non-NULL at the point we'd need to update it we short-circuit early (idempotency).
 */

import fs from "node:fs";
import path from "node:path";
import { bets, type HyperIdleDb, tasks, teamMembers, type User, users } from "@hyperidle/db";
import {
	DECOMPOSITION_TURN_TIMEOUT_MS,
	type DecompositionBlockerReason,
	type DecompositionTaskInput,
	type EventBus,
	findRoleCatalogEntry,
} from "@hyperidle/shared";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { checkCostCap } from "../app-runtime/services/cost-cap.js";
import { getAgentSessionRequestConsumerFn } from "../app-runtime/services/provision-registry.js";
import type { SandboxAdapter } from "../harness/sandbox-adapter.js";
import { resolveDecompositionPlan } from "./agent-defaults/resolvers.js";
import { createAgentSessionRequest } from "./agent-session-requests.js";
import { enumerateTeamCandidates, selectOwner } from "./select-agent.js";
import { transitionTask } from "./task-state-machine.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface BetDecompositionDeps {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	/**
	 * AU1: Kept as an opaque composition-root dependency for the registered runtime
	 * consumer. Decomposition itself must not select adapters or start harnesses.
	 */
	readonly adapterPool?: unknown;
	/** Renamed from `workspace` per locked harness vocab (AK1). */
	readonly sandbox: SandboxAdapter;
	readonly sandboxBasePath: string;
	readonly resolveModel?: (
		tier: string,
	) => Promise<import("@hyperidle/shared").ResolvedModel | undefined>;
	/**
	 * AC6: fast-timeout injection. Mirrors AssistantTurnDeps.turnTimeoutMs.
	 * Defaults to DECOMPOSITION_TURN_TIMEOUT_MS (120_000 ms).
	 */
	readonly turnTimeoutMs?: number;
	/**
	 * Test-injectable: called INSTEAD of the real LLM turn.
	 * Returns a fixed task list without making an LLM call.
	 * Mirrors the `runTurn` seam in AssistantTurnDeps (AH3).
	 *
	 * @lore AK3/AU1: The runtime PM request path is bypassed when this override
	 * is present. Tests use it to assert the full commit→tasks→accepted→dispatch
	 * seam without LLM credentials. Runtime-boundary tests cover request/writeback.
	 */
	readonly runDecompositionTurn?: (ctx: {
		betId: string;
		pmAgentId: string;
	}) => Promise<DecompositionTaskInput[]>;
	/**
	 * Optional hook called after the scratch sandbox directory is created and before
	 * the real PM turn starts. Use this to provision harness-specific files into the
	 * scratch sandbox (e.g. .mcp.json for claude, .codex-home/ for codex).
	 *
	 * @lore AR5: CLI harnesses (claude/codex/opencode) require per-sandbox config files
	 * in their cwd. The decomposition scratch sandbox (decomp-<betId>/) is created by
	 * runBetDecomposition itself — callers cannot provision it ahead of time because the
	 * betId is unknown. This hook fires after mkdirSync so the caller can write the files.
	 */
	readonly prepSandbox?: (sandboxPath: string) => Promise<void>;
}

// -----------------------------------------------------------------------------
// findEligibleTeamAgents
// -----------------------------------------------------------------------------

/**
 * Return active AI agents in the bet's team membership group whose role
 * maps to category 'team' in the role catalog (includes builder, product_manager,
 * growth, brand_voice etc.; excludes strategy facilitators and individual assistants).
 *
 * @lore AK3: users.teamId references teamMembers.id (membership group), NOT teams.id
 * (domain entity). The join goes: teams.id → teamMembers.teamId → teamMembers.id → users.teamId.
 * This mirrors the handoff-protocol.ts eligibility join (L184-202).
 */
export async function findEligibleTeamAgents(db: HyperIdleDb, betTeamId: string): Promise<User[]> {
	// 1. Resolve membership group IDs for this team (1:1 invariant in practice).
	const memberGroups = await db
		.select({ id: teamMembers.id })
		.from(teamMembers)
		.where(eq(teamMembers.teamId, betTeamId));
	if (memberGroups.length === 0) return [];

	const memberGroupIds = memberGroups.map((m) => m.id);

	// 2. Fetch active AI users in those membership groups.
	const candidates = await db
		.select()
		.from(users)
		.where(
			and(eq(users.kind, "ai"), eq(users.status, "active"), inArray(users.teamId, memberGroupIds)),
		);

	// 3. Filter to category='team' via the role catalog.
	//    Unknown roles (not in catalog) are excluded — conservative default.
	return candidates.filter((u) => {
		const entry = findRoleCatalogEntry(u.role);
		return entry?.category === "team";
	});
}

// -----------------------------------------------------------------------------
// insertProposedBetTasks
// -----------------------------------------------------------------------------

/**
 * Insert each input task as a proposed bet task, assign an eligible owner,
 * and transition each to 'accepted' so task_state_changed(accepted) fires
 * and the existing task-dispatcher picks it up.
 *
 * Owner assignment is routed through selectOwner. selectOwner enumerates eligible
 * candidates, emits work_selection_requested, resolves an owner, and validates it.
 *
 * betId is bound from the bet argument, NEVER from task input (cross-bet injection
 * prevention — mirrors create-task R5 D1).
 *
 * @param _eligible — passed by callers for backward compat (AK3 tests); ignored in
 * AK7 because selectOwner enumerates candidates directly (concept §4, Option A).
 *
 * @lore AK3: v1 calls this directly from runBetDecomposition. A future
 * `propose_bet_tasks` harness tool would call this as its handler body unchanged
 * (keeping the insert logic in one place).
 *
 * @lore AK7: _eligible is kept as a param so existing callers compile unchanged.
 * selectOwner (not _eligible) is the authoritative candidate source. The AK3
 * round-robin spread is preserved: selectOwner passes spreadIndex:i and the
 * resolver reproduces `candidates[i % len]`. The role short-circuit is preserved.
 */
export async function insertProposedBetTasks(
	deps: { db: HyperIdleDb; eventBus: EventBus },
	bet: { id: string; teamId: string },
	_eligible: User[],
	taskInputs: DecompositionTaskInput[],
): Promise<{ created: number }> {
	const { db, eventBus } = deps;
	let created = 0;

	for (let i = 0; i < taskInputs.length; i++) {
		const input = taskInputs[i];
		if (!input) continue;

		// Resolve owner through the selection helper. It enumerates eligible team
		// candidates (orderBy users.id), emits work_selection_requested, and validates the result.
		// spreadIndex:i preserves the AK3 round-robin spread on the mismatch branch
		// (concept §6.3 — without it all null-role tasks collapse to candidates[0]).
		const ownerAgentId = await selectOwner(
			{ db, eventBus },
			{
				surface: "bet_task",
				teamId: bet.teamId,
				workKey: bet.id,
				roleHint: (input.ownerRole as import("@hyperidle/shared").UserRole) ?? null,
				spreadIndex: i,
			},
		);

		const taskId = crypto.randomUUID();
		const now = new Date().toISOString();

		// Insert as 'proposed' first (required: transitionTask starts from 'proposed').
		await db.insert(tasks).values({
			id: taskId,
			betId: bet.id,
			teamId: bet.teamId,
			ownerAgentId,
			title: input.title.slice(0, 512),
			description: input.description ? input.description.slice(0, 65536) : null,
			doneCondition: input.doneCondition ? input.doneCondition.slice(0, 512) : null,
			state: "proposed",
			createdAt: now,
			updatedAt: now,
		});

		// Transition proposed → accepted (emits task_state_changed(accepted) → dispatcher).
		await transitionTask(db, eventBus, taskId, "accepted");
		created++;
	}

	return { created };
}

// -----------------------------------------------------------------------------
// resolveOrphanedDecompositions
// -----------------------------------------------------------------------------

/**
 * Boot-time crash-recovery sweep (CRITICAL-3).
 *
 * Any bet with decompositionStatus='running' at startup is an orphan — the
 * in-process turn died with the previous process. Flip to blocked/failed so
 * the UI never shows a perpetual "Planning the work" state.
 *
 * @lore AK3: 'running' at boot always means an orphaned turn. Decomposition
 * turns run in-process (same idiom as AH3's in-flight set) and are never
 * resumed across a restart. Resolving to blocked/failed is correct and
 * conservative — 'failed' reason surfaces "Couldn't plan the work" in the UI
 * with an implicit "try committing again" CTA.
 */
export async function resolveOrphanedDecompositions(db: HyperIdleDb): Promise<number> {
	const result = await db
		.update(bets)
		.set({
			decompositionStatus: "blocked",
			decompositionBlockerReason: "failed",
		})
		.where(eq(bets.decompositionStatus, "running"))
		.returning({ id: bets.id });

	return result.length;
}

// -----------------------------------------------------------------------------
// runBetDecomposition
// -----------------------------------------------------------------------------

/**
 * Write a terminal decompositionStatus to the bet. Used in all early-exit paths.
 */
async function markTerminal(
	db: HyperIdleDb,
	betId: string,
	status: "done" | "blocked",
	reason: DecompositionBlockerReason | null,
): Promise<void> {
	await db
		.update(bets)
		.set({
			decompositionStatus: status,
			decompositionBlockerReason: reason,
		})
		.where(eq(bets.id, betId));
}

/**
 * Run the full bet decomposition pipeline for a single bet.
 *
 * AK8 rewire: delegates "who decomposes + what the breakdown is" to the
 * app-owned decomposition resolver, then applies 3-way turn-source
 * precedence to produce the final task list.
 *
 * Steps:
 *   0. CAS NULL→'running' (idempotency gate).
 *   1. Load bet.
 *   2. findEligibleTeamAgents → none → blocked/no_eligible_agent.
 *   3. Emit work_decompose_requested (AC1 observable occasion). Post-CAS,
 *      post-eligible-check — only the CAS winner emits.
 *   4. enumerateTeamCandidates -> resolveDecompositionPlan(...).
 *      Wrapped in try/catch: throw → blocked/failed (no false promise).
 *   5. plan.decomposerAgentId null → blocked/no_eligible_agent.
 *   6. Inline-validate decomposerAgentId: candidates.some(c => c.agentId ===
 *      plan.decomposerAgentId) — proves team-membership + active-AI in one check
 *      (WARNING 1: selectOwner's internal guard no longer runs on this path).
 *   7. Cost pre-flight: checkCostCap on validated decomposer.
 *   8. Runtime request or scratch sandbox + 3-way turn-source precedence:
 *      a. plan.tasks.length > 0 → persist those tasks (resolver-authored breakdown).
 *      b. deps.runDecompositionTurn present → call it with plan.decomposerAgentId
 *         (protected-test seam — branch 2, all v1 Strategies + all AK3 tests land here).
 *      c. else → create/consume an AgentSessionRequest; task writeback decides terminal state.
 *   9. taskList empty → blocked/empty. Else insertProposedBetTasks → dispatch.
 *  10. markTerminal('done'). finally: rm scratch sandbox.
 *
 * NEVER throws. Always writes a terminal decompositionStatus before returning.
 *
 * @lore AK8: Turn-source precedence: plan.tasks → override → real turn.
 * The override NEVER beats plan.tasks — that would let a test seam mask a
 * resolver decision (the inverse of what the seam is for). Current defaults
 * return tasks:[] → branch 2 (tests) or branch 3 (production).
 *
 * @lore AK8: []-from-resolver (plan.tasks) means "enter runtime"
 * (turn-source branch 2 or 3). []-from-turn (taskList after branch 3) means
 * blocked/empty. Same [] value, opposite meaning depending on origin. See
 * DecompositionPlan in strategy-port.ts.
 *
 * @lore AK8: The inline decomposerAgentId validation (step 6) replaces the
 * selectOwner(bet_decomposer) call removed from the AK7 path. selectOwner's
 * internal guard (active AI + kind=ai + status=active) no longer runs here;
 * candidates.some() is the net-new inline equivalent. An invalid resolver
 * returning an off-team/inactive id → blocked/no_eligible_agent.
 */
export async function runBetDecomposition(
	deps: BetDecompositionDeps,
	betId: string,
): Promise<void> {
	const { db, eventBus, sandboxBasePath } = deps;
	const timeoutMs = deps.turnTimeoutMs ?? DECOMPOSITION_TURN_TIMEOUT_MS;

	// --- 0. CAS guard: atomically claim this decomposition ---
	// Attempt to set decompositionStatus NULL → 'running'.
	// If the CAS affects 0 rows, someone else already claimed it (or it has a
	// terminal status) — skip. This is the idempotency gate for AC7.
	//
	// @lore AK3: The CAS lives here (not in the subscriber) so that calling
	// runBetDecomposition directly (e.g. tests, retry paths) carries the same
	// idempotency guarantee as going through the subscriber.
	const casClaimed = await db
		.update(bets)
		.set({ decompositionStatus: "running" })
		.where(and(eq(bets.id, betId), isNull(bets.decompositionStatus)))
		.returning({ id: bets.id });

	if (casClaimed.length === 0) {
		// CAS lost: status was already non-null (another call won, or terminal).
		return;
	}

	// CAS won — load the bet to get teamId and description.
	const [bet] = await db.select().from(bets).where(eq(bets.id, betId)).limit(1);
	if (!bet) {
		// Bet deleted between CAS and now — nothing to do.
		return;
	}

	// --- 1. Find eligible team agents ---
	const eligible = await findEligibleTeamAgents(db, bet.teamId);
	if (eligible.length === 0) {
		await markTerminal(db, betId, "blocked", "no_eligible_agent");
		return;
	}

	// --- 2. Emit work_decompose_requested (AC1 observable occasion) ---
	// Post-CAS, post-eligible-check: only the CAS winner emits.
	// Audit-only (no subscriber mutates state off this event). Sibling of
	// work_selection_requested — same emit-then-call ordering (§3b precedent).
	eventBus.emit({
		type: "work_decompose_requested",
		streamId: bet.teamId,
		teamId: bet.teamId,
		betId,
		at: new Date().toISOString(),
	});

	// --- 3. Resolve the decomposition plan from app-owned defaults ---
	const candidates = await enumerateTeamCandidates(db, bet.teamId);
	let plan: import("@hyperidle/shared").DecompositionPlan;
	try {
		plan = await resolveDecompositionPlan({
			db,
			teamId: bet.teamId,
			betId,
			betDescription: bet.description,
			betDoneCondition: bet.doneCondition ?? null,
			candidates,
		});
	} catch {
		// Resolver threw — blocked/failed (no false promise).
		await markTerminal(db, betId, "blocked", "failed");
		return;
	}

	// --- 4. null decomposerAgentId → no eligible decomposer ---
	if (plan.decomposerAgentId === null) {
		await markTerminal(db, betId, "blocked", "no_eligible_agent");
		return;
	}

	// --- 5. Inline-validate decomposerAgentId (WARNING 1) ---
	// candidates.some() proves: team-membership + active-AI + active-status (all in one
	// check because enumerateTeamCandidates already filters kind=ai + status=active +
	// category=team). selectOwner(bet_decomposer)'s internal guard is NO LONGER called;
	// this is its net-new inline replacement.
	//
	// @lore AK8: candidates.some(c => c.agentId === plan.decomposerAgentId) is the
	// cheapest correct form of the unattachable-session guard. An invalid resolver
	// returning an off-team/inactive/non-existent id hits this guard → blocked/no_eligible_agent.
	const decomposerIsValid = candidates.some((c) => c.agentId === plan.decomposerAgentId);
	if (!decomposerIsValid) {
		await markTerminal(db, betId, "blocked", "no_eligible_agent");
		return;
	}

	// Load the full decomposer user row (needed for harnessType/modelProvider/role in real turn).
	const [pm] = await db.select().from(users).where(eq(users.id, plan.decomposerAgentId)).limit(1);
	if (!pm) {
		await markTerminal(db, betId, "blocked", "no_eligible_agent");
		return;
	}

	// --- 6. Cost pre-flight ---
	// @lore AK3: checkCostCap is called before the turn to prevent runaway cost.
	// Cost is enforced before entering the agent runtime.
	const capResult = await checkCostCap(db, eventBus, {
		agentId: pm.id,
		teamId: bet.teamId,
	});
	if (!capResult.allowed) {
		await markTerminal(db, betId, "blocked", "failed");
		return;
	}

	// AU1: the real PM turn is requested through the agent runtime boundary.
	// A completed runtime is useful only if it writes at least one bet task.
	if (plan.tasks.length === 0 && !deps.runDecompositionTurn) {
		const request = await createAgentSessionRequest(db, {
			sourceKind: "decomposition",
			sourceId: betId,
			streamId: `bet:${betId}:decomposition`,
			agentId: pm.id,
			teamId: bet.teamId,
			promptMode: "decomposition",
			idempotencyKey: `decomposition:${betId}:start`,
			payloadJson: JSON.stringify({
				betId,
				betDescription: bet.description,
				betDoneCondition: bet.doneCondition ?? null,
			}),
			sourceCorrelation: {
				betId,
				teamId: bet.teamId,
				decomposerAgentId: pm.id,
			},
		});
		const consumeAgentSessionRequest = getAgentSessionRequestConsumerFn();
		if (!(consumeAgentSessionRequest && deps.adapterPool)) {
			await markTerminal(db, betId, "blocked", "failed");
			return;
		}
		const taskRowsBeforeRuntime = await db
			.select({ id: tasks.id })
			.from(tasks)
			.where(eq(tasks.betId, betId));
		try {
			const resolvedModel = deps.resolveModel ? await deps.resolveModel("workhorse") : undefined;
			const result = await consumeAgentSessionRequest(
				{
					db,
					eventBus,
					adapterPool: deps.adapterPool,
					workspace: deps.sandbox,
				},
				request,
				{
					sandboxBasePath,
					...(resolvedModel ? { resolvedModel } : {}),
				},
			);
			if (result.outcome !== "completed") {
				await markTerminal(db, betId, "blocked", "failed");
				return;
			}
			const taskRowsAfterRuntime = await db
				.select({ id: tasks.id })
				.from(tasks)
				.where(eq(tasks.betId, betId));
			if (taskRowsAfterRuntime.length > taskRowsBeforeRuntime.length) {
				await markTerminal(db, betId, "done", null);
			} else {
				await markTerminal(db, betId, "blocked", "empty");
			}
		} catch {
			await markTerminal(db, betId, "blocked", "failed");
		}
		return;
	}

	// --- 7. Scratch sandbox + 3-way turn-source precedence ---
	const scratchSandboxPath = path.join(sandboxBasePath, `decomp-${betId}`);
	try {
		fs.mkdirSync(scratchSandboxPath, { recursive: true });
	} catch {
		// mkdir failed — cannot provide a sandbox path; mark blocked.
		await markTerminal(db, betId, "blocked", "failed");
		return;
	}

	// Provision harness-specific files into the scratch sandbox (e.g. .mcp.json for
	// claude). Called AFTER mkdirSync so the hook can write files into the sandbox.
	// @lore AR5: CLI harnesses need per-sandbox config in their cwd (the scratch dir).
	// decompositionDepsForLane provides this hook for each CLI harness.
	if (deps.prepSandbox) {
		try {
			await deps.prepSandbox(scratchSandboxPath);
		} catch {
			await markTerminal(db, betId, "blocked", "failed");
			return;
		}
	}

	try {
		let taskList: DecompositionTaskInput[];

		// --- 8. Turn-source precedence (CRITICAL 1) ---
		// Branch 1: resolver authored the breakdown.
		// Branch 2: Test-injectable override (protected-test seam — all AK3 tests).
		// Branch 3: Runtime request path was handled above.
		//
		// @lore AK8: Branch 1 > branch 2 > branch 3. The override NEVER beats plan.tasks
		// because that would let a test seam mask a resolver-authored decision.
		// Current defaults return tasks:[] -> branch 2 or 3.
		if (plan.tasks.length > 0) {
			// Branch 1: resolver-authored breakdown. Skip runtime turn entirely.
			taskList = [...plan.tasks];
		} else if (deps.runDecompositionTurn) {
			// Branch 2: Test-injectable override (no real LLM call).
			// Supply the resolver-chosen decomposerAgentId as pmAgentId so tests on
			// "which agent decomposes" reflect the chosen owner.
			try {
				taskList = await withTimeout(
					deps.runDecompositionTurn({ betId, pmAgentId: pm.id }),
					timeoutMs,
				);
			} catch {
				await markTerminal(db, betId, "blocked", "failed");
				return;
			}
		} else {
			await markTerminal(db, betId, "blocked", "failed");
			return;
		}

		// --- 9. Empty task list → blocked/empty ---
		// @lore AK8: []-from-turn means blocked/empty (plan.tasks=[] already handled
		// above by falling through to branch 2 or 3). This is the turn's empty result.
		if (!Array.isArray(taskList) || taskList.length === 0) {
			await markTerminal(db, betId, "blocked", "empty");
			return;
		}

		// --- 10. Insert tasks → accepted → dispatch ---
		await insertProposedBetTasks(
			{ db, eventBus },
			{ id: bet.id, teamId: bet.teamId },
			eligible,
			taskList,
		);
		await markTerminal(db, betId, "done", null);
	} finally {
		// --- 11. rm scratch sandbox dir (best-effort) ---
		try {
			fs.rmSync(scratchSandboxPath, { recursive: true, force: true });
		} catch {
			// best-effort — a stale scratch dir is not fatal
		}
	}
}

// -----------------------------------------------------------------------------
// Timeout helper
// -----------------------------------------------------------------------------

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => {
			reject(new Error(`Operation timed out after ${ms}ms`));
		}, ms);
		promise.then(
			(v) => {
				clearTimeout(timer);
				resolve(v);
			},
			(e) => {
				clearTimeout(timer);
				reject(e);
			},
		);
	});
}
