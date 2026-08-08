/**
 * AU29 §2.5.4 — the tool CLIs' shared factory-bootstrap runner.
 *
 * The two ordered layer-face calls, once, so the three CLIs (`setup-cli.ts`,
 * `bootstrap-pg.ts`, `seed-pg-cli.ts`) cannot diverge from each other or from
 * the desktop application's own boot sequence (`applications/desktop/src/main.ts`).
 * Ordering is load-bearing: `agent_run_config.agentUserId` has an FK to
 * `users.id`, so the core-state face must complete before the run-config face.
 *
 * Tool-internal — not a public contract (no barrel; imported by its sibling
 * CLI modules via a relative path within this package).
 */

import { applyFactoryRunConfigDefaults } from "@hyperidle/agent-orchestration";
import { applyFactoryCoreState } from "@hyperidle/core-api";
import type { HyperIdleDb } from "@hyperidle/db";

export async function runFactoryBootstrap(db: HyperIdleDb): Promise<void> {
	const rosterAgents = await applyFactoryCoreState(db);
	await applyFactoryRunConfigDefaults(db, rosterAgents);
}
