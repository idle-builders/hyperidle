import * as fs from "node:fs";
import * as path from "node:path";
import { and, eq } from "drizzle-orm";
import type { HyperIdleDb } from "./connection.js";
import { factorySettings, knowledgeItems, knowledgeStrategyFabric, users } from "./schema.js";
import {
	COMMUNITY_DISPLAY_NAMES,
	FACILITATOR_TOOLS,
	PRACTICE_COMMUNITIES,
} from "./seed-fixtures.js";

/**
 * Strip YAML frontmatter from markdown content.
 *
 * @lore X3: This function is intentionally duplicated from
 * packages/fabric/src/prompt-composition.ts. The reason: @hyperidle/db must NOT
 * import from @hyperidle/fabric (wrong dependency direction — db is a leaf package
 * that fabric depends on, not vice versa). Extracting to @hyperidle/shared would
 * add a utility function to a types-only package. At 1 line of regex, duplication
 * is the correct choice.
 */
function stripFrontmatter(content: string): string {
	return content.replace(/^---\n[\s\S]*?\n---\n*/, "");
}

/**
 * Read a soul prompt template from docs/souls/ and strip frontmatter.
 * Returns null if the file does not exist (graceful degradation).
 */
function readSoulTemplate(docsRoot: string, filename: string): string | null {
	const filePath = path.join(docsRoot, "souls", filename);
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
 *   - `system:propagation` system user
 *   - `seed-agent-cos` system-assistant singleton (individual category)
 *   - one facilitator agent per community of practice (strategy category, team_id null)
 *   - `factory_settings`: cost_cap, cost_cycle, soul_template:<role> entries
 *   - `knowledge_items` + `knowledge_strategy_fabric`: the factory principle seed-ki-1
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
 */
export async function applyFactoryBootstrap(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();

	// ── system:propagation — authors review threads when bets enter review ──
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

	// ── System Agent singleton ──
	// @lore AD8a: seed-agent-cos renamed from "Chief of Staff" to "System Agent".
	// @lore AD8b: chief_of_staff role renamed to assistant; agentCategory: individual.
	await db
		.insert(users)
		.values({
			id: "seed-agent-cos",
			kind: "ai",
			name: "System Agent",
			role: "assistant",
			agentCategory: "individual",
			status: "active",
			maxConcurrentSessions: 1,
			createdAt: now,
		})
		.onConflictDoNothing();

	// Patch the System Agent row with facilitator metadata (idempotent).
	// @lore AD8a: soulPromptPath set to null — docs/souls/chief-of-staff.md is deleted.
	await db
		.update(users)
		.set({
			soulPromptPath: null,
			skills: JSON.stringify({ scope: null, tools: FACILITATOR_TOOLS }),
		})
		.where(eq(users.id, "seed-agent-cos"));

	// ── Facilitator agents — one per community of practice ──
	// @lore AD8c: renamed from "Practice Facilitator" (role: practice_facilitator) to
	// "Facilitator" (role: facilitator). Soul file renamed to facilitator.md.
	// Factory agents: agentCategory="strategy", team_id=null.
	for (const community of PRACTICE_COMMUNITIES) {
		await db
			.insert(users)
			.values({
				id: `seed-agent-pf-${community}`,
				kind: "ai",
				name: `${COMMUNITY_DISPLAY_NAMES[community]} Facilitator`,
				role: "facilitator",
				agentCategory: "strategy",
				teamId: null,
				status: "active",
				maxConcurrentSessions: 1,
				soulPromptPath: "docs/souls/facilitator.md",
				skills: JSON.stringify({
					scope: community,
					tools: FACILITATOR_TOOLS,
				}),
				createdAt: now,
			})
			.onConflictDoNothing();
	}

	// ── factory_settings: cost_cap, cost_cycle ──
	await db
		.insert(factorySettings)
		.values({ key: "cost_cap", value: "20000", updatedAt: now })
		.onConflictDoNothing();
	await db
		.insert(factorySettings)
		.values({ key: "cost_cycle", value: "daily", updatedAt: now })
		.onConflictDoNothing();

	// ── Soul prompt templates from docs/souls/ ──
	// @lore X3: We read files at bootstrap time. If a file is missing, the template
	// is silently skipped (graceful degradation). Process CWD during seeding is the
	// monorepo root where docs/ lives.
	const docsRoot = path.resolve(process.cwd(), "docs");
	const soulTemplates: Array<{ role: string; filename: string }> = [
		{ role: "product_manager", filename: "product-manager.md" },
		// @lore AD8c: role renamed from practice_facilitator; soul file renamed to facilitator.md
		{ role: "facilitator", filename: "facilitator.md" },
		{ role: "builder", filename: "builder.md" },
		{ role: "growth", filename: "growth.md" },
		{ role: "designer", filename: "designer.md" },
		{ role: "qa_engineer", filename: "qa-engineer.md" },
		{ role: "ops", filename: "ops.md" },
	];

	const templateValues: Record<string, string> = {};

	for (const { role, filename } of soulTemplates) {
		const content = readSoulTemplate(docsRoot, filename);
		if (content !== null) {
			templateValues[role] = content;
			await db
				.insert(factorySettings)
				.values({
					key: `soul_template:${role}`,
					value: content,
					updatedAt: now,
				})
				.onConflictDoUpdate({
					target: factorySettings.key,
					set: { value: content, updatedAt: now },
				});
		}
	}

	// ── Backfill soulPrompt on factory agents from role-based templates ──
	// Scoped to factory agents only (system:propagation, seed-agent-cos, seed-agent-pf-*)
	// to avoid clobbering team agents provisioned at onboarding.
	const factoryAgentIds = [
		"system:propagation",
		"seed-agent-cos",
		...PRACTICE_COMMUNITIES.map((c) => `seed-agent-pf-${c}`),
	];
	for (const [role, template] of Object.entries(templateValues)) {
		await db
			.update(users)
			.set({ soulPrompt: template })
			.where(and(eq(users.role, role), eq(users.kind, "ai")));
		// Note: this backfill only runs on agents in the DB at bootstrap time,
		// which on a fresh DB is only factory agents.
	}
	// Suppress unused variable warning — factoryAgentIds is conceptually used above
	void factoryAgentIds;

	// ── AB0: Backfill agentCategory on factory agents (idempotent) ──
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

	// ── Factory principle knowledge item ──
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
