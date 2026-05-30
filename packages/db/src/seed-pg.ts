import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
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
} from "./schema.pg.js";
import {
	BUILTIN_ROUTINE_SEEDS,
	COMMUNITY_DISPLAY_NAMES,
	FACILITATOR_TOOLS,
	PRACTICE_COMMUNITIES,
} from "./seed-fixtures.js";

/**
 * @lore I3 (TRACK-I.md L161-164): the PG seed must produce the same logical
 * fixture set as the SQLite `seed()` so existing fixture-driven tests can
 * run against either dialect. Boolean columns are PG-native here (true /
 * false), per the I3 schema alignment.
 *
 * The function accepts any PG-flavoured Drizzle instance (postgres-js,
 * pglite). Each statement uses `.onConflictDoNothing()` for idempotency so
 * `seedPg(db)` can be called repeatedly without error.
 *
 * @lore U1: Updated to use `teams` (formerly `products`) and `teamMembers`
 * (formerly `teams`). `description` (formerly `pitch`), `teamId` (formerly `productId`),
 * status 'draft' (formerly 'shaped').
 */
export type SeedablePgDb = PgDatabase<PgQueryResultHKT, Record<string, never>>;

export async function seedPg(db: SeedablePgDb): Promise<void> {
	const now = new Date().toISOString();

	// @lore U1: insert into `teams` (formerly `products`).
	await db
		.insert(teams)
		.values({ id: "seed-product-1", name: "Nimmly", phase: "build", createdAt: now })
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

	// P2: Seed the human founder user row.
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
			status: "active",
			maxConcurrentSessions: 3,
			teamId: "seed-team-1",
			createdAt: now,
		})
		.onConflictDoNothing();

	await db
		.insert(users)
		.values({
			id: "seed-agent-cos",
			kind: "ai",
			name: "Chief of Staff",
			role: "chief_of_staff",
			status: "active",
			maxConcurrentSessions: 1,
			createdAt: now,
		})
		.onConflictDoNothing();

	// L20: system:propagation user — authors review threads when bets enter review.
	// FK constraint: messages.senderId references users.id. This user must exist
	// before any propagation-triggered review thread can be created.
	await db
		.insert(users)
		.values({
			id: "system:propagation",
			kind: "ai",
			name: "Propagation System",
			role: "system",
			status: "active",
			maxConcurrentSessions: 1,
			createdAt: now,
		})
		.onConflictDoNothing();

	// Patch the existing Chief of Staff row with G1 facilitator metadata.
	await db
		.update(users)
		.set({
			soulPromptPath: "docs/souls/chief-of-staff.md",
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

	// Practice Facilitators — one per community of practice.
	for (const community of PRACTICE_COMMUNITIES) {
		await db
			.insert(users)
			.values({
				id: `seed-agent-pf-${community}`,
				kind: "ai",
				name: `${COMMUNITY_DISPLAY_NAMES[community]} Practice Facilitator`,
				role: "practice_facilitator",
				teamId: null,
				status: "active",
				maxConcurrentSessions: 1,
				soulPromptPath: "docs/souls/practice-facilitator.md",
				skills: JSON.stringify({
					scope: community,
					tools: FACILITATOR_TOOLS,
				}),
				createdAt: now,
			})
			.onConflictDoNothing();
	}

	// @lore U1: update teamMembers (formerly teams).
	await db
		.update(teamMembers)
		.set({ leadAgentId: "seed-agent-builder" })
		.where(eq(teamMembers.id, "seed-team-1"));

	// @lore O2: kernel/strategy separation. Kernel table gets identity+content only.
	// Strategy fields (layer, kind) go to knowledgeStrategyFabric extension table.
	await db
		.insert(knowledgeItems)
		.values({
			id: "seed-ki-1",
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

	// P2: founder_id, founder_name, founder_email factorySettings keys removed.
	// The human founder identity now lives in the users table (kind = 'human').

	// --- H2: daily-digest scaffolding bet/task/routine ---
	// @lore U1: `teamId` (formerly `productId`), `description` (formerly `pitch`),
	// status 'draft' (formerly 'shaped'). Old `teamId` (pointing at team_members) dropped.
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

	// G4: built-in routines.
	for (const spec of BUILTIN_ROUTINE_SEEDS) {
		await db
			.insert(routines)
			.values({
				id: spec.id,
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
