/**
 * AU29 §2.5.3 — the agent-orchestration first-boot face.
 *
 * The run-config half of the former `framework/db/src/factory-bootstrap.ts`:
 * AH2 runnable defaults routed through `writeAgentRunConfig` — the owning
 * service's own writer — instead of a framework package inserting into
 * `agent_run_config` directly.
 *
 * Ordering is load-bearing at the caller: `agent_run_config.agentUserId` has
 * an FK to `users.id`, so this must run AFTER `applyFactoryCoreState`, which
 * both creates the roster users and returns the `rosterAgents` this needs.
 *
 * @lore AU44 AU20-fd: `framework/factory-defaults` dissolved. The system-prompt
 * template backfill loop is removed: after the facilitator dissolution the only
 * core roster agent is `seed-agent-cos` (role: "assistant"), which is deliberately
 * NOT in the template map (AD8a — assistant.md exists but was never seeded;
 * GET /api/agents/templates/assistant is a 404 by design). The loop wrote nothing,
 * ever — removing it is a dead-code delete, not a behavior change.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { writeAgentRunConfig } from "@hyperidle/run-orchestration";

const AH2_DEFAULTS = {
	harnessType: "builtin",
	modelId: "claude-sonnet-4-6",
	modelProvider: "anthropic",
	maxConcurrentSessions: 1,
} as const;

/**
 * Apply agent-orchestration's half of the factory bootstrap: AH2 runnable
 * defaults for every roster agent. Idempotent — safe on every launch.
 */
export async function applyFactoryRunConfigDefaults(
	db: HyperIdleDb,
	rosterAgents: ReadonlyArray<{ readonly id: string; readonly role: string }>,
): Promise<void> {
	// ── AH2: runnable defaults so factory agents can start without configuration ──
	for (const agent of rosterAgents) {
		await writeAgentRunConfig(db, agent.id, { ...AH2_DEFAULTS });
	}
}
