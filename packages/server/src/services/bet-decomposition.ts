/**
 * AK3: Bet decomposition service.
 *
 * On commit (bet_state_changed toState=active), decomposes the bet's goal
 * into an accepted task breakdown owned by eligible team agents. Produces
 * tasks that the existing task-dispatcher → provision-registry → session-provisioning
 * path picks up automatically (no second provisioning route).
 *
 * Architecture decisions (see plans/AK3/architecture.md):
 * - CRITICAL-1: PM context via Strategy port (assembleContext on a synthetic request).
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
import { checkCostCap } from "@hyperidle/fabric";
import {
	DECOMPOSITION_TURN_TIMEOUT_MS,
	type DecompositionBlockerReason,
	type DecompositionTaskInput,
	type EventBus,
	findRoleCatalogEntry,
} from "@hyperidle/shared";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { AdapterPool } from "../harness/adapter-pool.js";
import type { SandboxAdapter } from "../harness/sandbox-adapter.js";
import type { CredentialResolver } from "./credential-resolver.js";
import { getActiveStrategy } from "./strategy-registry.js";
import { transitionTask } from "./task-state-machine.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface BetDecompositionDeps {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	readonly adapterPool: AdapterPool;
	/** Renamed from `workspace` per locked harness vocab (AK1). */
	readonly sandbox: SandboxAdapter;
	readonly sandboxBasePath: string;
	readonly resolveModel?: (
		tier: string,
	) => Promise<import("@hyperidle/shared").ResolvedModel | undefined>;
	readonly credentialResolver?: CredentialResolver;
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
	 * @lore AK3: The real PM turn path (model-resolve + assembleContext + harness session)
	 * is bypassed when this override is present. Tests use it to assert the full
	 * commit→tasks→accepted→dispatch seam without LLM credentials.
	 * A future evaluate-quality evals harness exercises the real LLM path.
	 */
	readonly runDecompositionTurn?: (ctx: {
		betId: string;
		pmAgentId: string;
	}) => Promise<DecompositionTaskInput[]>;
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
 * Owner assignment (WARNING-7 round-robin fallback):
 *   1. First eligible agent whose role === task.ownerRole (exact match).
 *   2. If none, cycle through eligible list (index mod length) for spread.
 *
 * betId is bound from the bet argument, NEVER from task input (cross-bet injection
 * prevention — mirrors create-task R5 D1).
 *
 * @lore AK3: v1 calls this directly from runBetDecomposition. A future
 * `propose_bet_tasks` harness tool would call this as its handler body unchanged
 * (keeping the insert logic in one place).
 */
export async function insertProposedBetTasks(
	deps: { db: HyperIdleDb; eventBus: EventBus },
	bet: { id: string; teamId: string },
	eligible: User[],
	taskInputs: DecompositionTaskInput[],
): Promise<{ created: number }> {
	const { db, eventBus } = deps;
	let created = 0;

	for (let i = 0; i < taskInputs.length; i++) {
		const input = taskInputs[i];
		if (!input) continue;

		// Resolve owner: exact role match → round-robin fallback.
		let owner: User | undefined;
		if (input.ownerRole) {
			owner = eligible.find((u) => u.role === input.ownerRole);
		}
		if (!owner) {
			// Round-robin spread across eligible list.
			owner = eligible[i % eligible.length];
		}

		const taskId = crypto.randomUUID();
		const now = new Date().toISOString();

		// Insert as 'proposed' first (required: transitionTask starts from 'proposed').
		await db.insert(tasks).values({
			id: taskId,
			betId: bet.id,
			teamId: bet.teamId,
			ownerAgentId: owner?.id ?? null,
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
 * Steps:
 *   1. Load bet (assert it exists and status is 'running' — CAS already set it).
 *   2. findEligibleTeamAgents → none → blocked/no_eligible_agent.
 *   3. Pick PM agent (product_manager role preferred, else first eligible).
 *   4. Cost pre-flight: checkCostCap → over cap → blocked/failed.
 *   5. Scratch sandbox dir + assembleContext via Strategy port → throw → blocked/failed.
 *   6. Run PM turn (via runDecompositionTurn override or real LLM) under turnTimeoutMs.
 *      → reject/timeout → blocked/failed; empty list → blocked/empty.
 *   7. insertProposedBetTasks → task_state_changed(accepted) → dispatcher picks up.
 *   8. finally: rm scratch sandbox dir (best-effort).
 *
 * NEVER throws. Always writes a terminal decompositionStatus before returning.
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

	// --- 2. Pick the PM decomposer ---
	const pm = eligible.find((u) => u.role === "product_manager") ?? eligible[0];
	if (!pm) {
		await markTerminal(db, betId, "blocked", "no_eligible_agent");
		return;
	}

	// --- 3. Cost pre-flight ---
	// @lore AK3: checkCostCap is called before the turn to prevent runaway cost.
	// This is a pre-flight only (no per-event accrual) — acceptable v1 trade-off
	// for a single bounded completion behind a human-gated commit (one per bet).
	const capResult = await checkCostCap(db, eventBus, {
		agentId: pm.id,
		teamId: bet.teamId,
	});
	if (!capResult.allowed) {
		await markTerminal(db, betId, "blocked", "failed");
		return;
	}

	// --- 4. Scratch sandbox + Strategy port context assembly ---
	const scratchSandboxPath = path.join(sandboxBasePath, `decomp-${betId}`);
	try {
		fs.mkdirSync(scratchSandboxPath, { recursive: true });
	} catch {
		// mkdir failed — cannot provide a sandbox path; mark blocked.
		await markTerminal(db, betId, "blocked", "failed");
		return;
	}

	try {
		// If a test override is present, skip the real LLM path entirely (no Strategy call needed).
		if (!deps.runDecompositionTurn) {
			// --- 5. assembleContext via Strategy port (path a — CRITICAL-1) ---
			// @lore AK3: isRoutine=true tells the Strategy "do NOT read task/bet context
			// off taskId" — the synthetic taskId has no tasks row. Under minimal Strategy
			// this is a no-op (writes only scaffold dirs). Under Fabric it branches on
			// isRoutine to avoid reading the non-existent task row.
			try {
				await getActiveStrategy().assembleContext({
					db,
					sandboxPath: scratchSandboxPath,
					sessionId: `decomp-${betId}`,
					taskId: `decomp-${betId}`,
					agentId: pm.id,
					agentRole: pm.role,
					teamId: bet.teamId,
					isRoutine: true,
				});
			} catch {
				// assembleContext MAY throw (strategy-port.ts:107). A throw → blocked/failed.
				await markTerminal(db, betId, "blocked", "failed");
				return;
			}
		}

		// --- 6. Run PM turn ---
		let taskList: DecompositionTaskInput[];
		try {
			if (deps.runDecompositionTurn) {
				// Test-injectable override — no real LLM call.
				taskList = await withTimeout(
					deps.runDecompositionTurn({ betId, pmAgentId: pm.id }),
					timeoutMs,
				);
			} else {
				// Real PM turn — AH3-shaped task-free turn producing a structured JSON breakdown.
				// @lore AK3: The real LLM turn path is intentionally minimal for v1.
				// It uses the assembledContext in scratchSandboxPath and runs tools:[].
				// The structured output is parsed as a JSON array of DecompositionTaskInput.
				// This path is exercised by evals (real LLM, local-only) — not by unit tests.
				taskList = await withTimeout(
					runRealPmTurn(deps, pm, bet, scratchSandboxPath, timeoutMs),
					timeoutMs,
				);
			}
		} catch {
			await markTerminal(db, betId, "blocked", "failed");
			return;
		}

		if (!Array.isArray(taskList) || taskList.length === 0) {
			await markTerminal(db, betId, "blocked", "empty");
			return;
		}

		// --- 7. Insert tasks → accepted ---
		await insertProposedBetTasks(
			{ db, eventBus },
			{ id: bet.id, teamId: bet.teamId },
			eligible,
			taskList,
		);
		await markTerminal(db, betId, "done", null);
	} finally {
		// --- 8. rm scratch sandbox dir (best-effort) ---
		try {
			fs.rmSync(scratchSandboxPath, { recursive: true, force: true });
		} catch {
			// best-effort — a stale scratch dir is not fatal
		}
	}
}

// -----------------------------------------------------------------------------
// Real PM turn (non-test path)
// -----------------------------------------------------------------------------

/**
 * Run the real PM decomposition turn via the harness adapter.
 * tools:[] — no tool surface (AH3 pattern; CRITICAL-2 v1 primary path is server-side insert).
 *
 * @lore AK3: This is the real LLM path; it is NOT called when runDecompositionTurn
 * override is present. Integration tests always use the override. This path is
 * exercised only by evals (real LLM, local-only, out of scope for AK3 ACs).
 *
 * The PM is instructed to return a JSON array of tasks. The response text is
 * parsed as DecompositionTaskInput[]. Malformed JSON → empty list → blocked/empty.
 */
async function runRealPmTurn(
	deps: BetDecompositionDeps,
	pm: User,
	bet: { id: string; description: string; doneCondition: string | null },
	scratchSandboxPath: string,
	timeoutMs: number,
): Promise<DecompositionTaskInput[]> {
	if (!(deps.adapterPool && deps.resolveModel)) {
		throw new Error("adapterPool and resolveModel are required for the real PM turn");
	}

	const selected = deps.adapterPool.select({
		harnessType: pm.harnessType ?? "builtin",
		modelProviders: [pm.modelProvider ?? "anthropic"],
	});
	if (!selected) {
		throw new Error("No eligible harness adapter for PM decomposition");
	}

	let resolvedModel: import("@hyperidle/shared").ResolvedModel | undefined;
	try {
		resolvedModel = await deps.resolveModel("workhorse");
	} catch {
		throw new Error("Could not resolve model for PM decomposition");
	}
	if (!resolvedModel) {
		throw new Error("No model resolved for PM decomposition");
	}

	const systemPrompt =
		pm.systemPrompt ?? "You are a product manager. Break down the provided bet into a task list.";

	const userMessage = [
		`**Bet goal:** ${bet.description}`,
		bet.doneCondition ? `**Done condition:** ${bet.doneCondition}` : "",
		"",
		"Return a JSON array of task objects. Each object has: title (required, string), description (optional, string), doneCondition (optional, string), ownerRole (optional, string).",
		"Return ONLY the JSON array, no other text.",
	]
		.filter(Boolean)
		.join("\n");

	const sessionConfig: import("@hyperidle/shared").SessionConfig = {
		sessionId: crypto.randomUUID(),
		assembledPrompt: systemPrompt,
		sandboxPath: scratchSandboxPath,
		systemPromptPath: "",
		modelTier: "workhorse",
		tools: [],
		resolvedModel,
		messages: [{ role: "user", content: userMessage }],
	};

	const handle = await selected.adapter.startSession(sessionConfig);
	let completionText = "";

	try {
		const TIMEOUT_SENTINEL = Symbol("TIMEOUT_SENTINEL");
		const drainResult = await Promise.race([
			drainForCompletion(selected.adapter, handle),
			new Promise<typeof TIMEOUT_SENTINEL>((resolve) =>
				setTimeout(() => resolve(TIMEOUT_SENTINEL), timeoutMs),
			),
		]);

		if (drainResult === TIMEOUT_SENTINEL) {
			throw new Error("PM turn timed out");
		}
		completionText = drainResult;
	} finally {
		try {
			await selected.adapter.stopSession(handle);
		} catch {
			// best-effort stop
		}
		deps.adapterPool.release(selected.id);
	}

	// Parse the structured task list from the completion text.
	try {
		const parsed = JSON.parse(completionText) as unknown;
		if (Array.isArray(parsed)) {
			return parsed as DecompositionTaskInput[];
		}
	} catch {
		// malformed JSON → empty → blocked/empty
	}
	return [];
}

async function drainForCompletion(
	adapter: import("@hyperidle/shared").HarnessAdapter,
	handle: import("@hyperidle/shared").SessionHandle,
): Promise<string> {
	const stream = adapter.streamEvents(handle);
	for await (const event of stream) {
		if (event.type === "completion") {
			return event.text;
		}
		if (event.type === "error") {
			throw new Error(event.message);
		}
	}
	return "";
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
