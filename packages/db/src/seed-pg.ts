import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
	actors,
	agents,
	bets,
	factorySettings,
	items,
	knowledgeItems,
	products,
	routines,
	tasks,
	teams,
	threads,
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
 */
export type SeedablePgDb = PgDatabase<PgQueryResultHKT, Record<string, never>>;

export async function seedPg(db: SeedablePgDb): Promise<void> {
	const now = new Date().toISOString();

	// L2: founder actors. Idempotent.
	await db
		.insert(actors)
		.values({
			id: "actor:ceo",
			role: "CEO",
			domainTags: JSON.stringify(["market", "growth", "portfolio"]),
			createdAt: now,
		})
		.onConflictDoNothing();
	await db
		.insert(actors)
		.values({
			id: "actor:cpo",
			role: "CPO",
			domainTags: JSON.stringify(["product", "design", "tech", "content"]),
			createdAt: now,
		})
		.onConflictDoNothing();

	await db
		.insert(products)
		.values({ id: "seed-product-1", name: "Nimmly", phase: "build", createdAt: now })
		.onConflictDoNothing();

	await db
		.insert(teams)
		.values({
			id: "seed-team-1",
			productId: "seed-product-1",
			capacity: 5,
			activeBets: 0,
			formedAt: now,
		})
		.onConflictDoNothing();

	await db
		.insert(agents)
		.values({
			id: "seed-agent-builder",
			name: "Nimmly Builder",
			role: "builder",
			status: "active",
			maxConcurrentSessions: 3,
			teamId: "seed-team-1",
			createdAt: now,
		})
		.onConflictDoNothing();

	await db
		.insert(agents)
		.values({
			id: "seed-agent-cos",
			name: "Chief of Staff",
			role: "chief_of_staff",
			status: "active",
			maxConcurrentSessions: 1,
			createdAt: now,
		})
		.onConflictDoNothing();

	// Patch the existing Chief of Staff row with G1 facilitator metadata.
	await db
		.update(agents)
		.set({
			soulPromptPath: "docs/souls/chief-of-staff.md",
			skills: JSON.stringify({ scope: null, tools: FACILITATOR_TOOLS }),
		})
		.where(eq(agents.id, "seed-agent-cos"));

	// Product Manager — scoped to seed-product-1.
	await db
		.insert(agents)
		.values({
			id: "seed-agent-pm-nimmly",
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
			.insert(agents)
			.values({
				id: `seed-agent-pf-${community}`,
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

	await db
		.update(teams)
		.set({ leadAgentId: "seed-agent-builder" })
		.where(eq(teams.id, "seed-team-1"));

	await db
		.insert(knowledgeItems)
		.values({
			id: "seed-ki-1",
			layer: "L4",
			kind: "principle",
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
		.insert(factorySettings)
		.values({ key: "cost_cap", value: "20000", updatedAt: now })
		.onConflictDoNothing();
	await db
		.insert(factorySettings)
		.values({ key: "cost_cycle", value: "daily", updatedAt: now })
		.onConflictDoNothing();

	// --- H2: daily-digest scaffolding bet/task/routine ---
	await db
		.insert(bets)
		.values({
			id: "seed-bet-daily-digest",
			productId: "seed-product-1",
			teamId: "seed-team-1",
			pitch: "Internal: daily digest scaffolding bet",
			appetite: "small",
			status: "shaped",
			createdAt: now,
		})
		.onConflictDoNothing();

	await db
		.insert(tasks)
		.values({
			id: "seed-task-daily-digest",
			betId: "seed-bet-daily-digest",
			productId: "seed-product-1",
			teamId: "seed-team-1",
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

	// L3: Conversations fixture (seed-parity with seed.ts seedL3ConversationsFixture).
	{
		const nowMs = Date.parse(now);
		const ts = (offsetMs: number): string => new Date(nowMs - offsetMs).toISOString();
		const threadFixtures = [
			{
				id: "seed-thread-review-1",
				kind: "review",
				pinned: false,
				participants: JSON.stringify(["seed-agent-builder"]),
				routedToActorId: "actor:ceo" as string | null,
				domainTag: "growth" as string | null,
				createdAt: ts(60_000),
				itemTitle: "Review: API rate-limit policy",
				itemBlocking: true,
				itemCreatedAt: ts(10_000),
			},
			{
				id: "seed-thread-review-2",
				kind: "review",
				pinned: false,
				participants: JSON.stringify(["seed-agent-pm-nimmly"]),
				routedToActorId: "actor:cpo" as string | null,
				domainTag: "product" as string | null,
				createdAt: ts(120_000),
				itemTitle: "Review: Onboarding copy revision",
				itemBlocking: false,
				itemCreatedAt: ts(20_000),
			},
			{
				id: "seed-thread-review-3",
				kind: "review",
				pinned: false,
				participants: JSON.stringify(["seed-agent-builder"]),
				routedToActorId: null as string | null,
				domainTag: null as string | null,
				createdAt: ts(180_000),
				itemTitle: "Review: Cost cap update",
				itemBlocking: false,
				itemCreatedAt: ts(30_000),
			},
			{
				id: "seed-thread-chat-coach",
				kind: "chat",
				pinned: true,
				participants: JSON.stringify(["seed-agent-cos"]),
				routedToActorId: null as string | null,
				domainTag: null as string | null,
				createdAt: ts(240_000),
				itemTitle: "Chat: Daily check-in",
				itemBlocking: false,
				itemCreatedAt: ts(5_000),
			},
		];

		for (const t of threadFixtures) {
			await db
				.insert(threads)
				.values({
					id: t.id,
					kind: t.kind,
					pinned: t.pinned,
					participants: t.participants,
					routedToActorId: t.routedToActorId,
					domainTag: t.domainTag,
					createdAt: t.createdAt,
				})
				.onConflictDoNothing();

			await db
				.insert(items)
				.values({
					id: `${t.id}-item-1`,
					title: t.itemTitle,
					body: null,
					blocking: t.itemBlocking,
					threadId: t.id,
					createdAt: t.itemCreatedAt,
				})
				.onConflictDoNothing();
		}
	}

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
