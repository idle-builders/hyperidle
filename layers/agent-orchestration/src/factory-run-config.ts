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

import * as fs from "node:fs";
import * as path from "node:path";
import type { HyperIdleDb } from "@hyperidle/db";
import { writeAgentRunConfigIfAbsent } from "@hyperidle/run-orchestration";

// ── Inlined template reader — identical logic to core-api/org/src/system-prompt-templates.ts ──
// @lore AU44 AU20-fd: can't import @hyperidle/org from a sibling layer; small copy lives here.
// Update both copies when the map or the stripping logic changes.
const SYSTEM_PROMPT_TEMPLATE_FILES: Readonly<Record<string, string>> = {
	product_manager: "product-manager.md",
	facilitator: "facilitator.md",
	builder: "builder.md",
	growth: "growth.md",
	designer: "designer.md",
	qa_engineer: "qa-engineer.md",
	ops: "ops.md",
};

function stripFrontmatter(content: string): string {
	return content.replace(/^---\n[\s\S]*?\n---\n*/, "");
}

/**
 * Read a system prompt template by role. Returns null for unknown roles or
 * missing files. An untrusted `role` string resolves ONLY via the
 * {@link SYSTEM_PROMPT_TEMPLATE_FILES} allowlist — no filesystem access before
 * the key lookup.
 */
export function readSystemPromptTemplateForRole(role: string): string | null {
	const filename = SYSTEM_PROMPT_TEMPLATE_FILES[role];
	if (filename === undefined) return null;
	const filePath = path.join(path.resolve(process.cwd(), "docs"), "system-prompts", filename);
	try {
		return stripFrontmatter(fs.readFileSync(filePath, "utf8"));
	} catch {
		return null;
	}
}

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
 * `readTemplate` defaults to the local {@link readSystemPromptTemplateForRole}.
 * Tests pass a controlled version to exercise the null-read branch without
 * relying on a filesystem-level missing file (every template file in this repo
 * exists, so the branch is unreachable with the real reader).
 */
export async function applyFactoryRunConfigDefaults(
	db: HyperIdleDb,
	rosterAgents: ReadonlyArray<{ readonly id: string; readonly role: string }>,
	readTemplate: (role: string) => string | null = readSystemPromptTemplateForRole,
): Promise<void> {
	// ── Single write per agent: AH2 defaults + template in one atomic absent-check ──
	// @lore BA9d: first-boot only — if a row already exists nothing is written.
	// Two separate calls broke this: first call (AH2) creates the row; second call
	// (systemPrompt) then sees the row and skips — fresh agents never got a prompt.
	// Merging into one call ensures both fields land together on a truly fresh row.
	// @lore X3 / AU18: missing template is silently skipped (null → absent from payload).
	for (const agent of rosterAgents) {
		const systemPrompt = readTemplate(agent.role);
		const defaults: Record<string, unknown> = { ...AH2_DEFAULTS };
		if (systemPrompt !== null) defaults.systemPrompt = systemPrompt;
		await writeAgentRunConfigIfAbsent(db, agent.id, defaults);
	}
}
