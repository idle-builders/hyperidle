import * as fs from "node:fs";
import * as path from "node:path";
import { and, eq } from "drizzle-orm";
import type { HyperIdleDb } from "./connection.js";
import {
	bets,
	factorySettings,
	knowledgeItems,
	knowledgeStrategyFabric,
	routines,
	tasks,
	teamMembers,
	teams,
	users,
} from "./schema.js";
import {
	BUILTIN_ROUTINE_SEEDS,
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
 * is the correct choice. The @lore comment ensures future agents understand why.
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
 * @lore Phase 2 PGlite migration: seed() is now async and uses PG semantics
 * (true/false booleans, await, no .run()). The SQLite seed was replaced
 * because the schema is now PG-only (pgTable). See I3 / TRACK-I.md L161-164.
 *
 * The function accepts any PG-flavoured Drizzle instance (postgres-js,
 * pglite). Each statement uses `.onConflictDoNothing()` for idempotency so
 * `seed(db)` can be called repeatedly without error.
 */
export async function seed(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();

	// @lore U1: insert into `teams` (formerly `products`).
	// AB0: functions column added to teams to determine the default agent roster.
	await db
		.insert(teams)
		.values({
			id: "seed-product-1",
			name: "Nimmly",
			phase: "build",
			functions: JSON.stringify(["development", "product"]),
			createdAt: now,
		})
		.onConflictDoNothing();

	// @lore U1: insert into `teamMembers` (formerly `teams`). Column `teamId` (formerly `productId`).
	await db
		.insert(teamMembers)
		.values({
			id: "seed-team-1",
			teamId: "seed-product-1",
			capacity: 5,
			activeBets: 0,
			formedAt: now,
		})
		.onConflictDoNothing();

	// P2: Seed the human founder user row. This is the authenticated identity for
	// the auth middleware (users WHERE kind = 'human' LIMIT 1).
	await db
		.insert(users)
		.values({
			id: "u-founder",
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			email: "founder@hyperidle.com",
			maxConcurrentSessions: 0,
			createdAt: now,
		})
		.onConflictDoNothing();

	await db
		.insert(users)
		.values({
			id: "seed-agent-builder",
			kind: "ai",
			name: "Nimmly Builder",
			role: "builder",
			agentCategory: "team",
			status: "active",
			maxConcurrentSessions: 3,
			teamId: "seed-team-1",
			createdAt: now,
		})
		.onConflictDoNothing();

	// @lore AD8a: Transitional name "System Agent". AD8b creates per-user assistant agents
	// and retires this shared singleton. The name avoids collision with the concept's per-user
	// assistant. role: "chief_of_staff" stays — AD8b renames it to "assistant".
	// @lore AD8a: Stale `soul_template:chief_of_staff` key may persist in existing databases.
	// AD8b removes it when creating the new assistant soul template.
	await db
		.insert(users)
		.values({
			id: "seed-agent-cos",
			kind: "ai",
			name: "System Agent",
			role: "chief_of_staff",
			agentCategory: "individual",
			status: "active",
			maxConcurrentSessions: 1,
			createdAt: now,
		})
		.onConflictDoNothing();

	// L20: system:propagation user — authors review threads when bets enter review.
	// FK constraint: messages.senderId references users.id. This user must exist
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

	// Patch the existing System Agent row with facilitator metadata.
	// Idempotent: a second run writes the same values.
	// @lore AD8a: soulPromptPath set to null — docs/souls/chief-of-staff.md is deleted.
	// AD8b creates a new assistant.md soul and sets soulPromptPath accordingly.
	await db
		.update(users)
		.set({
			soulPromptPath: null,
			skills: JSON.stringify({ scope: null, tools: FACILITATOR_TOOLS }),
		})
		.where(eq(users.id, "seed-agent-cos"));

	// Product Manager — scoped to seed-product-1.
	await db
		.insert(users)
		.values({
			id: "seed-agent-pm-nimmly",
			kind: "ai",
			name: "Nimmly Product Manager",
			role: "product_manager",
			agentCategory: "team",
			teamId: "seed-team-1",
			status: "active",
			maxConcurrentSessions: 1,
			soulPromptPath: "docs/souls/product-manager.md",
			skills: JSON.stringify({
				scope: "seed-product-1",
				tools: FACILITATOR_TOOLS,
			}),
			createdAt: now,
		})
		.onConflictDoNothing();

	// Facilitators — one per community of practice.
	// @lore AD8c: renamed from "Practice Facilitator" (role: practice_facilitator) to
	// "Facilitator" (role: facilitator). Soul file renamed from practice-facilitator.md
	// to facilitator.md. For production DBs with existing rows, a manual migration is
	// needed: UPDATE users SET role='facilitator' WHERE role='practice_facilitator'.
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

	// @lore U1: update teamMembers (formerly teams) via the new export name.
	await db
		.update(teamMembers)
		.set({ leadAgentId: "seed-agent-builder" })
		.where(eq(teamMembers.id, "seed-team-1"));

	// @lore O2: kernel/strategy separation. Kernel table only gets identity+content.
	// Strategy fields (layer, kind) go to knowledgeStrategyFabric extension table.
	// @lore Q2: scopeKind defaults to "factory" (factory-level principle applies to all).
	// @lore F2 (architecture critique): explicit scopeKind="factory" required; do not rely on DB default.
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

	await db
		.insert(factorySettings)
		.values({ key: "cost_cap", value: "20000", updatedAt: now })
		.onConflictDoNothing();
	await db
		.insert(factorySettings)
		.values({ key: "cost_cycle", value: "daily", updatedAt: now })
		.onConflictDoNothing();

	// X3: Seed soul prompt templates from docs/souls/ into factorySettings.
	// Templates are keyed by soul_template:<role>. Only roles with a matching
	// docs/souls/<role>.md file get a template. Roles without a file (builder,
	// growth, brand_voice) have no template — soul prompt textarea starts empty.
	//
	// @lore X3: We read files at seed time, not at runtime. The docs/ directory
	// is part of the repo and available during `npm run db:seed`. If a file is
	// missing, the template is silently skipped (graceful degradation). Process
	// CWD during seeding is the monorepo root where docs/ lives.
	const docsRoot = path.resolve(process.cwd(), "docs");
	// AB0: Extended with new role templates for builder, growth, designer, qa_engineer, ops.
	// @lore AD8a: chief-of-staff.md soul deleted — removed from template list.
	// AD8b adds assistant.md soul and re-inserts the entry with new role name.
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

	// X3: Backfill soulPrompt on existing agent rows from role-based templates.
	// AB0: Extended to include new template roles.
	// Idempotent: overwrites on repeated seed runs with the same template content.
	for (const [role, template] of Object.entries(templateValues)) {
		await db.update(users).set({ soulPrompt: template }).where(eq(users.role, role));
	}

	// AB0: Backfill agentCategory on existing agents (idempotent — safe to re-run).
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
		// @lore AD8a: Renamed "personal" → "individual". role string "chief_of_staff"
		// stays — AD8b renames it to "assistant".
		chief_of_staff: "individual", // @lore AD8a: role string renamed to "assistant" in AD8b
	};
	for (const [role, category] of Object.entries(categoryByRole)) {
		await db
			.update(users)
			.set({ agentCategory: category })
			.where(and(eq(users.role, role), eq(users.kind, "ai")));
	}

	// P2: founder_id, founder_name, founder_email factorySettings keys removed.
	// The human founder identity now lives in the users table (kind = 'human').
	// Auth middleware resolves from users WHERE kind = 'human' LIMIT 1.

	// --- H2: daily digest routine (disabled by default — operator enables) ---
	// @lore The routine lives at the seed level so the scheduler picks it up
	// without extra provisioning. `active: 0` means the scheduler will NOT
	// fire it until the operator flips the row; this prevents a fresh
	// factory from sending a 08:00 UTC digest the first time it boots.
	// @lore U1: `teamId` (formerly `productId`), `description` (formerly `pitch`),
	// status 'draft' (formerly 'shaped').
	await db
		.insert(bets)
		.values({
			id: "seed-bet-daily-digest",
			teamId: "seed-product-1",
			description: "Internal: daily digest scaffolding bet",
			appetite: "small",
			status: "draft",
			createdAt: now,
		})
		.onConflictDoNothing();

	// @lore U1: `teamId` (formerly `productId`). Old `teamId` (pointing at team_members) dropped.
	await db
		.insert(tasks)
		.values({
			id: "seed-task-daily-digest",
			betId: "seed-bet-daily-digest",
			teamId: "seed-product-1",
			ownerAgentId: "seed-agent-cos",
			title: "Daily digest anchor task",
			description: "Anchor task for the daily digest routine — emits routine_fired.",
			state: "ready",
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoNothing();

	await db
		.insert(routines)
		.values({
			id: "seed-routine-daily_digest",
			name: "Daily digest",
			teamId: "seed-product-1",
			state: "active",
			ownerAgentId: "seed-agent-cos",
			triggerType: "calendar",
			triggerConfig: JSON.stringify({
				cron: "0 8 * * *",
				taskId: "seed-task-daily-digest",
			}),
			active: false,
			delegationAllowed: false,
			humanReview: false,
			silent: true,
		})
		.onConflictDoNothing();

	// G4: built-in routines. Inserted directly (rather than calling
	// `seedBuiltinRoutines` from `@hyperidle/server`) because `@hyperidle/db`
	// must not depend on `@hyperidle/server` — that dependency direction is
	// reversed across the monorepo. The specs below are a replica of
	// `BUILTIN_SPECS` in `packages/server/src/services/builtin-routines.ts`;
	// keep them in sync. A schema test in
	// `packages/db/src/__tests__/seed.test.ts` pins the trigger_type per id
	// so drift is caught by CI.
	for (const spec of BUILTIN_ROUTINE_SEEDS) {
		await db
			.insert(routines)
			.values({
				id: spec.id,
				name: spec.name,
				teamId: spec.teamId,
				state: "active",
				ownerAgentId: spec.ownerAgentId,
				triggerType: spec.triggerType,
				triggerConfig: JSON.stringify(spec.triggerConfig),
				skillId: spec.skillId,
				doneCondition: spec.doneCondition,
				delegationAllowed: false,
				humanReview: spec.humanReview,
				silent: spec.silent,
				active: true,
			})
			.onConflictDoNothing();
	}
}
