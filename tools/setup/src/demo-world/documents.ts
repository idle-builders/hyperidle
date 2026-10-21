/**
 * The knowledge tree: one space per team. A space is the team's scope — its
 * top-level documents are the team's, nested under each other by parent. A
 * draft is a `proposed` document. Comments on a document live in its own
 * conversation (see conversations.ts).
 */

import { documents, type HyperIdleDb, subscriptions } from "@hyperidle/db";
import {
	BUILDER_ID,
	DESIGNER_ID,
	DOC_DEPLOY_RULE,
	DOC_HOW_WE_PRICE,
	DOC_JULY_THEMES,
	DOC_TEN_DAYS,
	FACILITATION_ID,
	FOUNDER_ID,
	GROWTH_ID,
	MAYA_ID,
	PRODUCT_TEAM_ID,
	SUPPORT_TEAM_ID,
} from "./ids.js";
import type { DemoClock } from "./time.js";

interface DocSpec {
	readonly id: string;
	readonly team: string;
	readonly parentId?: string;
	readonly title: string;
	readonly body: string;
	readonly draft?: boolean;
	readonly discipline?: string;
	readonly icon?: string;
	readonly createdBy: string;
	readonly createdDaysAgo: number;
	/** The last edit, when someone changed it after writing it. */
	readonly edited?: { readonly by: string; readonly at: string };
}

const DOC_ENGINEERING = "demo-doc-engineering";

export const TEN_DAYS_BODY =
	"Growth's option B shortens trials to 10 days. Before we decide, I want to know what we would lose.\n\n## What we know\n\n- Trials run 14 days, card up front.\n- Since the warning email, 27% more trials convert.\n- Most cancellations happen on day 13.\n\n## Decision\n\nNot yet.";

/** Who follows "Should trials be 10 days?" besides Finn, who wrote it: they are told when it is published. */
const TEN_DAYS_FOLLOWERS = [FOUNDER_ID, MAYA_ID, BUILDER_ID, GROWTH_ID, DESIGNER_ID];

export async function seedDocuments(db: HyperIdleDb, clock: DemoClock): Promise<void> {
	const specs: readonly DocSpec[] = [
		// ── Product ──────────────────────────────────────────────────────────
		{
			id: DOC_HOW_WE_PRICE,
			team: PRODUCT_TEAM_ID,
			title: "How we price",
			icon: "💷",
			body: "How we set our prices and what people pay. Each part is a document of its own: Trials, and Tiers and metering.",
			createdBy: FOUNDER_ID,
			createdDaysAgo: 90,
			edited: { by: GROWTH_ID, at: clock.daysAgo(2) },
		},
		{
			id: "demo-doc-trials",
			team: PRODUCT_TEAM_ID,
			parentId: DOC_HOW_WE_PRICE,
			title: "Trials",
			icon: "⏳",
			body: "Every plan starts with a 14-day trial. We ask for a card up front and say, before the trial ends, exactly when the first bill comes and how much it is.\n\nWe do not extend trials by hand.",
			createdBy: FOUNDER_ID,
			createdDaysAgo: 90,
			edited: { by: GROWTH_ID, at: clock.daysAgo(2) },
		},
		{
			id: "demo-doc-tiers",
			team: PRODUCT_TEAM_ID,
			parentId: DOC_HOW_WE_PRICE,
			title: "Tiers and metering",
			icon: "📊",
			body: "Three plans, side by side on the pricing page. The Team plan is £24 a month.\n\nA usage-based tier is being built: we meter what a team uses and bill it with the month.",
			createdBy: FOUNDER_ID,
			createdDaysAgo: 88,
		},
		{
			id: DOC_TEN_DAYS,
			team: PRODUCT_TEAM_ID,
			parentId: DOC_HOW_WE_PRICE,
			title: "Should trials be 10 days?",
			icon: "🤔",
			body: TEN_DAYS_BODY,
			draft: true,
			discipline: "Growth",
			createdBy: FOUNDER_ID,
			createdDaysAgo: 1,
		},
		{
			id: "demo-doc-clean-feature",
			team: PRODUCT_TEAM_ID,
			title: "What a clean feature looks like",
			body: "A clean feature does one thing and says what it did. It ships with its tests, it can be switched off, and a customer can tell what changed.",
			createdBy: FOUNDER_ID,
			createdDaysAgo: 85,
		},
		{
			id: DOC_ENGINEERING,
			team: PRODUCT_TEAM_ID,
			title: "Engineering",
			icon: "🛠️",
			body: "How we build and ship.",
			createdBy: FOUNDER_ID,
			createdDaysAgo: 85,
		},
		{
			id: DOC_DEPLOY_RULE,
			team: PRODUCT_TEAM_ID,
			parentId: DOC_ENGINEERING,
			title: "Deploy rule",
			body: "No deploys after 15:00 on a Friday. If something has to go out, the person who ships it stays until it is checked.\n\nComes from two Friday deploys that were rolled back in August.",
			draft: true,
			createdBy: FACILITATION_ID,
			createdDaysAgo: 1,
			edited: { by: FACILITATION_ID, at: clock.hoursAgo(4) },
		},
		{
			id: "demo-doc-tracing",
			team: PRODUCT_TEAM_ID,
			parentId: DOC_ENGINEERING,
			title: "Tracing the codebase",
			body: "Start from the page a customer sees, follow the call to the server, then to the table it reads. Write down each step as you go.",
			createdBy: BUILDER_ID,
			createdDaysAgo: 60,
		},
		// ── Support ──────────────────────────────────────────────────────────
		{
			id: DOC_JULY_THEMES,
			team: SUPPORT_TEAM_ID,
			title: "July support themes",
			body: "84 tickets in July. The top theme was trial-end billing: people could not tell what they would pay when the trial ended. Then invoices, then seats.",
			createdBy: MAYA_ID,
			createdDaysAgo: 5,
			edited: { by: MAYA_ID, at: clock.daysAgo(3) },
		},
		{
			id: "demo-doc-refund-wording",
			team: SUPPORT_TEAM_ID,
			title: "Refund wording",
			body: "If you ask within 14 days of a payment, we refund it in full.\n\nAfter that, we refund the days you have not used.",
			draft: true,
			createdBy: DESIGNER_ID,
			createdDaysAgo: 1,
			edited: { by: DESIGNER_ID, at: clock.hoursAgo(2) },
		},
	];

	for (const [position, doc] of specs.entries()) {
		const createdAt = clock.daysAgo(doc.createdDaysAgo);
		await db
			.insert(documents)
			.values({
				id: doc.id,
				scopeKind: "team",
				scopeId: doc.team,
				title: doc.title,
				body: doc.body,
				format: "markdown",
				status: doc.draft ? "proposed" : "active",
				slot: "ordinary",
				parentKind: doc.parentId ? "document" : null,
				parentId: doc.parentId ?? null,
				position,
				version: doc.edited ? 2 : 1,
				discipline: doc.discipline ?? null,
				icon: doc.icon ?? null,
				updatedBy: doc.edited?.by ?? doc.createdBy,
				createdAt,
				updatedAt: doc.edited?.at ?? createdAt,
			})
			.onConflictDoNothing();
	}

	for (const userId of TEN_DAYS_FOLLOWERS)
		await db
			.insert(subscriptions)
			.values({
				id: `demo-sub-follow-ten-days-${userId}`,
				userId,
				event: "document.changed",
				objectId: DOC_TEN_DAYS,
				schedule: null,
				paused: false,
				nextRunAt: null,
				createdAt: clock.daysAgo(1),
				updatedAt: clock.daysAgo(1),
			})
			.onConflictDoNothing();
}
