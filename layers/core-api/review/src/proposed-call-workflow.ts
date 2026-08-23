/**
 * AL7 Task 9.5 — Proposed Call workflow: unified state-machine API.
 *
 * Public surface (AU20 Am9):
 *   - `findProposedCall`   — parameterized reader (replaces 3 use-case finders)
 *   - `recordProposedCall` — idempotent capture (replaces `captureProposedCall`)
 *   - `transitionProposedCall` — discriminated-union state machine
 *                                (replaces `holdProposedCall`, `composeTailoredGrant`,
 *                                 `consumeTailoredGrant`, `recordOutcome`)
 *
 * Internal helpers (not exported from barrel):
 *   - `handleUnconsumedGrantOnSessionEnd` — liveness net (AC11b); consumed
 *     internally by `registerReviewSubscriptions` in session-review-creator.ts
 *
 * @lore AU20 Am9: discriminated-union approach — the AL7 loop is a state
 * machine (`captured → held | granted → consumed → outcome-recorded`).
 * The heterogeneity (scope-tuple vs id key, `{proposedCallId}` vs `void`
 * return, injected recorder, `ToolResult` payload) is CAPTURED in
 * `ProposedCallTransition`, not hidden behind a lying signature.
 *
 * @lore AL7 R7: `handleUnconsumedGrantOnSessionEnd` is a SEPARATE
 * session_ended subscription (not inside `handleSessionEnded`). Sharing the
 * guard with `handleSessionEnded` would risk double-dispatch.
 *
 * @lore AU19 Increment 1j: `proposedCalls`/`operationOutcomes`/`tailoredGrants`
 * are `review`'s OWN owned tables (Table ACL, Mechanism A) — raw Drizzle
 * access here is legal, unchanged.
 */

import * as crypto from "node:crypto";
import {
	type Bet,
	type HyperIdleDb,
	type OperationOutcome,
	operationOutcomes,
	type ProposedCall,
	proposedCalls,
	type TailoredGrant,
	type Task,
	type Team,
	tailoredGrants,
	type User,
} from "@hyperidle/db";
import type { ToolResult } from "@hyperidle/harness-protocol";
import type {
	BakedAgentRunnableConfig,
	BakedContextBundle,
	SessionKnowledgeItemLike,
} from "@hyperidle/work-intent-port";
import { bakeAgentRunnableConfig, toBakedContextKnowledgeItems } from "@hyperidle/work-intent-port";
import { and, eq } from "drizzle-orm";
import type { ReviewAgentWorkIntentInput, ReviewPorts } from "./ports.js";

function nowIso(): string {
	return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// ProposedCallQuery — parameterized finder input
// ---------------------------------------------------------------------------

/** Lookup selector for a proposed call: by its own `id` or by the review message it was staged on. */
export type ProposedCallQuery =
	| {
			readonly by: { readonly reviewMessageId: string };
			readonly include?: { readonly outcome?: boolean; readonly grant?: boolean };
	  }
	| {
			readonly by: { readonly id: string };
			readonly include?: { readonly outcome?: boolean; readonly grant?: boolean };
	  };

/** A proposed call with optionally-joined sibling rows. */
export interface ProposedCallView {
	readonly call: ProposedCall;
	/** Present when `include.outcome = true` (left-join: may be null). */
	readonly outcome?: OperationOutcome | null;
	/**
	 * Present when `include.grant = true` AND a tailored grant exists (inner-
	 * join semantics: `undefined` view means no match).
	 */
	readonly grant?: TailoredGrant;
}

/**
 * Parameterized reader for a proposed call. Replaces the three use-case
 * finders (`findProposedCallByReviewMessageId`, `findGrantedProposedCall`,
 * `findProposedCallWithOutcomeByReviewMessageId`).
 *
 * Lookup key: `by.reviewMessageId` or `by.id`.
 * Optional joins: `include.outcome` (left-join) and/or `include.grant`
 * (inner-join — returns `undefined` if the call has no tailored grant).
 *
 * @lore AU20 Am9: a new lookup dimension (by task, by agent) is a new `by`
 * variant; no new function required.
 */
export async function findProposedCall(
	db: HyperIdleDb,
	query: ProposedCallQuery,
): Promise<ProposedCallView | undefined> {
	const whereClause =
		"reviewMessageId" in query.by
			? eq(proposedCalls.reviewMessageId, query.by.reviewMessageId)
			: eq(proposedCalls.id, query.by.id);

	const wantOutcome = query.include?.outcome === true;
	const wantGrant = query.include?.grant === true;

	if (wantGrant) {
		// Inner-join with tailored_grants — undefined if no grant exists
		const [row] = await db
			.select({ call: proposedCalls, grant: tailoredGrants })
			.from(proposedCalls)
			.innerJoin(tailoredGrants, eq(tailoredGrants.proposedCallId, proposedCalls.id))
			.where(whereClause)
			.limit(1);
		if (!row) return undefined;
		if (wantOutcome) {
			const [outcomeRow] = await db
				.select()
				.from(operationOutcomes)
				.where(eq(operationOutcomes.proposedCallId, row.call.id))
				.limit(1);
			return { call: row.call, grant: row.grant, outcome: outcomeRow ?? null };
		}
		return { call: row.call, grant: row.grant };
	}

	if (wantOutcome) {
		// Left-join with operation_outcomes
		const [row] = await db
			.select({
				call: proposedCalls,
				outcome: operationOutcomes,
			})
			.from(proposedCalls)
			.leftJoin(operationOutcomes, eq(operationOutcomes.proposedCallId, proposedCalls.id))
			.where(whereClause)
			.limit(1);
		if (!row) return undefined;
		return { call: row.call, outcome: row.outcome };
	}

	// Plain call lookup (no join)
	const [row] = await db.select().from(proposedCalls).where(whereClause).limit(1);
	return row ? { call: row } : undefined;
}

// ---------------------------------------------------------------------------
// resolveReengagementRequest — AU21 §6 Decision B emit-time resolver
// ---------------------------------------------------------------------------

/**
 * AU21 §6 Decision B placement ruling — the `reengagement` emit-time
 * resolver, extending this file IN PLACE (already the emit site for both real
 * call sites: `transitionProposedCall({to:"granted"})` below and
 * `applyLivenessRetry`'s first-no-show re-provision further down). Does
 * exactly what `resolveIntentInputInternal`'s "reengagement" case did at
 * drain time (`session-requests/src/service.ts:783-804`, deleted there by
 * this wave), reading only `review`'s own tables (via the already-in-file
 * `findProposedCall`) plus the two injected cross-Service reads.
 *
 * @lore Mechanism C (composition-boundary-guard): `@hyperidle/review`
 * depends ONLY on `@hyperidle/db` + framework packages (`package.json`) —
 * never on `@hyperidle/users`/`@hyperidle/work` directly. This resolver
 * therefore takes `requireRunnableAgent` + `getTaskById` as INJECTED
 * dependencies (`ReengagementResolverDeps`), same shape as the sibling
 * resolvers (`task-run-resolver.ts`'s `TaskRunResolverDeps`,
 * `assistant-turn-resolver.ts`'s `AssistantTurnResolverDeps`). The real
 * callers (`routes/threads.ts`'s verdict handler, `session-review-creator.ts`'s
 * `registerReviewSubscriptions`) wire the real `requireRunnableAgent`
 * (`@hyperidle/users`) and a `getTaskById` (`@hyperidle/work`) in via
 * `ReviewPorts` — core-api Layer code, not a nested Service, so it may
 * legitimately import both.
 */
export interface ReengagementResolverDeps {
	/**
	 * Widened `Promise<unknown>` → `Promise<User>` in Increment 12 Wave B (H2
	 * precedent) — the contextBundle bake reuses `agent.name`/`agent.role` from
	 * this SAME already-validated row, no second read.
	 */
	requireRunnableAgent(db: HyperIdleDb, agentId: string): Promise<User>;
	getTaskById(db: HyperIdleDb, id: string): Promise<Task | undefined>;
	/**
	 * AU21 §9 Increment 12 (Decision H3) — optional: `@hyperidle/work`'s own
	 * `bets` table, injected (Mechanism C — `@hyperidle/review` cannot import
	 * `@hyperidle/work` directly, same reasoning as the existing `getTaskById`
	 * injection). Absent at a call site not yet wired to bake context — the
	 * resolver falls back to baking no `contextBundle`, matching every
	 * existing caller's current (context-free) behavior unchanged.
	 */
	getBetById?(db: HyperIdleDb, id: string): Promise<Bet | undefined>;
	/** AU21 §9 Increment 12 (Decision H3) — optional: `@hyperidle/org`'s `getTeam`, injected for the same Mechanism C reason as `getBetById` above. */
	getTeamById?(db: HyperIdleDb, id: string): Promise<Team | undefined>;
	/** AU21 §9 Increment 12 (Decision H3) — optional: `@hyperidle/knowledge`'s `assembleSessionKnowledge` (Wave A), injected for the same Mechanism C reason. */
	assembleSessionKnowledge?(
		db: HyperIdleDb,
		input: {
			readonly teamId: string;
			readonly agentRole: string;
			readonly taskDescription: string;
		},
	): Promise<readonly SessionKnowledgeItemLike[]>;
	/**
	 * AU21 §9 Increment 12 (Decision H3), Wave E — optional: `@hyperidle/settings`'s
	 * `readServerConfig`, injected (Mechanism C — `@hyperidle/review` cannot
	 * import `@hyperidle/settings` directly) for the `harnessDisabled` bake.
	 * Absent at a call site not yet wired — the resolver bakes no
	 * `harnessDisabled` (matches `admitSession`'s "absent = nothing disabled"
	 * degrade).
	 */
	readServerConfig?(db: HyperIdleDb): Promise<{ readonly harnessDisabled: readonly string[] }>;
	/**
	 * AU27 Increment 1 (Decision 0) — optional: resolve-or-create the task's
	 * `hostKind:"task"` calling thread (Mechanism C — `@hyperidle/review`
	 * cannot import `@hyperidle/conversation` directly). Absent at a call site
	 * not yet wired — the resolver bakes no `callingThreadId`.
	 */
	resolveOrCreateCallingThread?(db: HyperIdleDb, taskId: string, agentId: string): Promise<string>;
}

/**
 * Project the optional contextBundle deps a `ReengagementResolverDeps`-shaped
 * bag was wired with, forwarding only the ones actually present — shared by
 * BOTH `transitionProposedCall`'s "granted" branch (the primary emit site)
 * and `applyLivenessRetry` (the liveness-net emit site) so the two never
 * drift out of sync on which optional deps get forwarded (AU21 review fix:
 * the "granted" branch previously forwarded only
 * `{getTaskById, requireRunnableAgent}`, silently dropping every optional
 * contextBundle dep).
 */
function optionalReengagementBakeDeps(
	deps: Partial<ReengagementResolverDeps>,
): Partial<ReengagementResolverDeps> {
	return {
		...(deps.getBetById ? { getBetById: deps.getBetById } : {}),
		...(deps.getTeamById ? { getTeamById: deps.getTeamById } : {}),
		...(deps.assembleSessionKnowledge
			? { assembleSessionKnowledge: deps.assembleSessionKnowledge }
			: {}),
		...(deps.readServerConfig ? { readServerConfig: deps.readServerConfig } : {}),
		...(deps.resolveOrCreateCallingThread
			? { resolveOrCreateCallingThread: deps.resolveOrCreateCallingThread }
			: {}),
	};
}

/** Thrown when the proposed call has no eligible grant, is not granted, or its task is unavailable. */
export class ReengagementSourceUnavailableError extends Error {}

/** The baked `reengagement` request shape, matching `resolveIntentInputInternal`'s former return. */
export interface BakedReengagementRequest {
	readonly defaultAgentId: string;
	readonly sourceKind: "proposed_call";
	readonly sourceId: string;
	readonly streamId: string;
	readonly taskId: string;
	readonly teamId: string;
	readonly sourceCorrelation: {
		readonly taskId: string;
		readonly proposedCallId: string;
		readonly grantedAgentId: string;
	};
	/**
	 * AU21 §9 Increment 12 (Decision H3) — the task/bet/agent/team content +
	 * ranked knowledge a `reengagement` session's sandbox needs, baked at emit
	 * time from the SAME `task` this resolver already loaded to validate.
	 * Present only when `deps.getBetById`/`deps.getTeamById`/
	 * `deps.assembleSessionKnowledge` were supplied (see `ReengagementResolverDeps`
	 * `@lore` above) — unlike `routine_run`/`knowledge_action`, this IS a real
	 * preserve-behavior migration (a `reengagement` session already flows
	 * through the full task/bet/ranked-knowledge path today, see this file's
	 * Wave B test `@lore`).
	 */
	readonly contextBundle?: BakedContextBundle;
	/**
	 * AU21 §9 Increment 12 (Decision H3), Wave E — the target agent's
	 * runnable-config snapshot, baked from the SAME already-`requireRunnableAgent`
	 * -validated `agent: User` row.
	 */
	readonly agentConfig: BakedAgentRunnableConfig;
	/**
	 * AU21 §9 Increment 12 (Decision H3), Wave E — the server's
	 * disabled-harness-types list. Present only when `deps.readServerConfig`
	 * was supplied.
	 */
	readonly harnessDisabled?: readonly string[];
	/**
	 * AU27 Increment 1 (Decision 1) — the task's calling thread id, baked via
	 * Decision 0's resolve-or-create. Present only when
	 * `deps.resolveOrCreateCallingThread` was supplied.
	 */
	readonly callingThreadId?: string;
}

/**
 * Resolve + validate a `reengagement` run at emit time: load the proposed
 * call WITH its tailored grant (rejecting if no grant exists or the call is
 * not `"granted"`), validate the grant's `agentScope` is a runnable AI agent
 * (never trust the flagging/requesting actor), load the grant's `taskScope`
 * task (rejecting if missing), and bake the full request.
 */
export async function resolveReengagementRequest(
	db: HyperIdleDb,
	proposedCallId: string,
	deps: ReengagementResolverDeps,
): Promise<BakedReengagementRequest> {
	const view = await findProposedCall(db, {
		by: { id: proposedCallId },
		include: { grant: true },
	});
	if (!view?.grant || view.call.status !== "granted") {
		throw new ReengagementSourceUnavailableError("Proposed call grant is not eligible");
	}
	const agent = await deps.requireRunnableAgent(db, view.grant.agentScope);
	const task = await deps.getTaskById(db, view.grant.taskScope);
	if (!task) {
		throw new ReengagementSourceUnavailableError("Proposed call task is unavailable");
	}

	// AU21 §9 Increment 12 (Decision H3): bake the contextBundle only when the
	// caller supplied all three context deps (see `ReengagementResolverDeps`
	// `@lore`) — destructured into locals so TS keeps them narrowed
	// non-optional inside the block below, no non-null assertion needed.
	let contextBundle: BakedContextBundle | undefined;
	const { getBetById, getTeamById, assembleSessionKnowledge } = deps;
	if (getBetById && getTeamById && assembleSessionKnowledge) {
		const [bet, team] = await Promise.all([
			getBetById(db, task.betId),
			getTeamById(db, task.teamId),
		]);
		if (bet && team) {
			const knowledge = await assembleSessionKnowledge(db, {
				teamId: task.teamId,
				agentRole: agent.role,
				taskDescription: task.description ?? task.title,
			});
			contextBundle = {
				kind: "task",
				task: { id: task.id, title: task.title, description: task.description, state: task.state },
				bet: {
					id: bet.id,
					description: bet.description,
					appetite: bet.appetite ?? "",
					doneCondition: bet.doneCondition,
				},
				agent: { id: agent.id, name: agent.name, role: agent.role },
				team: { id: team.id, name: team.name },
				knowledge: toBakedContextKnowledgeItems(knowledge),
			};
		}
	}
	const { readServerConfig, resolveOrCreateCallingThread } = deps;
	const harnessDisabled = readServerConfig
		? (await readServerConfig(db)).harnessDisabled
		: undefined;
	const callingThreadId = resolveOrCreateCallingThread
		? await resolveOrCreateCallingThread(db, task.id, view.grant.agentScope)
		: undefined;

	return {
		defaultAgentId: view.grant.agentScope,
		sourceKind: "proposed_call",
		sourceId: view.call.id,
		streamId: `task:${task.id}`,
		taskId: task.id,
		teamId: task.teamId,
		sourceCorrelation: {
			taskId: task.id,
			proposedCallId: view.call.id,
			grantedAgentId: view.grant.agentScope,
		},
		...(contextBundle ? { contextBundle } : {}),
		agentConfig: bakeAgentRunnableConfig(agent),
		...(harnessDisabled !== undefined ? { harnessDisabled } : {}),
		...(callingThreadId !== undefined ? { callingThreadId } : {}),
	};
}

// ---------------------------------------------------------------------------
// recordProposedCall — idempotent capture (replaces captureProposedCall)
// ---------------------------------------------------------------------------

/**
 * Insert a Proposed Call row idempotently (ON CONFLICT DO NOTHING semantics).
 * Returns `{ firstCapture: true }` if newly inserted, `{ firstCapture: false }`
 * if deduplicated.
 *
 * @lore AL7 WARNING-5.2: the `(origin_session_id, identity_hash)` constraint
 * MUST be a UNIQUE constraint so the INSERT ON CONFLICT DO NOTHING truly
 * deduplicates.
 */
export async function recordProposedCall(
	db: HyperIdleDb,
	input: {
		readonly originSessionId: string;
		readonly taskId: string;
		readonly agentId: string;
		readonly toolId: string;
		readonly args: Record<string, unknown>;
		readonly hash: string;
		readonly reviewMessageId: string;
		readonly subjectThreadId: string;
		readonly artifactId: string;
	},
): Promise<{ readonly firstCapture: boolean }> {
	const id = `pc-${crypto.randomUUID()}`;
	const rows = await db
		.insert(proposedCalls)
		.values({
			id,
			reviewMessageId: input.reviewMessageId,
			subjectThreadId: input.subjectThreadId,
			artifactId: input.artifactId,
			originSessionId: input.originSessionId,
			toolId: input.toolId,
			args: JSON.stringify(input.args),
			identityHash: input.hash,
			reversibility: "irreversible",
			status: "captured",
			stagedByAgentId: input.agentId,
			createdAt: nowIso(),
		})
		.onConflictDoNothing()
		.returning();
	return { firstCapture: rows.length > 0 };
}

// ---------------------------------------------------------------------------
// ProposedCallTransition — discriminated union for the state machine
// ---------------------------------------------------------------------------

/**
 * State-machine transition for a Proposed Call.
 *
 * | `to`              | selector              | payload                         | returns                    |
 * |-------------------|-----------------------|---------------------------------|----------------------------|
 * | `held`            | `{id}`                | —                               | `void`                     |
 * | `granted`         | `{id}`                | grant params + ports required   | `void`                     |
 * | `consumed`        | scope-tuple           | —                               | `{proposedCallId}\|null`   |
 * | `outcome-recorded`| `{id}`                | `{result: ToolResult}`          | `void`                     |
 *
 * @lore AU20 Am9: heterogeneity (scope-tuple vs id key, different return types,
 * injected recorder for `granted`, ToolResult payload) is captured in the
 * discriminated union — not hidden behind a lying signature.
 */
export type ProposedCallTransition =
	| { readonly to: "held"; readonly id: string }
	| {
			readonly to: "granted";
			readonly id: string;
			readonly taskScope: string;
			readonly agentScope: string;
			readonly approvedToolId: string;
			readonly approvedArgs: Record<string, unknown> | string;
			readonly argPinned?: boolean;
			readonly identityHash?: string;
	  }
	| {
			readonly to: "consumed";
			readonly taskId: string;
			readonly agentId: string;
			readonly toolId: string;
	  }
	| { readonly to: "outcome-recorded"; readonly id: string; readonly result: ToolResult };

// ---------------------------------------------------------------------------
// transitionProposedCall — unified state machine function
// ---------------------------------------------------------------------------

/**
 * Execute a state-machine transition on a Proposed Call.
 *
 * Overloads:
 * - `consumed` → returns `{ proposedCallId } | null` (CAS claim)
 * - All others → returns `void`
 *
 * @lore AU20 Am9: `ports.intentRecorder` is required for the `granted`
 * transition (composes grant + records reengagement intent inside one
 * 3-write tx). The `consumed` overload exposes its return type precisely
 * so callers never need to widen or cast.
 *
 * @lore AU21 §6 Decision B: `ports.getTaskById`/`ports.requireRunnableAgent`
 * (both optional) let the `granted` transition resolve + bake the
 * reengagement request at emit time, inside the SAME inner transaction that
 * just inserted the tailored grant — `resolveReengagementRequest` reads it
 * via `findProposedCall` with read-your-writes visibility. A bake failure is
 * tolerated (caught, not propagated): rolling back the grant itself on a
 * downstream agent-runnability failure would be a real behavior regression
 * versus the pre-migration async-fail-then-retry model, matching the
 * `knowledge_action` wave's precedent over `task_run`'s roll-back one.
 */
type TransitionProposedCallPorts = Pick<ReviewPorts, "intentRecorder"> &
	Partial<ReengagementResolverDeps>;
export function transitionProposedCall(
	exec: HyperIdleDb,
	transition: Extract<ProposedCallTransition, { to: "consumed" }>,
): Promise<{ readonly proposedCallId: string } | null>;
export function transitionProposedCall(
	exec: HyperIdleDb,
	transition: Exclude<ProposedCallTransition, { to: "consumed" }>,
	ports?: TransitionProposedCallPorts,
): Promise<void>;
export async function transitionProposedCall(
	exec: HyperIdleDb,
	transition: ProposedCallTransition,
	ports?: TransitionProposedCallPorts,
): Promise<{ readonly proposedCallId: string } | null | void> {
	switch (transition.to) {
		case "held": {
			await exec
				.update(proposedCalls)
				.set({ status: "held" })
				.where(eq(proposedCalls.id, transition.id));
			return;
		}

		case "granted": {
			const approvedArgsSer =
				typeof transition.approvedArgs === "string"
					? transition.approvedArgs
					: JSON.stringify(transition.approvedArgs);
			// AU31 §3.1 site 9 — the intent SUBMIT (`ports.intentRecorder.record`)
			// is captured here and called AFTER this transaction commits, never
			// inside it: a seam call issued while a transaction holds the shared
			// connection deadlocks it. The bake itself (`resolveReengagementRequest`)
			// stays IN the transaction — it reads the grant row just inserted
			// below. Cross-layer atomicity with `agent-orchestration` is
			// relinquished (founder ruling, architecture.md §3.1/§13 item 9): on a
			// failed submit, the human's approval is recorded and the grant is
			// minted, but no reengagement session is queued — the grant row stays
			// `consumed:false`, so the agent's next attempt at the same tool call
			// consumes it, and `applyLivenessRetry` is the existing net on the
			// same path.
			let pendingIntent: ReviewAgentWorkIntentInput | undefined;
			await exec.transaction(async (innerTx) => {
				await innerTx.insert(tailoredGrants).values({
					proposedCallId: transition.id,
					taskScope: transition.taskScope,
					agentScope: transition.agentScope,
					approvedToolId: transition.approvedToolId,
					approvedArgs: approvedArgsSer,
					argPinned: transition.argPinned ?? false,
					identityHash: transition.identityHash ?? null,
					consumed: false,
					retryCount: 0,
					mintedAt: nowIso(),
				});
				// Transition: captured → granted
				await innerTx
					.update(proposedCalls)
					.set({ status: "granted" })
					.where(and(eq(proposedCalls.id, transition.id), eq(proposedCalls.status, "captured")));
				if (ports?.intentRecorder) {
					// AU21 §6 Decision B: resolve + validate the reengagement run AT
					// EMIT TIME (this same transaction — the grant read below was
					// just inserted above) and bake the full request onto the
					// intent. See the `@lore` on `transitionProposedCall`'s JSDoc for
					// why a resolution failure here is caught, not propagated.
					let bakedRequest: BakedReengagementRequest | undefined;
					if (ports.getTaskById && ports.requireRunnableAgent) {
						try {
							bakedRequest = await resolveReengagementRequest(
								innerTx as HyperIdleDb,
								transition.id,
								{
									getTaskById: ports.getTaskById,
									requireRunnableAgent: ports.requireRunnableAgent,
									// AU21 §9 Increment 12 (Decision H3): forward the same
									// optional contextBundle deps `resolveReengagementRequest`
									// accepts, mirroring `applyLivenessRetry` below — this IS
									// the primary `transitionProposedCall({to:"granted"})` emit
									// site ports.ts's `@lore` refers to, so it must bake
									// everything the caller (threads.ts) supplied, not just
									// the two required deps.
									...optionalReengagementBakeDeps(ports),
								},
							);
						} catch {
							bakedRequest = undefined;
						}
					}
					pendingIntent = {
						kind: "reengagement",
						sourceKind: "proposed_call",
						sourceId: transition.id,
						requestedBy: transition.agentScope,
						idempotencyKey: `grant:${transition.id}`,
						bakedRequest,
					};
				}
			});
			if (pendingIntent && ports?.intentRecorder) {
				await ports.intentRecorder(pendingIntent);
			}
			return;
		}

		case "consumed": {
			const [claimed] = await exec
				.update(tailoredGrants)
				.set({ consumed: true, consumedAt: nowIso() })
				.where(
					and(
						eq(tailoredGrants.taskScope, transition.taskId),
						eq(tailoredGrants.agentScope, transition.agentId),
						eq(tailoredGrants.approvedToolId, transition.toolId),
						eq(tailoredGrants.consumed, false),
					),
				)
				.returning();
			return claimed ? { proposedCallId: claimed.proposedCallId } : null;
		}

		case "outcome-recorded": {
			const { id, result } = transition;
			const executedAt = nowIso();
			if (result.success) {
				const receipt = typeof result.data === "string" ? result.data : JSON.stringify(result.data);
				await exec.insert(operationOutcomes).values({
					proposedCallId: id,
					status: "ok",
					receipt,
					executedAt,
				});
			} else {
				await exec.insert(operationOutcomes).values({
					proposedCallId: id,
					status: "failed",
					error: result.error,
					executedAt,
				});
			}
			const newStatus = result.success ? "executed" : "failed";
			await exec.update(proposedCalls).set({ status: newStatus }).where(eq(proposedCalls.id, id));
			return;
		}
	}
}

// ---------------------------------------------------------------------------
// handleUnconsumedGrantOnSessionEnd — INTERNAL liveness net (AC11b)
// NOT exported from barrel; consumed by registerReviewSubscriptions.
// ---------------------------------------------------------------------------

/**
 * AC11b — Liveness net: handles a session_ended where the tailored grant was
 * NOT consumed (session 2 crashed or did not reach the approved op).
 *
 * Behavior:
 * - `retryCount === 0` → increment to 1, record a reengagement intent (re-provision once).
 * - `retryCount >= 1` → transition PC to `held` + write a `failed` Outcome
 *   (the work did not execute; surface it, never silently hang).
 *
 * @lore AU20 Am9: this was formerly exported as `handleUnconsumedGrantOnSessionEnd`
 * with an `onReenqueue` callback. It is now INTERNAL, folded into
 * `registerReviewSubscriptions` as a `session_ended` subscriber. The
 * `onReenqueue` callback is replaced by `ports.intentRecorder` so re-provision
 * uses the same durable intent path as `transitionProposedCall({to:'granted'})`.
 *
 * @lore AL7 Task 9.5: fires ONLY on crash/no-show. Re-derivation and arg
 * drift in a successful session 2 are trusted behavior — the liveness net
 * never trips on a session that consumed the grant.
 */
type LivenessIntentRecorder = Pick<ReviewPorts, "intentRecorder">["intentRecorder"];

/**
 * Shared two-branch liveness-net body (AC11b), factored out so both the
 * `session_ended` liveness net (`handleUnconsumedGrantOnSessionEnd`, keyed on
 * task+agent) and the pre-handoff `agent_run_admission_failed` reaction
 * (`reengageOnAdmissionFailure`, keyed directly on the proposed call the
 * intent named) apply IDENTICAL first-no-show/second-no-show semantics —
 * one behavior, two trigger points.
 *
 * @lore AU21 §6 Decision B: `bakeDeps` (optional) resolves + bakes the
 * re-provision intent at emit time — this IS the second real emit site
 * architecture.md names for `reengagement`, sharing `resolveReengagementRequest`
 * with `transitionProposedCall({to:"granted"})`. A bake failure is tolerated
 * (caught, not propagated) — same reasoning as the "granted" transition.
 */
async function applyLivenessRetry(
	db: HyperIdleDb,
	grant: TailoredGrant,
	intentRecorder: LivenessIntentRecorder,
	bakeDeps?: Partial<ReengagementResolverDeps>,
): Promise<void> {
	if (grant.retryCount === 0) {
		// First no-show: increment retry, record reengagement intent
		await db
			.update(tailoredGrants)
			.set({ retryCount: 1 })
			.where(eq(tailoredGrants.proposedCallId, grant.proposedCallId));
		let bakedRequest: BakedReengagementRequest | undefined;
		if (bakeDeps?.getTaskById && bakeDeps?.requireRunnableAgent) {
			try {
				bakedRequest = await resolveReengagementRequest(db, grant.proposedCallId, {
					getTaskById: bakeDeps.getTaskById,
					requireRunnableAgent: bakeDeps.requireRunnableAgent,
					// AU21 §9 Increment 12 (Decision H3): forward the same optional
					// contextBundle deps `resolveReengagementRequest` accepts —
					// present whenever the caller wired them (see `ReviewPorts`'
					// `@lore`).
					...optionalReengagementBakeDeps(bakeDeps),
				});
			} catch {
				bakedRequest = undefined;
			}
		}
		const input: ReviewAgentWorkIntentInput = {
			kind: "reengagement",
			sourceKind: "proposed_call",
			sourceId: grant.proposedCallId,
			requestedBy: grant.agentScope,
			idempotencyKey: `liveness:retry1:${grant.proposedCallId}`,
			bakedRequest,
		};
		await intentRecorder(input);
	} else {
		// Second no-show: give up — transition PC to held + write failed Outcome
		await db
			.update(proposedCalls)
			.set({ status: "held" })
			.where(eq(proposedCalls.id, grant.proposedCallId));
		await db.insert(operationOutcomes).values({
			proposedCallId: grant.proposedCallId,
			status: "failed",
			error: "approved op did not execute: session 2 ended without consuming the grant",
			executedAt: nowIso(),
		});
	}
}

export async function handleUnconsumedGrantOnSessionEnd(
	db: HyperIdleDb,
	opts: {
		taskId: string;
		agentId: string;
		intentRecorder: LivenessIntentRecorder;
	} & Partial<ReengagementResolverDeps>,
): Promise<void> {
	const grants = await db
		.select()
		.from(tailoredGrants)
		.where(
			and(
				eq(tailoredGrants.taskScope, opts.taskId),
				eq(tailoredGrants.agentScope, opts.agentId),
				eq(tailoredGrants.consumed, false),
			),
		);

	if (grants.length === 0) {
		return;
	}

	for (const grant of grants) {
		await applyLivenessRetry(db, grant, opts.intentRecorder, {
			getTaskById: opts.getTaskById,
			requireRunnableAgent: opts.requireRunnableAgent,
			getBetById: opts.getBetById,
			getTeamById: opts.getTeamById,
			assembleSessionKnowledge: opts.assembleSessionKnowledge,
			readServerConfig: opts.readServerConfig,
		});
	}
}

/**
 * AU21 Increment 3 Wave 0 (§10 subscriber table) — the `reengagement` reaction
 * to a terminal `agent_run_admission_failed`: a granted proposed call whose
 * re-provision never even reached a session (pre-handoff, not merely
 * unconsumed-post-session) applies the SAME liveness-net retry/give-up
 * pattern as the session-ended path, keyed directly on the proposed call the
 * intent named rather than on (taskId, agentId).
 */
export async function reengageOnAdmissionFailure(
	db: HyperIdleDb,
	opts: {
		proposedCallId: string;
		intentRecorder: LivenessIntentRecorder;
	} & Partial<ReengagementResolverDeps>,
): Promise<void> {
	const [grant] = await db
		.select()
		.from(tailoredGrants)
		.where(eq(tailoredGrants.proposedCallId, opts.proposedCallId));

	if (!grant) {
		return;
	}

	await applyLivenessRetry(db, grant, opts.intentRecorder, {
		getTaskById: opts.getTaskById,
		requireRunnableAgent: opts.requireRunnableAgent,
		getBetById: opts.getBetById,
		getTeamById: opts.getTeamById,
		assembleSessionKnowledge: opts.assembleSessionKnowledge,
		readServerConfig: opts.readServerConfig,
	});
}
