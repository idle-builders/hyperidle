import { eq } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type { HyperIdleDb } from "./connection.js";
import type * as schema from "./schema.js";
import {
	bets,
	factorySettings,
	knowledgeItems,
	knowledgeStrategyFabric,
	products,
	routines,
	tasks,
	teams,
	users,
} from "./schema.js";
import {
	asBit01,
	BUILTIN_ROUTINE_SEEDS,
	COMMUNITY_DISPLAY_NAMES,
	FACILITATOR_TOOLS,
	PRACTICE_COMMUNITIES,
} from "./seed-fixtures.js";

// @lore N1: `seed` accepts any synchronous SQLite Drizzle instance over our
// schema. `TRunResult` is `unknown` because different Drizzle drivers
// return different types; the seed discards the value.
export type SeedableDb = BaseSQLiteDatabase<"sync", unknown, typeof schema>;

// @lore: Facilitator agents encode their scope in the `skills` JSON blob
// (shape: {"scope": "<community|product_id|null>", "tools": [...]}) because
// `agents` has no first-class `scope_id` column. See plans/work-packages/G1-plan.md §2.
// FACILITATOR_TOOLS / PRACTICE_COMMUNITIES / COMMUNITY_DISPLAY_NAMES live in
// `seed-fixtures.ts` so the PG seed can share them.

/** Idempotent seed: ≥1 row per major table. */
export function seed(db: SeedableDb | HyperIdleDb): void {
	const now = new Date().toISOString();

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

	// P2: Seed the human founder user row. This is the authenticated identity for
	// the auth middleware (users WHERE kind = 'human' LIMIT 1).
	db.insert(users)
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
		.onConflictDoNothing()
		.run();

	db.insert(users)
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
		.onConflictDoNothing()
		.run();

	db.insert(users)
		.values({
			id: "seed-agent-cos",
			kind: "ai",
			name: "Chief of Staff",
			role: "chief_of_staff",
			status: "active",
			maxConcurrentSessions: 1,
			createdAt: now,
		})
		.onConflictDoNothing()
		.run();

	// L20: system:propagation user — authors review threads when bets enter review.
	// FK constraint: messages.senderId references users.id. This user must exist
	// before any propagation-triggered review thread can be created.
	db.insert(users)
		.values({
			id: "system:propagation",
			kind: "ai",
			name: "Propagation System",
			role: "system",
			status: "active",
			maxConcurrentSessions: 1,
			createdAt: now,
		})
		.onConflictDoNothing()
		.run();

	// Patch the existing Chief of Staff row with G1 facilitator metadata.
	// Idempotent: a second run writes the same values.
	db.update(users)
		.set({
			soulPromptPath: "docs/souls/chief-of-staff.md",
			skills: JSON.stringify({ scope: null, tools: FACILITATOR_TOOLS }),
		})
		.where(eq(users.id, "seed-agent-cos"))
		.run();

	// Product Manager — scoped to seed-product-1.
	db.insert(users)
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
		.onConflictDoNothing()
		.run();

	// Practice Facilitators — one per community of practice.
	for (const community of PRACTICE_COMMUNITIES) {
		db.insert(users)
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
			.onConflictDoNothing()
			.run();
	}

	db.update(teams)
		.set({ leadAgentId: "seed-agent-builder" })
		.where(eq(teams.id, "seed-team-1"))
		.run();

	// @lore O2: kernel/strategy separation. Kernel table only gets identity+content.
	// Strategy fields (layer, kind) go to knowledgeStrategyFabric extension table.
	// @lore Q2: scopeKind defaults to "factory" (factory-level principle applies to all).
	db.insert(knowledgeItems)
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
		.onConflictDoNothing()
		.run();

	db.insert(knowledgeStrategyFabric)
		.values({
			id: "seed-ksf-1",
			knowledgeItemId: "seed-ki-1",
			layer: "L4",
			kind: "principle",
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

	// P2: founder_id, founder_name, founder_email factorySettings keys removed.
	// The human founder identity now lives in the users table (kind = 'human').
	// Auth middleware resolves from users WHERE kind = 'human' LIMIT 1.

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
