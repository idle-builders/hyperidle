/**
 * M2: Auth identity contract.
 *
 * GET /api/auth/me — returns the authenticated user's identity.
 * Replaces all hardcoded "u-founder" / DEFAULT_FOUNDER_ID / DEMO_FOUNDER_ID
 * literals across server and client code.
 *
 * @lore M2: v1 is single-founder. The factory has exactly one founder who is a
 * row in the users table (kind='human'). Multi-user support is a future concern
 * — this contract is deliberately narrow.
 *
 * @lore M2 REVIEWER FINDING (plan gap): `packages/server/src/routes/threads.ts:79`
 * has a second `DEFAULT_FOUNDER_ID` fallback inside `readInitialSenderId()` that
 * is NOT listed in the M2 architecture migration recipe for cluster 1. The recipe
 * covers `threads.ts:49` (constant declaration) and `threads.ts:56` (header fallback)
 * but misses the deeper fallback at line 79 where the function returns
 * `DEFAULT_FOUNDER_ID` when no non-founder agent participant is found.
 * M3 builder must also replace that return with `c.get("userId")` or an equivalent
 * identity from the middleware context. This is a plan gap — the designer should
 * update `plans/M2/architecture.md` cluster 1 migration recipe to include line 79.
 *
 * @lore M2 REVIEWER FINDING (cluster 4): The behavioral contract for agent-participant
 * assignment (cluster 4) requires no new api-contract type. The contract is behavioral
 * only: task/bet detail endpoints already return ownerAgentId / leadAgentId fields.
 * The auth middleware fallback `?? "u-founder"` in the plan sample (contracts.md § 1)
 * is a plan-level concern, not a type-contract concern.
 */

/** Response shape for GET /api/auth/me. */
export interface AuthMeResponse {
	readonly id: string;
	readonly name: string;
	readonly email: string;
	readonly avatarUrl: string | null;
}
