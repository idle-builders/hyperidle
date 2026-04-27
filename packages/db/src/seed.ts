import { eq } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type { HyperIdleDb } from "./connection.js";
import type * as schema from "./schema.js";
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
} from "./schema.js";
import {
	asBit01,
	BUILTIN_ROUTINE_SEEDS,
	COMMUNITY_DISPLAY_NAMES,
	FACILITATOR_TOOLS,
	PRACTICE_COMMUNITIES,
} from "./seed-fixtures.js";

// @lore `seed` accepts any synchronous SQLite Drizzle instance over our
// schema — better-sqlite3 and bun:sqlite both fit. Narrowing to
// `HyperIdleDb` (better-sqlite3 only) would force unsafe casts in the Bun
// setup path. `TRunResult` is `unknown` because the better-sqlite3 driver
// returns a `RunResult` and the bun:sqlite driver returns `void`; the seed
// discards the value.
export type SeedableDb = BaseSQLiteDatabase<"sync", unknown, typeof schema>;

// @lore: Facilitator agents encode their scope in the `skills` JSON blob
// (shape: {"scope": "<community|product_id|null>", "tools": [...]}) because
// `agents` has no first-class `scope_id` column. See docs/work-packages/plans/G1-plan.md §2.
// FACILITATOR_TOOLS / PRACTICE_COMMUNITIES / COMMUNITY_DISPLAY_NAMES live in
// `seed-fixtures.ts` so the PG seed can share them.

/** Idempotent seed: ≥1 row per major table. */
export function seed(db: SeedableDb | HyperIdleDb): void {
	const now = new Date().toISOString();

	// L2: founder actors. Idempotent — `onConflictDoNothing` matches the
	// pattern used by every other seed insert. The seed is the sole
	// writer of these rows; the L2 migration only creates the table.
	db.insert(actors)
		.values({
			id: "actor:ceo",
			role: "CEO",
			domainTags: JSON.stringify(["market", "growth", "portfolio"]),
			createdAt: now,
		})
		.onConflictDoNothing()
		.run();

	db.insert(actors)
		.values({
			id: "actor:cpo",
			role: "CPO",
			domainTags: JSON.stringify(["product", "design", "tech", "content"]),
			createdAt: now,
		})
		.onConflictDoNothing()
		.run();

	db.insert(products)
		.values({ id: "seed-product-1", name: "Nimmly", phase: "build", createdAt: now })
		.onConflictDoNothing()
		.run();

	db.insert(teams)
		.values({
			id: "seed-team-1",
			productId: "seed-product-1",
			capacity: 5,
			activeBets: 0,
			formedAt: now,
		})
		.onConflictDoNothing()
		.run();

	db.insert(agents)
		.values({
			id: "seed-agent-builder",
			name: "Nimmly Builder",
			role: "builder",
			status: "active",
			maxConcurrentSessions: 3,
			teamId: "seed-team-1",
			createdAt: now,
		})
		.onConflictDoNothing()
		.run();

	db.insert(agents)
		.values({
			id: "seed-agent-cos",
			name: "Chief of Staff",
			role: "chief_of_staff",
			status: "active",
			maxConcurrentSessions: 1,
			createdAt: now,
		})
		.onConflictDoNothing()
		.run();

	// Patch the existing Chief of Staff row with G1 facilitator metadata.
	// Idempotent: a second run writes the same values.
	db.update(agents)
		.set({
			soulPromptPath: "docs/souls/chief-of-staff.md",
			skills: JSON.stringify({ scope: null, tools: FACILITATOR_TOOLS }),
		})
		.where(eq(agents.id, "seed-agent-cos"))
		.run();

	// Product Manager — scoped to seed-product-1.
	db.insert(agents)
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
		.onConflictDoNothing()
		.run();

	// Practice Facilitators — one per community of practice.
	for (const community of PRACTICE_COMMUNITIES) {
		db.insert(agents)
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
			.onConflictDoNothing()
			.run();
	}

	db.update(teams)
		.set({ leadAgentId: "seed-agent-builder" })
		.where(eq(teams.id, "seed-team-1"))
		.run();

	db.insert(knowledgeItems)
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
		.onConflictDoNothing()
		.run();

	db.insert(factorySettings)
		.values({ key: "cost_cap", value: "20000", updatedAt: now })
		.onConflictDoNothing()
		.run();

	db.insert(factorySettings)
		.values({ key: "cost_cycle", value: "daily", updatedAt: now })
		.onConflictDoNothing()
		.run();

	// --- H2: daily digest routine (disabled by default — operator enables) ---
	// @lore The routine lives at the seed level so the scheduler picks it up
	// without extra provisioning. `active: 0` means the scheduler will NOT
	// fire it until the operator flips the row; this prevents a fresh
	// factory from sending a 08:00 UTC digest the first time it boots.
	db.insert(bets)
		.values({
			id: "seed-bet-daily-digest",
			productId: "seed-product-1",
			teamId: "seed-team-1",
			pitch: "Internal: daily digest scaffolding bet",
			appetite: "small",
			status: "shaped",
			createdAt: now,
		})
		.onConflictDoNothing()
		.run();

	db.insert(tasks)
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
		.onConflictDoNothing()
		.run();

	db.insert(routines)
		.values({
			id: "seed-routine-daily_digest",
			ownerAgentId: "seed-agent-cos",
			triggerType: "calendar",
			triggerConfig: JSON.stringify({
				cron: "0 8 * * *",
				taskId: "seed-task-daily-digest",
			}),
			active: 0,
			delegationAllowed: 0,
			humanReview: 0,
			silent: 1,
		})
		.onConflictDoNothing()
		.run();

	// G4: built-in routines. Inserted directly (rather than calling
	// `seedBuiltinRoutines` from `@hyperidle/server`) because `@hyperidle/db`
	// must not depend on `@hyperidle/server` — that dependency direction is
	// reversed across the monorepo. The specs below are a replica of
	// `BUILTIN_SPECS` in `packages/server/src/services/builtin-routines.ts`;
	// keep them in sync. A schema test in
	// `packages/db/src/__tests__/seed.test.ts` pins the trigger_type per id
	// so drift is caught by CI.
	seedBuiltinRoutines(db, now);

	// L3: seed 3 review threads + 1 chat thread so the Conversations
	// submenu has rows to render in the e2e fixture. Idempotent via
	// onConflictDoNothing — re-running the seed is a no-op.
	//
	// @lore L3: Item timestamps are spread (NOW - 30s, NOW - 20s, NOW - 10s,
	// NOW - 5s) so `lastActivityAt` ordering is deterministic in tests. The
	// chat thread participates with the Coach/CoS agent so the sticky-pin
	// affordance has data to consume once L9 ships visual gating.
	seedL3ConversationsFixture(db, now);
}

function seedL3ConversationsFixture(db: SeedableDb | HyperIdleDb, now: string): void {
	const nowMs = Date.parse(now);
	const ts = (offsetMs: number): string => new Date(nowMs - offsetMs).toISOString();

	// Three review threads — one routed to CEO (blocking), one to CPO,
	// one unrouted.
	const threadFixtures = [
		{
			id: "seed-thread-review-1",
			kind: "review",
			pinned: 0,
			participants: JSON.stringify(["seed-agent-builder"]),
			routedToActorId: "actor:ceo",
			domainTag: "growth",
			createdAt: ts(60_000),
			itemTitle: "Review: API rate-limit policy",
			itemBlocking: 1,
			itemCreatedAt: ts(10_000),
		},
		{
			id: "seed-thread-review-2",
			kind: "review",
			pinned: 0,
			participants: JSON.stringify(["seed-agent-pm-nimmly"]),
			routedToActorId: "actor:cpo",
			domainTag: "product",
			createdAt: ts(120_000),
			itemTitle: "Review: Onboarding copy revision",
			itemBlocking: 0,
			itemCreatedAt: ts(20_000),
		},
		{
			id: "seed-thread-review-3",
			kind: "review",
			pinned: 0,
			participants: JSON.stringify(["seed-agent-builder"]),
			routedToActorId: null as string | null,
			domainTag: null as string | null,
			createdAt: ts(180_000),
			itemTitle: "Review: Cost cap update",
			itemBlocking: 0,
			itemCreatedAt: ts(30_000),
		},
		{
			id: "seed-thread-chat-coach",
			kind: "chat",
			pinned: 1,
			participants: JSON.stringify(["seed-agent-cos"]),
			routedToActorId: null as string | null,
			domainTag: null as string | null,
			createdAt: ts(240_000),
			itemTitle: "Chat: Daily check-in",
			itemBlocking: 0,
			itemCreatedAt: ts(5_000),
		},
	];

	for (const t of threadFixtures) {
		db.insert(threads)
			.values({
				id: t.id,
				kind: t.kind,
				pinned: t.pinned,
				participants: t.participants,
				routedToActorId: t.routedToActorId,
				domainTag: t.domainTag,
				createdAt: t.createdAt,
			})
			.onConflictDoNothing()
			.run();

		db.insert(items)
			.values({
				id: `${t.id}-item-1`,
				title: t.itemTitle,
				body: null,
				blocking: t.itemBlocking,
				threadId: t.id,
				createdAt: t.itemCreatedAt,
			})
			.onConflictDoNothing()
			.run();
	}
}

function seedBuiltinRoutines(db: SeedableDb | HyperIdleDb, _now: string): void {
	for (const spec of BUILTIN_ROUTINE_SEEDS) {
		db.insert(routines)
			.values({
				id: spec.id,
				ownerAgentId: spec.ownerAgentId,
				triggerType: spec.triggerType,
				triggerConfig: JSON.stringify(spec.triggerConfig),
				skillId: spec.skillId,
				doneCondition: spec.doneCondition,
				delegationAllowed: 0,
				humanReview: asBit01(spec.humanReview),
				silent: asBit01(spec.silent),
				active: 1,
			})
			.onConflictDoNothing()
			.run();
	}
}
