/**
 * Action rules — scoped items that mark agent actions requiring human approval.
 *
 * Scope model: a rule is global, team-scoped, or agent-scoped. Resolution at
 * provisioning is a UNION of all three applicable to a given session.
 *
 * @lore BA2 (ruling 20): No clearance table, no state machine, no risk tiers.
 * Plain scoped rows + a SQL union at provisioning time. Session-level
 * enforcement happens in the hook layer (gate-a). The list starts empty on a
 * fresh install — security is never preemptive (ruling 1).
 *
 * @lore BA2: `scopeId` is stored without an FK constraint so a rule survives
 * the deletion of its team or agent row. A hook that resolves no matching rule
 * simply allows the action — silent evaporation is the correct behaviour here
 * (no alert for a gate that became meaningless because its principal was removed).
 */
import { randomUUID } from "node:crypto";
import { type ActionRuleRow, actionRules, type HyperIdleDb } from "@hyperidle/db";
import { and, asc, eq, or } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ActionRuleScope = "global" | "team" | "agent";

export interface ActionRule {
	readonly id: string;
	readonly pattern: string;
	readonly description: string;
	readonly scope: ActionRuleScope;
	/** null when scope is 'global'; team/agent id otherwise */
	readonly scopeId: string | null;
	readonly createdAt: string;
}

export interface CreateActionRuleInput {
	readonly pattern: string;
	readonly description: string;
	readonly scope: ActionRuleScope;
	/** Required when scope is 'team' or 'agent'; ignored (set to null) for 'global'. */
	readonly scopeId?: string | null;
	/** Override current timestamp for deterministic tests only. */
	readonly now?: string;
}

export interface ResolveActionRulesInput {
	readonly agentId: string;
	/** Absent for agents with no team membership. */
	readonly teamId?: string | null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function rowToRule(row: ActionRuleRow): ActionRule {
	return {
		id: row.id,
		pattern: row.pattern,
		description: row.description,
		scope: row.scope as ActionRuleScope,
		scopeId: row.scopeId,
		createdAt: row.createdAt,
	};
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/** Return all action rules, ordered by creation time. */
export async function listActionRules(db: HyperIdleDb): Promise<ActionRule[]> {
	const rows = await db.select().from(actionRules).orderBy(asc(actionRules.createdAt));
	return rows.map(rowToRule);
}

/**
 * Create a new action rule.
 *
 * For scope='global', `scopeId` is always null regardless of what the caller
 * passes — the schema CHECK constraint enforces this, and this function
 * enforces it at the application layer too.
 */
export async function createActionRule(
	db: HyperIdleDb,
	input: CreateActionRuleInput,
): Promise<ActionRule> {
	const id = `rule-${randomUUID()}`;
	const now = input.now ?? new Date().toISOString();
	// Enforce the scope/scopeId invariant at the application layer as well as
	// the schema CHECK so callers get a clear error rather than a constraint
	// violation message.
	if (input.scope !== "global" && !input.scopeId) {
		throw new Error(
			`action-rules: scopeId is required when scope is '${input.scope}' (received: ${JSON.stringify(input.scopeId)})`,
		);
	}
	const scopeId = input.scope === "global" ? null : (input.scopeId ?? null);

	const [row] = await db
		.insert(actionRules)
		.values({
			id,
			pattern: input.pattern,
			description: input.description,
			scope: input.scope,
			scopeId,
			createdAt: now,
		})
		.returning();

	if (!row) throw new Error("action-rules: insert did not return a row");
	return rowToRule(row);
}

/**
 * Delete an action rule by id.
 *
 * Returns true when a row was deleted, false when no row matched.
 */
export async function deleteActionRule(db: HyperIdleDb, id: string): Promise<boolean> {
	const result = await db.delete(actionRules).where(eq(actionRules.id, id)).returning();
	return result.length > 0;
}

/**
 * Resolve the set of action rules that apply to a given session.
 *
 * The result is the UNION of:
 *   1. Global rules (apply to every agent unconditionally)
 *   2. Rules scoped to the agent's team (when `teamId` is provided)
 *   3. Rules scoped to the specific agent
 *
 * @lore BA2 (ruling 20): "session provisioning then takes the set that is
 * specific for the agent — which is the global stuff, plus stuff for the
 * agent's team, plus stuff for that specific agent."
 *
 * @lore scope-id-undefined: Omitting a clause rather than passing `scopeId =
 * undefined` follows the same pattern as session-knowledge-assembler.ts —
 * a scopeId comparison against undefined silently matches nothing AND can drag
 * the whole OR down with it in some drivers, so the clause is omitted when
 * the value is absent.
 */
export async function resolveActionRules(
	db: HyperIdleDb,
	input: ResolveActionRulesInput,
): Promise<ActionRule[]> {
	const { agentId, teamId } = input;

	// Build one clause per scope that is actually in play.
	const scopeClauses = [
		eq(actionRules.scope, "global"),
		and(eq(actionRules.scope, "agent"), eq(actionRules.scopeId, agentId)),
		...(teamId ? [and(eq(actionRules.scope, "team"), eq(actionRules.scopeId, teamId))] : []),
	] as const;

	const rows = await db
		.select()
		.from(actionRules)
		.where(or(...scopeClauses))
		.orderBy(asc(actionRules.createdAt));

	return rows.map(rowToRule);
}
