import * as fs from "node:fs";
import * as path from "node:path";
import type { FactoryRosterSpec } from "@hyperidle/shared";
import { defaultFactoryRoster } from "@hyperidle/shared";
import { and, eq, inArray } from "drizzle-orm";
import type { HyperIdleDb } from "./connection.js";
import { factorySettings, knowledgeItems, knowledgeStrategyFabric, users } from "./schema.js";
import { COMMUNITY_DISPLAY_NAMES, FACILITATOR_TOOLS } from "./seed-fixtures.js";

/**
 * Strip YAML frontmatter from markdown content.
 *
 * @lore X3: This function is intentionally duplicated from
 * packages/server/app-runtime/src/context-assembly-prompt.ts. The reason: @hyperidle/db must NOT
 * import from @hyperidle/server/app-runtime (wrong dependency direction — db is a leaf package
 * that fabric depends on, not vice versa). Extracting to @hyperidle/shared would
 * add a utility function to a types-only package. At 1 line of regex, duplication
 * is the correct choice.
 */
function stripFrontmatter(content: string): string {
	return content.replace(/^---\n[\s\S]*?\n---\n*/, "");
}

/**
 * Read a system prompt template from docs/system-prompts/ and strip frontmatter.
 * Returns null if the file does not exist (graceful degradation).
 * @lore AK1: Directory renamed from the old agent-persona directory to "system-prompts/" in
 * AK1 harness-vocabulary rename rollout.
 */
function readSystemPromptTemplate(docsRoot: string, filename: string): string | null {
	const filePath = path.join(docsRoot, "system-prompts", filename);
	try {
		const content = fs.readFileSync(filePath, "utf8");
		return stripFrontmatter(content);
	} catch {
		return null;
	}
}

/**
 * Apply the factory bootstrap layer — team-agnostic, idempotent baseline rows
 * that every HyperIdle environment needs to function.
 *
 * Inserts:
 *   - `system:propagation` system user (DB infra — always written unconditionally)
 *   - `seed-agent-cos` system-assistant singleton (iff roster.systemAssistant non-null)
 *   - one facilitator agent per roster.facilitators entry (roster-driven)
 *   - `factory_settings`: cost_cap, cost_cycle, system_template:<role> entries (DB infra)
 *   - `knowledge_items` + `knowledge_strategy_fabric`: the factory principle seed-ki-1 (DB infra)
 *
 * Does NOT insert teams, team_members, routines, bets, tasks, or any human users.
 * These are created at onboarding or by the demo fixture.
 *
 * Safe to call on every desktop launch and every deploy — all writes use
 * onConflictDoNothing / onConflictDoUpdate for idempotency.
 *
 * @lore AF17: split from the monolithic seed() which welded factory rows, demo
 * data (demo team), and team-provisioning. The split enforces hard-rule 1:
 * "No team_id on factory rows." and hard-rule 5: "No demo data in production."
 *
 * @lore AK6: `roster` is the AK6 registry-free injection seam. The DEFAULT is the
 * Fabric's factory roster so all four registry-less boot paths (desktop + 3 leaf CLIs)
 * call `applyFactoryBootstrap(db)` with NO second arg and get the Fabric roster
 * unchanged (AF17 green). A server that wants Minimal active passes minimalFactoryRoster.
 *
 * @lore AK6: The bootstrap-swap exception is BOUNDED and legitimate. The leaf/desktop
 * boot paths (packages/desktop/src/main.ts, setup-cli.ts, bootstrap-pg.ts,
 * seed-pg-cli.ts) call `applyFactoryBootstrap(db)` with NO roster arg and seed the
 * *default* Fabric roster because they run before any Strategy is registered.
 * Third-party rosters are honored only on the server boot path (which passes the
 * active Strategy's spec). This does not violate AC2 because the leaf path carries
 * a *value* (the default), not a Kernel roster decision.
 */
export async function applyFactoryBootstrap(
	db: HyperIdleDb,
	roster: FactoryRosterSpec = defaultFactoryRoster,
): Promise<void> {
	const now = new Date().toISOString();

	// ── system:propagation — DB infra, ALWAYS written unconditionally ──
	// @lore L20: messages.senderId references users.id. This user must exist
	// before any propagation-triggered review thread can be created.
	// AB0: system users have null agentCategory (they are not real agents).
	await db
		.insert(users)
		.values({
			id: "system:propagation",
			kind: "ai",
			name: "Propagation System",
			role: "system",
			agentCategory: null,
			status: "active",
			maxConcurrentSessions: 1,
			createdAt: now,
		})
		.onConflictDoNothing();

	// ── System Agent singleton — ROSTER-DRIVEN (iff roster.systemAssistant non-null) ──
	// @lore AD8a: seed-agent-cos renamed from "Chief of Staff" to "System Agent".
	// @lore AD8b: chief_of_staff role renamed to assistant; agentCategory: individual.
	if (roster.systemAssistant !== null) {
		const cosId = roster.systemAssistant.idHint;
		await db
			.insert(users)
			.values({
				id: cosId,
				kind: "ai",
				name: "System Agent",
				role: "assistant",
				agentCategory: "individual",
				status: "active",
				maxConcurrentSessions: 1,
				// AH2: runnable defaults so the agent can start without configuration.
				harnessType: "builtin",
				modelId: "claude-sonnet-4-6",
				modelProvider: "anthropic",
				createdAt: now,
			})
			.onConflictDoNothing();

		// Patch the System Agent row with facilitator metadata (idempotent).
		// @lore AD8a: systemPromptPath set to null — docs/system-prompts/chief-of-staff.md is deleted (renamed to assistant).
		// AH2: also set runnable defaults on PATCH so existing rows get them on upgrade.
		await db
			.update(users)
			.set({
				systemPromptPath: null,
				skills: JSON.stringify({ scope: null, tools: FACILITATOR_TOOLS }),
				harnessType: "builtin",
				modelId: "claude-sonnet-4-6",
				modelProvider: "anthropic",
			})
			.where(eq(users.id, cosId));
	}

	// ── Facilitator agents — ROSTER-DRIVEN (one per roster.facilitators entry) ──
	// @lore AD8c: renamed from "Practice Facilitator" (role: practice_facilitator) to
	// "Facilitator" (role: facilitator). System prompt file: facilitator.md.
	// Factory agents: agentCategory="strategy", team_id=null.
	// @lore AK6 NIT-1 (architecture-critique): facilitator name and skills are DERIVED
	// from `community` by the db-bootstrap (COMMUNITY_DISPLAY_NAMES / FACILITATOR_TOOLS
	// stay db-owned infra). The spec carries only the roster COMPOSITION.
	for (const f of roster.facilitators) {
		const displayName =
			COMMUNITY_DISPLAY_NAMES[f.community as keyof typeof COMMUNITY_DISPLAY_NAMES] ?? f.community;
		await db
			.insert(users)
			.values({
				id: f.idHint,
				kind: "ai",
				name: `${displayName} Facilitator`,
				role: f.role,
				agentCategory: "strategy",
				teamId: null,
				status: "active",
				maxConcurrentSessions: 1,
				systemPromptPath: "docs/system-prompts/facilitator.md",
				skills: JSON.stringify({
					scope: f.community,
					tools: FACILITATOR_TOOLS,
				}),
				// AH2: runnable defaults so factory agents can start without configuration.
				harnessType: "builtin",
				modelId: "claude-sonnet-4-6",
				modelProvider: "anthropic",
				createdAt: now,
			})
			.onConflictDoNothing();
	}

	// ── factory_settings: cost_cap, cost_cycle — DB infra ──
	await db
		.insert(factorySettings)
		.values({ key: "cost_cap", value: "20000", updatedAt: now })
		.onConflictDoNothing();
	await db
		.insert(factorySettings)
		.values({ key: "cost_cycle", value: "daily", updatedAt: now })
		.onConflictDoNothing();

	// ── System prompt templates from docs/system-prompts/ — DB infra ──
	// @lore X3: We read files at bootstrap time. If a file is missing, the template
	// is silently skipped (graceful degradation). Process CWD during seeding is the
	// monorepo root where docs/ lives.
	// @lore AK1: Directory renamed from old variant to docs/system-prompts/ in AK1 harness-vocab rename.
	const docsRoot = path.resolve(process.cwd(), "docs");
	const systemPromptTemplates: Array<{ role: string; filename: string }> = [
		{ role: "product_manager", filename: "product-manager.md" },
		// @lore AD8c: role renamed from practice_facilitator; prompt file renamed to facilitator.md
		{ role: "facilitator", filename: "facilitator.md" },
		{ role: "builder", filename: "builder.md" },
		{ role: "growth", filename: "growth.md" },
		{ role: "designer", filename: "designer.md" },
		{ role: "qa_engineer", filename: "qa-engineer.md" },
		{ role: "ops", filename: "ops.md" },
	];

	const templateValues: Record<string, string> = {};

	for (const { role, filename } of systemPromptTemplates) {
		const content = readSystemPromptTemplate(docsRoot, filename);
		if (content !== null) {
			templateValues[role] = content;
			await db
				.insert(factorySettings)
				.values({
					key: `system_template:${role}`,
					value: content,
					updatedAt: now,
				})
				.onConflictDoUpdate({
					target: factorySettings.key,
					set: { value: content, updatedAt: now },
				});
		}
	}

	// ── Backfill systemPrompt on roster-driven factory agents from role-based templates ──
	// Scoped to the roster's own agent ids (system:propagation is infra — not roster-driven).
	// @lore AK6 T9: seed-before-read ordering invariant — system_template rows MUST be
	// written BEFORE this backfill reads them. Sequential statement order preserves this.
	// T9 tests assert a roster-driven facilitator's persisted systemPrompt is non-empty.
	const rosterAgentIds: string[] = [];
	if (roster.systemAssistant !== null) {
		rosterAgentIds.push(roster.systemAssistant.idHint);
	}
	for (const f of roster.facilitators) {
		rosterAgentIds.push(f.idHint);
	}

	if (rosterAgentIds.length > 0) {
		for (const [role, template] of Object.entries(templateValues)) {
			await db
				.update(users)
				.set({ systemPrompt: template })
				.where(and(eq(users.role, role), eq(users.kind, "ai"), inArray(users.id, rosterAgentIds)));
		}
	}

	// ── AB0: Backfill agentCategory on all ai users by role (idempotent) ──
	// This covers any existing rows that may not have agentCategory set.
	const categoryByRole: Record<string, string> = {
		builder: "team",
		growth: "team",
		product_manager: "team",
		brand_voice: "team",
		designer: "team",
		qa_engineer: "team",
		ops: "team",
		support: "team",
		sales: "team",
		content: "team",
		data_analyst: "team",
		// @lore AD8c: renamed from practice_facilitator
		facilitator: "strategy",
		scout: "strategy",
		infra: "strategy",
		platform: "strategy",
		assistant: "individual",
	};
	for (const [role, category] of Object.entries(categoryByRole)) {
		await db
			.update(users)
			.set({ agentCategory: category })
			.where(and(eq(users.role, role), eq(users.kind, "ai")));
	}

	// ── Factory principle knowledge item — DB infra ──
	// @lore Q2: scopeKind defaults to "factory" (factory-level principle applies to all).
	// @lore F2: explicit scopeKind="factory" required; do not rely on DB default.
	await db
		.insert(knowledgeItems)
		.values({
			id: "seed-ki-1",
			scopeKind: "factory",
			scopeId: null,
			title: "Boil the Lake",
			body: "Solve the full problem, not a subset.",
			format: "markdown",
			status: "active",
			version: 1,
			updatedBy: "seed-agent-cos",
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoNothing();

	await db
		.insert(knowledgeStrategyFabric)
		.values({
			id: "seed-ksf-1",
			knowledgeItemId: "seed-ki-1",
			layer: "L4",
			kind: "principle",
		})
		.onConflictDoNothing();
}
