/**
 * AU29 §2.5.4 — the tool CLIs' shared factory-bootstrap runner.
 *
 * The layer-face call, once, so the three CLIs (`setup-cli.ts`,
 * `bootstrap-pg.ts`, `seed-pg-cli.ts`) cannot diverge from each other or from
 * the desktop application's own boot sequence (`applications/desktop/src/main.ts`).
 *
 * @lore There used to be a second ordered call here, writing first-boot run
 * config for every roster agent. It wrote the built-in harness and a hardcoded
 * Anthropic model. With the built-in harness retired, what was left to write
 * was exactly what an absent `agent_run_config` row already resolves to
 * (`DEFAULT_AGENT_RUN_CONFIG`) — so the call, its face and its test are gone.
 * A roster agent now stores no harness and no model: the pool picks an
 * installed harness at admission, and that harness runs its own default model.
 *
 * Tool-internal — not a public contract (no barrel; imported by its sibling
 * CLI modules via a relative path within this package).
 */

import { applyFactoryCoreState } from "@hyperidle/core-api";
import type { HyperIdleDb } from "@hyperidle/db";

export async function runFactoryBootstrap(db: HyperIdleDb): Promise<void> {
	await applyFactoryCoreState(db);
}
