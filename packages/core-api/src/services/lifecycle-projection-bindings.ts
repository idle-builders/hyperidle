/**
 * @lore AU19 Increment 3d: `@hyperidle/lifecycle-projection`'s
 * `startAgentLifecycleProjectionDrain` needs injected
 * `routine`/`work`/`explicitSessionStarts` ports (Mechanism C —
 * `lifecycle-projection` never imports another Service). This module builds
 * the bound singleton ONCE, at the composition root, so every real call site
 * (`server-factory.ts`, `agent-lifecycle-projection.integration.test.ts`,
 * `routine-scheduler.au15.integration.test.ts`) imports the already-wired
 * function — same factory-curry idiom as `session-requests-bindings.ts`/
 * `policy-bindings.ts`. (`drainAgentLifecycleInbox` — the one-shot drain
 * `startAgentLifecycleProjectionDrain` polls internally — has no standalone
 * production call site today, so this module does not re-export a wrapper
 * for it; import it directly from `@hyperidle/lifecycle-projection` with the
 * same `agentLifecycleProjectionDeps` shape if a future caller needs it.)
 */

import type { HyperIdleDb } from "@hyperidle/db";
import {
	type AgentLifecycleProjectionDeps,
	startAgentLifecycleProjectionDrain as startAgentLifecycleProjectionDrainInternal,
} from "@hyperidle/lifecycle-projection";
import { updateRoutineRunIfRunning } from "@hyperidle/routine";
import { projectExplicitSessionStartTerminalState } from "@hyperidle/session-requests";
import { updateBetDecompositionStatusIfRunning } from "@hyperidle/work";

const agentLifecycleProjectionDeps: AgentLifecycleProjectionDeps = {
	routine: { updateRoutineRunIfRunning },
	work: { updateBetDecompositionStatusIfRunning },
	explicitSessionStarts: { projectTerminalState: projectExplicitSessionStartTerminalState },
};

export function startAgentLifecycleProjectionDrain(
	db: HyperIdleDb,
	options?: Parameters<typeof startAgentLifecycleProjectionDrainInternal>[2],
): () => void {
	return startAgentLifecycleProjectionDrainInternal(db, agentLifecycleProjectionDeps, options);
}
