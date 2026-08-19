/**
 * AU29 §2.5.3 — the agent-orchestration first-boot face.
 *
 * The run-config half of the former `framework/db/src/factory-bootstrap.ts`:
 * AH2 runnable defaults, and the role-based system-prompt backfill, both
 * routed through `writeAgentRunConfig` — the owning service's own writer —
 * instead of a framework package inserting into `agent_run_config` directly.
 *
 * Ordering is load-bearing at the caller: `agent_run_config.agentUserId` has
 * an FK to `users.id`, so this must run AFTER `applyFactoryCoreState`, which
 * both creates the roster users and returns the `rosterAgents` this needs.
 */

import { writeAgentRunConfig } from "@hyperidle/agent-run-config";
import type { HyperIdleDb } from "@hyperidle/db";
import {
	readSystemPromptTemplateForRole,
	SYSTEM_PROMPT_TEMPLATE_FILES,
} from "@hyperidle/factory-defaults";

const AH2_DEFAULTS = {
	harnessType: "builtin",
	modelId: "claude-sonnet-4-6",
	modelProvider: "anthropic",
	maxConcurrentSessions: 1,
} as const;

/**
 * Apply agent-orchestration's half of the factory bootstrap: AH2 runnable
 * defaults for every roster agent, and the role-based system-prompt backfill.
 * Idempotent — safe on every launch.
 */
export async function applyFactoryRunConfigDefaults(
	db: HyperIdleDb,
	rosterAgents: ReadonlyArray<{ readonly id: string; readonly role: string }>,
): Promise<void> {
	// ── AH2: runnable defaults so factory agents can start without configuration ──
	for (const agent of rosterAgents) {
		await writeAgentRunConfig(db, agent.id, { ...AH2_DEFAULTS });
	}

	// ── System prompt templates from docs/system-prompts/ — read directly, no cache table ──
	// @lore X3 / AU18: read at bootstrap time. A missing file is silently skipped
	// (graceful degradation) — writing `systemPrompt: null` on a missing file
	// would overwrite an existing prompt, which the `content !== null` guard
	// below exists to prevent.
	for (const role of Object.keys(SYSTEM_PROMPT_TEMPLATE_FILES)) {
		const content = readSystemPromptTemplateForRole(role);
		if (content === null) continue;
		for (const agent of rosterAgents) {
			if (agent.role !== role) continue;
			await writeAgentRunConfig(db, agent.id, { systemPrompt: content });
		}
	}
}
