import { eq } from "drizzle-orm";
import type { HyperIdleDb } from "./connection.js";
import { agents, factorySettings, knowledgeItems, products, routines, teams } from "./schema.js";

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

interface BuiltinRoutineSeed {
	id: string;
	ownerAgentId: string;
	triggerType: "heartbeat" | "calendar" | "event";
	triggerConfig: Record<string, unknown>;
	skillId: string;
	doneCondition: string;
	humanReview: 0 | 1;
	silent: 0 | 1;
}

const BUILTIN_ROUTINE_SEEDS: readonly BuiltinRoutineSeed[] = [
	{
		id: "builtin:cost-sentinel",
		ownerAgentId: "seed-agent-cos",
		triggerType: "heartbeat",
		triggerConfig: { intervalSeconds: 900 },
		skillId: "cost_watchdog",
		doneCondition: "Factory cost spend is below warning threshold",
		humanReview: 0,
		silent: 1,
	},
	{
		id: "builtin:practice-meeting",
		ownerAgentId: "seed-agent-pf-facilitation",
		triggerType: "calendar",
		triggerConfig: { cron: "0 10 * * MON" },
		skillId: "practice_meeting",
		doneCondition: "3-turn practice meeting anchor created",
		humanReview: 0,
		silent: 0,
	},
	{
		id: "builtin:post-bet-retro",
		ownerAgentId: "seed-agent-pm-nimmly",
		triggerType: "event",
		triggerConfig: { eventType: "bet_shipped" },
		skillId: "bet_retro",
		doneCondition: "Review item comparing hypothesis vs reality written",
		humanReview: 1,
		silent: 0,
	},
	{
		id: "builtin:portfolio-retro",
		ownerAgentId: "seed-agent-cos",
		triggerType: "calendar",
		triggerConfig: { cron: "0 10 1-7 * MON" },
		skillId: "portfolio_retro",
		doneCondition: "Cross-product portfolio review item written",
		humanReview: 1,
		silent: 0,
	},
	{
		id: "builtin:knowledge-decay",
		ownerAgentId: "seed-agent-cos",
		triggerType: "calendar",
		triggerConfig: { cron: "0 2 * * *" },
		skillId: "knowledge_decay",
		doneCondition: "Stale knowledge items transitioned",
		humanReview: 0,
		silent: 1,
	},
];

function seedBuiltinRoutines(db: HyperIdleDb, _now: string): void {
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
				humanReview: spec.humanReview,
				silent: spec.silent,
				active: 1,
			})
			.onConflictDoNothing()
			.run();
	}
}
