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
 *
 * @lore AU44 AU20-fd: `framework/factory-defaults` dissolved; its template reader
 * moved into `@hyperidle/org`. `layers/agent-orchestration` cannot import another
 * layer (crossing-import rule), so the template-reader logic is inlined here.
 * The implementation is identical to `layers/core-api/org/src/system-prompt-templates.ts`
 * — two small copies are the right answer when the alternative is a forbidden crossing.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { writeAgentRunConfigIfAbsent } from "@hyperidle/run-orchestration";

// ── Inlined template reader — identical logic to core-api/org/src/system-prompt-templates.ts ──
// @lore AU44 AU20-fd: can't import @hyperidle/org from a sibling layer; small copy lives here.
// Update both copies when the map or the stripping logic changes.
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
 *
 * Tests pass a controlled version to exercise the null-read branch without
 * relying on a filesystem-level missing file (every template file in this repo
 * exists, so the branch is unreachable with the real reader).
 */
export async function applyFactoryRunConfigDefaults(
	db: HyperIdleDb,
	rosterAgents: ReadonlyArray<{ readonly id: string; readonly role: string }>,
): Promise<void> {
	// @lore BA9d: first-boot only — if a row already exists nothing is written.
	//
	// This used to also write a persona, read from a role template on disk. Two
	// things ended that. The persona is an agent's identity, not its run config —
	// it is a knowledge document bound to the agent now, seeded where the agent is
	// created. And the write was already dead: BA9d shrank the factory roster to
	// the System Agent, whose role `assistant` is not in the template allowlist,
	// so the lookup had been returning null for every roster agent since.
	for (const agent of rosterAgents) {
		await writeAgentRunConfigIfAbsent(db, agent.id, { ...AH2_DEFAULTS });
	}
}
