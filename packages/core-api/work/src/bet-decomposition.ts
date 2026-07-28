/**
 * AK3: Bet decomposition service.
 *
 * On commit (bet_state_changed toState=active), decomposes the bet's goal
 * into an accepted task breakdown owned by eligible team agents. Produces
 * tasks that the existing task-dispatcher → session-provisioning path picks
 * up automatically (no second provisioning route).
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
import { type HyperIdleDb, taskDispatchAttempts } from "@hyperidle/db";
import {
	DECOMPOSITION_TURN_TIMEOUT_MS,
	type DecompositionBlockerReason,
	type DecompositionTaskInput,
	type EventBus,
	findRoleCatalogEntry,
} from "@hyperidle/shared";
import type {
	AgentSelectionDefaults,
	AgentWorkIntentRecorder,
	CostCapChecker,
	TeamCapacityReader,
	UserStoreReader,
	WorkDecompositionPlan,
	WorkUserRow,
} from "./ports.js";
import * as work from "./work-service.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface BetDecompositionDeps {
	readonly [legacyInput: string]: unknown;
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	/**
	 * Injected `agent-selection` Service port (Mechanism C — §10.3 against-grain).
	 * Selection results gate decomposition immediately, so this remains a
	 * request/response port rather than a fire-and-forget event.
	 */
	readonly agentSelection: AgentSelectionDefaults;
	/**
	 * Injected `users` Service port (Mechanism C — ordinary downward edge, no
	 * Inc-3 event-bus rewrite needed, only a DI-target swap once `users` migrates).
	 */
	readonly users: UserStoreReader;
	/**
	 * Injected `org` Service port (Mechanism C — ordinary downward edge, `org`
	 * is a real migrated package as of Increment 1c; no Inc-3 event-bus rewrite
	 * needed — this closes W2's `teamMembers` ownership gap).
	 */
	readonly teamCapacity: TeamCapacityReader;
	/**
	 * Injected `cost` Service port (Mechanism C — §10.3 against-grain).
	 * RULED PERMANENT at Increment 3g: `checkCostCap` is a synchronous
	 * pre-flight read whose return value gates this function's control flow
	 * (see the "Cost pre-flight" step below) — an EventBus emit cannot serve
	 * a synchronous request/response need. See `ports.ts`'s top `@lore`.
	 */
	readonly costCap: CostCapChecker;
	/**
	 * Injected `session-requests` Service port (Mechanism C — §10.3 against-grain).
	 * RULED PERMANENT (closing ruling, 2026-07-16): `record(tx, ...)` is called
	 * inside the same `db.transaction` as `claimBetDecomposition` — the
	 * literal same-transaction-write shape, the strongest case of the three
	 * `work` §10.3 ports. See `ports.ts`'s top `@lore`.
	 */
	readonly workIntents: AgentWorkIntentRecorder;
	/**
	 * AU1: Kept as an opaque composition-root dependency for the registered runtime
	 * consumer. Decomposition itself must not select adapters or start harnesses.
	 */
	readonly adapterPool?: unknown;
	readonly assistantTurn?: unknown;
	/**
	 * AU6: agent execution is owned exclusively by the intent worker.
	 *
	 * @lore AU11 AC-2: a required `sandbox: SandboxAdapter` field (renamed from
	 * `workspace` per AK1) used to sit here — declared but never read anywhere
	 * in this file (only `sandboxBasePath`, a plain string, was used). Dead
	 * threading left over from a pre-AU6 design where decomposition itself
	 * touched the sandbox directly; AU6 moved execution exclusively behind the
	 * intent worker. Removed per the AU11 route/service-cleanup classification.
	 */
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
 *
 * @lore AU19 Increment 1c: `teamCapacity` is an injected `org` Service port
 * (Mechanism C) — this used to import the `teamMembers` table directly (an
 * interim `table-ownership-guard.ts` exemption while `org` hadn't migrated
 * yet). `teamCapacity.getByTeamId` returns the single membership-group row
 * (1:1 invariant, enforced app-wide by `org`'s `loadTeamMembers`), replacing
 * the prior multi-row `memberGroups` query.
 */
async function findEligibleTeamAgents(
	db: HyperIdleDb,
	betTeamId: string,
	teamCapacity: TeamCapacityReader,
	users: UserStoreReader,
): Promise<readonly WorkUserRow[]> {
	// 1. Resolve the membership group for this team (1:1 invariant in practice).
	const memberGroup = await teamCapacity.getByTeamId(db, betTeamId);
	if (!memberGroup) return [];

	// 2. Fetch active AI users in that membership group.
	const candidates = await users.listActiveAiUsersByTeams(db, [memberGroup.id]);

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
 * Owner assignment uses agent-selection's coherent `selectAgent` operation.
 *
 * betId is bound from the bet argument, NEVER from task input (cross-bet injection
 * prevention — mirrors create-task R5 D1).
 *
 * @param _eligible — retained for callers; authoritative selection is delegated.
 *
 * @lore AK3: v1 calls this directly from runBetDecomposition. A future
 * `propose_bet_tasks` harness tool would call this as its handler body unchanged
 * (keeping the insert logic in one place).
 *
 * @lore AK7: `_eligible` remains only for caller compatibility. Agent-selection
 * owns candidate enumeration, role matching, validation, and round-robin spread.
 */
async function insertProposedBetTasks(
	deps: {
		db: HyperIdleDb;
		eventBus: EventBus;
		agentSelection: AgentSelectionDefaults;
		workIntents: AgentWorkIntentRecorder;
	},
	bet: { id: string; teamId: string },
	_eligible: readonly WorkUserRow[],
	taskInputs: DecompositionTaskInput[],
): Promise<{ created: number }> {
	const { db, eventBus, agentSelection, workIntents } = deps;
	let created = 0;

	for (let i = 0; i < taskInputs.length; i++) {
		const input = taskInputs[i];
		if (!input) continue;

		// Resolve owner through the selection helper. It enumerates eligible team
		// candidates (orderBy users.id), emits work_selection_requested, and validates the result.
		// spreadIndex:i preserves the AK3 round-robin spread on the mismatch branch
		// (concept §6.3 — without it all null-role tasks collapse to candidates[0]).
		const { agentId: ownerAgentId } = await agentSelection.selectAgent(
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

		try {
			await db.transaction(async (tx) => {
				await work.create(tx, "task", {
					id: taskId,
					betId: bet.id,
					teamId: bet.teamId,
					ownerAgentId,
					title: input.title.slice(0, 512),
					description: input.description ? input.description.slice(0, 65536) : null,
					doneCondition: input.doneCondition ? input.doneCondition.slice(0, 512) : null,
					state: "accepted",
					createdAt: now,
					updatedAt: now,
				});
				if (!ownerAgentId) return;
				const attemptId = crypto.randomUUID();
				await tx.insert(taskDispatchAttempts).values({
					id: attemptId,
					taskId,
					occasion: "accepted",
					agentId: ownerAgentId,
					ordinal: 1,
					status: "requested",
					createdAt: now,
					updatedAt: now,
				});
				await workIntents.record(tx, {
					kind: "task_run",
					sourceKind: "task_dispatch_attempt",
					sourceId: attemptId,
					requestedBy: ownerAgentId,
					idempotencyKey: `task-dispatch:${attemptId}`,
				});
			});
		} catch (error) {
			const cause = error instanceof Error ? error.cause : undefined;
			throw cause instanceof Error ? cause : error;
		}
		eventBus.emit({
			type: "task_state_changed",
			streamId: taskId,
			taskId,
			fromState: "proposed",
			toState: "accepted",
			timestamp: Date.now(),
		});
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
	return (
		await work.transition(db, "bet", {
			guard: { field: "decompositionStatus", equals: "running" },
			patch: { decompositionStatus: "blocked", decompositionBlockerReason: "failed" },
		})
	).affected;
}

// -----------------------------------------------------------------------------
// runBetDecomposition
// -----------------------------------------------------------------------------

/**
 * Write a terminal decompositionStatus to the bet. Used in all early-exit paths.
 *
 * @lore AU21 Increment 3 Wave 0 (§10 subscriber table): exported so the
 * `bet_decomposition` reaction to a terminal `agent_run_admission_failed`
 * (`agent-run-admission-reactions.ts`) reuses this SAME helper — one more
 * caller of the pattern already used by every other early-exit path in this
 * file, not a new mechanism.
 */
export async function markTerminal(
	db: HyperIdleDb,
	betId: string,
	status: "done" | "blocked",
	reason: DecompositionBlockerReason | null,
): Promise<void> {
	await work.update(db, "bet", betId, {
		decompositionStatus: status,
		decompositionBlockerReason: reason,
	});
}

async function persistDecompositionTasks(
	deps: BetDecompositionDeps,
	bet: { id: string; teamId: string },
	eligible: readonly WorkUserRow[],
	taskList: DecompositionTaskInput[],
): Promise<boolean> {
	try {
		await insertProposedBetTasks(
			{
				db: deps.db,
				eventBus: deps.eventBus,
				agentSelection: deps.agentSelection,
				workIntents: deps.workIntents,
			},
			bet,
			eligible,
			taskList,
		);
		return true;
	} catch {
		await markTerminal(deps.db, bet.id, "blocked", "failed");
		return false;
	}
}

/**
 * Run the full bet decomposition pipeline for a single bet.
 *
 * Delegates decomposer selection to agent-selection, then applies turn-source
 * precedence to produce the final task list.
 *
 * Steps:
 *   0. CAS NULL→'running' (idempotency gate).
 *   1. Load bet.
 *   2. findEligibleTeamAgents → none → blocked/no_eligible_agent.
 *   3. Emit work_decompose_requested (AC1 observable occasion). Post-CAS,
 *      post-eligible-check — only the CAS winner emits.
 *   4. selectAgent(bet_decomposer), with errors mapped to blocked/failed.
 *   5. no selected agent → blocked/no_eligible_agent.
 *   7. Create trigger-backed AgentSessionRequest.
 *   8. Cost pre-flight: checkCostCap on requested agent.
 *   9. Runtime request or scratch sandbox + 3-way turn-source precedence:
 *      a. plan.tasks.length > 0 → persist those tasks (resolver-authored breakdown).
 *      b. deps.runDecompositionTurn present → call it with requested agent
 *         (protected-test seam).
 *      c. else → consume the AgentSessionRequest; task writeback decides terminal state.
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
 * DecompositionPlan in services/contracts.ts (AU11: agent-owned, formerly
 * app-runtime/contracts.ts).
 *
 * @lore AU20: agent-selection owns decomposer eligibility and active-AI
 * validation; work consumes only its nullable selected id.
 */
async function runBetDecomposition(deps: BetDecompositionDeps, betId: string): Promise<void> {
	const { db, eventBus, sandboxBasePath } = deps;
	const timeoutMs = deps.turnTimeoutMs ?? DECOMPOSITION_TURN_TIMEOUT_MS;

	// Resolve the authoritative target before claiming. The later transaction couples
	// the NULL→running CAS with its durable intent, so no crash can strand a running bet.
	const bet = await work.get(db, "bet", betId);
	if (!bet || bet.decompositionStatus !== null) return;

	// --- 1. Find eligible team agents ---
	const eligible = await findEligibleTeamAgents(db, bet.teamId, deps.teamCapacity, deps.users);
	if (eligible.length === 0) {
		await markTerminal(db, betId, "blocked", "no_eligible_agent");
		return;
	}

	// --- 3. Resolve the decomposition plan from app-owned defaults ---
	let plan: WorkDecompositionPlan;
	try {
		const { agentId } = await deps.agentSelection.selectAgent(
			{ db, eventBus },
			{
				surface: "bet_decomposer",
				teamId: bet.teamId,
				workKey: betId,
				roleHint: "product_manager",
				spreadIndex: 0,
			},
		);
		plan = { decomposerAgentId: agentId, tasks: [] };
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

	// Load the full decomposer user row (needed for harnessType/modelProvider/role in real turn).
	const pm = await deps.users.getUserById(db, plan.decomposerAgentId);
	if (!pm) {
		await markTerminal(db, betId, "blocked", "no_eligible_agent");
		return;
	}

	let intent: Awaited<ReturnType<AgentWorkIntentRecorder["record"]>> | undefined;
	await db.transaction(async (tx) => {
		const { applied } = await work.transition(tx, "bet", {
			id: betId,
			guard: { field: "decompositionStatus", isNull: true },
			patch: { decompositionStatus: "running" },
		});
		if (!applied) return;
		intent = await deps.workIntents.record(tx, {
			kind: "bet_decomposition",
			sourceKind: "bet",
			sourceId: betId,
			requestedBy: pm.id,
			idempotencyKey: `decomposition:${betId}:start`,
		});
	});
	if (!intent) return;
	eventBus.emit({
		type: "work_decompose_requested",
		streamId: bet.teamId,
		teamId: bet.teamId,
		betId,
		at: new Date().toISOString(),
	});
	eventBus.emit({
		type: "agent_work_intent_recorded",
		streamId: `bet:${betId}:decomposition`,
		intentId: intent.id,
		intentKind: "bet_decomposition",
		sourceKind: "decomposition",
		sourceId: betId,
		idempotencyKey: intent.idempotencyKey,
		timestamp: Date.now(),
	});

	// --- 6. Cost pre-flight ---
	// @lore AK3: checkCostCap is called before the turn to prevent runaway cost.
	// Cost is enforced before entering the agent runtime.
	const capResult = await deps.costCap.checkCostCap(db, eventBus, {
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
		// Branch 1: Resolver-authored breakdown, after trigger request/history exists.
		// Branch 2: Test-injectable override (protected-test seam — all AK3 tests).
		// Branch 3: Runtime request path was handled above.
		//
		// @lore AU4: decomposition always creates a trigger-backed AgentSessionRequest
		// before any decomposition work. Resolver-authored task lists no longer bypass
		// the agent-layer request boundary.
		if (plan.tasks.length > 0) {
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
		if (!(await persistDecompositionTasks(deps, bet, eligible, taskList))) return;
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

/** Register the sole public decomposition entry on bet activation events. */
export function registerBetDecomposition(deps: BetDecompositionDeps): () => void {
	return deps.eventBus.on("bet_state_changed", (event) => {
		if (event.toState !== "active") return;
		void runBetDecomposition(deps, event.betId);
	});
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
