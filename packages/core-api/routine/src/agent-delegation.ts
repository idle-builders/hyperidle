/**
 * AU21 §6 Decision F1 fold — the `routine_delegate` surface of
 * `agent-selection`'s `selectAgent`: a skill-based fallback scan over
 * `userSkills`, excluding the routine's owner. Relocated from the standalone
 * `agent-selection` Service as a plain function.
 *
 * `resolveRoutineRunRequest` (`routine-service.ts`) already injects this
 * decision as a Mechanism-C port (`RoutineRunResolverDeps.agentSelection`) —
 * that port's SHAPE is unchanged by this fold. Generic over the injected
 * `db` type so `isAtCapacity` (folded into `@hyperidle/run-orchestration`'s
 * `isAgentAtCapacity`) and `listAgentIdsBySkill` (the `userSkills` table
 * read — `userSkills` is an `UNOWNED_SHARED_TABLES` table, but kept as an
 * injected port for symmetry with `isAtCapacity`, both genuinely
 * cross-Service from this file's point of view) stay legitimate injected
 * ports whose wiring TARGET changes (`routine-scheduler-bindings.ts`),
 * not their shape.
 */

export interface AgentDelegationDeps<TDb> {
	listAgentIdsBySkill(db: TDb, skillId: string): Promise<readonly string[]>;
	isAtCapacity(db: TDb, agentId: string): Promise<boolean>;
}

/**
 * Return the first skilled candidate (excluding `excludeAgentId`) that is
 * not at capacity, or `null` if every candidate is excluded, at capacity, or
 * no candidate has the skill.
 */
export async function selectRoutineDelegate<TDb>(
	db: TDb,
	deps: AgentDelegationDeps<TDb>,
	input: { readonly skillId: string; readonly excludeAgentId: string },
): Promise<{ readonly agentId: string | null }> {
	const candidateIds = await deps.listAgentIdsBySkill(db, input.skillId);
	for (const candidateId of candidateIds) {
		if (candidateId === input.excludeAgentId) continue;
		if (!(await deps.isAtCapacity(db, candidateId))) {
			return { agentId: candidateId };
		}
	}
	return { agentId: null };
}
