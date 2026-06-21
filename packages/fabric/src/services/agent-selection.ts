/**
 * AK7 RED STUB — selectAgentFabric.
 *
 * This file is a red-phase stub. It exports the function signature so tests
 * compile, but the implementation throws "not implemented" so tests fail at
 * runtime (the correct TDD red-phase failure mode).
 *
 * The green phase replaces this with the real implementation per architecture §6.2:
 *   - bet_decomposer: role-match PM on candidates; else candidates[0]
 *   - bet_task:       role-match short-circuit; else candidates[spreadIndex % len]
 *   - routine_delegate: findDelegate's exact userSkills query verbatim (ignores candidates)
 */

import type { HyperIdleDb } from "@hyperidle/db";
import type { SelectAgentOutcome, SelectAgentRequest } from "@hyperidle/shared";

/**
 * AK7: Fabric-side selection implementation. Delegates from fabricStrategy.selectAgent.
 *
 * @lore AK7: This is a RED STUB. The green phase fills in the three-branch
 * implementation (bet_task / bet_decomposer / routine_delegate per architecture §6.2).
 * Do not call this in production until the green phase lands.
 */
export async function selectAgentFabric(
	_req: SelectAgentRequest<HyperIdleDb>,
): Promise<SelectAgentOutcome> {
	throw new Error("AK7: selectAgentFabric not implemented — green phase required");
}
