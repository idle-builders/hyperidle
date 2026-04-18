import { eq } from "drizzle-orm";
import type { HyperIdleDb } from "./connection.js";
import {
	agents,
	bets,
	factorySettings,
	knowledgeItems,
	products,
	routines,
	tasks,
	teams,
} from "./schema.js";

// @lore: Facilitator agents encode their scope in the `skills` JSON blob
// (shape: {"scope": "<community|product_id|null>", "tools": [...]}) because
// `agents` has no first-class `scope_id` column. See docs/work-packages/plans/G1-plan.md §2.
const FACILITATOR_TOOLS = [
	"route_item",
	"score_attention",
	"promote_knowledge",
	"create_conflict_review",
] as const;

const PRACTICE_COMMUNITIES = ["build", "product", "growth", "ops", "facilitation"] as const;
type PracticeCommunity = (typeof PRACTICE_COMMUNITIES)[number];

// Explicit display names keep seed output stable even if we later rename
// the community slugs; no need for a `capitalize()` helper.
const COMMUNITY_DISPLAY_NAMES: Record<PracticeCommunity, string> = {
	build: "Build",
	product: "Product",
	growth: "Growth",
	ops: "Ops",
	facilitation: "Facilitation",
};

/** Idempotent seed: ≥1 row per major table. */
export function seed(db: HyperIdleDb): void {
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
}
