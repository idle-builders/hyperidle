/**
 * AX1 — demo world work: seven root tasks across every lifecycle, twenty-nine
 * child tasks (including two grandchild tasks under TASK_PRICING_PAGE for
 * 3-level nesting), and the documents they produced.
 *
 * Root tasks have parentTaskId: null. Child tasks carry parentTaskId pointing at
 * the root task or (for grandchildren) at another child task, giving the tree its
 * maximum depth: root → child → grandchild.
 *
 * The story: Acme builds "Pulse", a customer-feedback analytics app. They
 * shipped a trial-extension initiative (validated), tuned search (partial),
 * killed a mobile spike honestly, and are now mid-flight on a pricing overhaul
 * — with one task in review and one blocked on the founder.
 */

import { type HyperIdleDb, tasks, threads } from "@hyperidle/db";
import {
	BUILDER_ID,
	DESIGNER_ID,
	DOC_CHURN_SIGNALS,
	GROWTH_ID,
	PM_ID,
	QA_ID,
	ROOT_TASK_CHURN,
	ROOT_TASK_DOWNGRADE,
	ROOT_TASK_MOBILE,
	ROOT_TASK_ONBOARDING,
	ROOT_TASK_PRICING,
	ROOT_TASK_SEARCH,
	ROOT_TASK_TRIAL,
	TASK_CHURN_DASH,
	TASK_CHURN_SIGNALS,
	TASK_DOWNGRADE_POLICY,
	TASK_DOWNGRADE_UI,
	TASK_MOBILE_PROTO,
	TASK_MOBILE_RESEARCH,
	TASK_MOBILE_SHELL,
	TASK_ONBOARD_AUDIT,
	TASK_ONBOARD_SEQUENCE,
	TASK_ONBOARD_TEMPLATES,
	TASK_ONBOARD_TRIGGER,
	TASK_PRICING_ANNUAL,
	TASK_PRICING_COPY,
	TASK_PRICING_METERING,
	TASK_PRICING_METRICS,
	TASK_PRICING_PAGE,
	TASK_PRICING_PAGE_DESKTOP,
	TASK_PRICING_PAGE_MOBILE,
	TASK_PRICING_RESEARCH,
	TASK_PRICING_TIERS,
	TASK_SEARCH_EVAL,
	TASK_SEARCH_PERSONALIZE,
	TASK_SEARCH_PROFILE,
	TASK_SEARCH_RANKING,
	TASK_TRIAL_BANNER,
	TASK_TRIAL_EMAIL,
	TASK_TRIAL_FLOW,
	TASK_TRIAL_HEURISTIC,
	TASK_TRIAL_MEASURE,
	TEAM_ID,
} from "./ids.js";
import type { DemoClock } from "./time.js";

/**
 * @lore Root tasks (parentTaskId: null) are the top-level work containers.
 * Valid states: proposed, in_progress, done, killed.
 */
interface RootTaskSpec {
	readonly id: string;
	readonly title: string;
	readonly description: string;
	readonly doneWhen: string;
	readonly state: "proposed" | "in_progress" | "done" | "killed";
	readonly createdAt: string;
	readonly completedAt?: string;
	readonly outcomeVerdict?: "met" | "met_with_rework" | "partially_met" | "not_met";
	readonly outcomeSummary?: string;
	readonly sourceDocumentId?: string;
}

interface TaskSpec {
	readonly id: string;
	/** parentTaskId: root task (parentTaskId: null) or any ancestor. */
	readonly parentTaskId: string;
	readonly ownerId: string;
	readonly title: string;
	readonly description: string;
	readonly doneWhen: string;
	readonly state: string;
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly dependencies?: readonly string[];
	readonly outcomeVerdict?: "met" | "met_with_rework" | "partially_met" | "not_met";
	readonly needsReview?: boolean;
}

export async function seedWork(db: HyperIdleDb, clock: DemoClock): Promise<void> {
	// ── Root tasks ───────────────────────────────────────────────────────────
	const rootTaskSpecs: readonly RootTaskSpec[] = [
		{
			id: ROOT_TASK_PRICING,
			title: "Pricing page overhaul",
			description: `# Pricing page overhaul

Pulse's pricing page still shows the three-tier structure from launch. Trial
users tell us they cannot tell what they would pay after the trial, and
support gets the same "which plan is right for us" question weekly.

**Shape:** collapse to two tiers (Starter, Team) with a visible comparison,
rewrite the page copy around outcomes instead of feature counts, and wire
annual billing with a founder-approved discount.

Out of scope: usage-based pricing, plan downgrades (separate task tree).`,
			doneWhen:
				"New pricing page live for two weeks; conversion measured against baseline; pricing-related support questions drop.",
			state: "in_progress",
			createdAt: clock.daysAgo(21),
		},
		{
			id: ROOT_TASK_ONBOARDING,
			title: "Onboarding email sequence",
			description: `# Onboarding email sequence

New signups get one welcome email and then silence. Activation (first saved
dashboard) sits at 34%. A short sequence — welcome, one setup nudge, one
value moment, one check-in — should move it.

**Shape:** four emails, triggered by behavior rather than fixed days,
written in the Pulse voice, measurable per step.`,
			doneWhen:
				"Sequence live for two cohorts; 14-day activation measured against the 34% baseline.",
			state: "in_progress",
			createdAt: clock.daysAgo(10),
		},
		{
			id: ROOT_TASK_CHURN,
			title: "Churn early-warning dashboard",
			description: `# Churn early-warning dashboard

Churned accounts show the same three signals in their final two weeks —
dashboard usage down, exports stop, the admin stops inviting teammates. We
know this from the postmortem; we just cannot see it in time.

**Shape:** a dashboard that scores each account against those signals and
lists the ten most at-risk accounts weekly.`,
			doneWhen: "Dashboard live; at-risk list reviewed for three consecutive weeks.",
			state: "proposed",
			createdAt: clock.daysAgo(6),
			sourceDocumentId: DOC_CHURN_SIGNALS,
		},
		{
			id: ROOT_TASK_DOWNGRADE,
			title: "Self-serve plan downgrades",
			description: `# Self-serve plan downgrades

Teams that shrink today email support and wait. A self-serve downgrade path
keeps them paying something instead of churning to zero.

**Shape:** downgrade in-app with prorated credit; retention offer only where
usage justifies it.`,
			doneWhen: "Downgrade flow live; cancellation reasons tracked for one month.",
			state: "proposed",
			createdAt: clock.daysAgo(4),
		},
		{
			id: ROOT_TASK_TRIAL,
			title: "Trial extension flow",
			description: `# Trial extension flow

Trials expire mid-evaluation for half our signups — they ask support for more
time, support grants it by hand. A self-serve extension (one click, one time,
with a reason) should convert evaluations that simply needed a week more.`,
			doneWhen: "Extension flow live; conversion of expiring trials measured for two weeks.",
			state: "done",
			createdAt: clock.daysAgo(40),
			completedAt: clock.daysAgo(14),
			outcomeVerdict: "met",
			outcomeSummary:
				"27% of expiring trials took the extension and 31% of those converted — the hypothesis held with room to spare. Support-granted extensions dropped to near zero. Kept: the one-time limit; dropped: the reason dropdown (nobody used it).",
		},
		{
			id: ROOT_TASK_SEARCH,
			title: "Search relevance tuning",
			description: `# Search relevance tuning

Search returns the right documents in the wrong order — users scroll past the
answer to find it. Re-rank on recency + title match, and build an eval loop so
we stop guessing.`,
			doneWhen: "Eval set of 50 real queries; top-3 hit rate measured before/after.",
			state: "done",
			createdAt: clock.daysAgo(35),
			completedAt: clock.daysAgo(20),
			outcomeVerdict: "partially_met",
			outcomeSummary:
				"Top-3 hit rate moved 54% → 71% — real, short of the 80% target. Recency mattered more than expected; personalization was killed mid-task as out of reach. The eval loop itself is the keeper: every future search change gets measured.",
		},
		{
			id: ROOT_TASK_MOBILE,
			title: "Native mobile spike",
			description: `# Native mobile spike

Explore a native mobile shell for Pulse — is the reach worth the build cost?
Research first, prototype only if the numbers say yes.`,
			doneWhen:
				"Go/no-go decision with evidence: usage patterns, competitor teardown, build-cost estimate.",
			state: "killed",
			createdAt: clock.daysAgo(30),
			completedAt: clock.daysAgo(8),
			outcomeVerdict: "not_met",
			outcomeSummary:
				"Mobile is 6% of sessions and mostly read-only — the responsive web app already covers it. A native shell would cost a quarter of the team's capacity for reach we do not have. Killed honestly; the teardown stays as knowledge.",
		},
	];

	for (const rt of rootTaskSpecs) {
		await db
			.insert(threads)
			.values({
				id: `thr-${rt.id}`,
				hostKind: "team",
				hostId: TEAM_ID,
				initiatorId: PM_ID,
				participants: "[]",
				lastActiveAt: rt.createdAt,
				createdAt: rt.createdAt,
			})
			.onConflictDoNothing();
		await db
			.insert(tasks)
			.values({
				id: rt.id,
				threadId: `thr-${rt.id}`,
				parentTaskId: null,
				teamId: TEAM_ID,
				title: rt.title,
				description: rt.description,
				doneWhen: JSON.stringify([
					{ id: `dw-${rt.id}`, what: rt.doneWhen, by: "check", state: "open", how: null },
				]),
				reasons: "[]",
				state: rt.state,
				createdAt: rt.createdAt,
				completedAt: rt.completedAt ?? null,
				outcomeVerdict: rt.outcomeVerdict ?? null,
				outcomeSummary: rt.outcomeSummary ?? null,
				outcomeRecordedAt: rt.completedAt ?? null,
				outcomeRecordedBy: rt.completedAt ? PM_ID : null,
				sourceDocumentId: rt.sourceDocumentId ?? null,
				updatedAt: rt.completedAt ?? rt.createdAt,
			})
			.onConflictDoNothing();
	}

	const taskSpecs: readonly TaskSpec[] = [
		// ── Pricing overhaul (in_progress, mid-flight) ────────────────────────
		{
			id: TASK_PRICING_RESEARCH,
			parentTaskId: ROOT_TASK_PRICING,
			ownerId: PM_ID,
			title: "Interview trial users about pricing confusion",
			description:
				"Talk to ten recent trial users. What did they think Pulse cost? Where did the page lose them?",
			doneWhen: "Ten interviews summarized with the three most common confusions named.",
			state: "done",
			createdAt: clock.daysAgo(20),
			updatedAt: clock.daysAgo(16),
			outcomeVerdict: "met",
		},
		{
			id: TASK_PRICING_TIERS,
			parentTaskId: ROOT_TASK_PRICING,
			ownerId: PM_ID,
			title: "Draft the two-tier structure and comparison",
			description:
				"Starter and Team tiers: what sits in each, what the comparison table shows, what happens at the boundary.",
			doneWhen: "Tier structure written up and founder-approved.",
			state: "done",
			createdAt: clock.daysAgo(18),
			updatedAt: clock.daysAgo(13),
			outcomeVerdict: "met",
		},
		{
			id: TASK_PRICING_PAGE,
			parentTaskId: ROOT_TASK_PRICING,
			ownerId: DESIGNER_ID,
			title: "Build the new pricing page",
			description:
				"Implement the two-tier page from the approved structure: comparison, FAQ, hero rework. Empty states and mobile widths included.",
			doneWhen: "Page rendered at all widths, copy final, awaiting review.",
			state: "review",
			createdAt: clock.daysAgo(13),
			updatedAt: clock.hoursAgo(5),
			needsReview: true,
		},
		// Grandchildren of TASK_PRICING_PAGE — 3-level nesting proof:
		//   ROOT_TASK_PRICING → TASK_PRICING_PAGE → TASK_PRICING_PAGE_{DESKTOP,MOBILE}
		// @lore BB1: These two rows are the deepest point in the tree.
		{
			id: TASK_PRICING_PAGE_DESKTOP,
			parentTaskId: TASK_PRICING_PAGE,
			ownerId: DESIGNER_ID,
			title: "Pricing page — desktop layout",
			description:
				"Finalize the desktop layout: two-tier card grid, FAQ accordion, hero. Pixel-perfect at 1440px and 1280px.",
			doneWhen: "Desktop layout approved by founder.",
			state: "in_progress",
			createdAt: clock.daysAgo(10),
			updatedAt: clock.hoursAgo(3),
		},
		{
			id: TASK_PRICING_PAGE_MOBILE,
			parentTaskId: TASK_PRICING_PAGE,
			ownerId: DESIGNER_ID,
			title: "Pricing page — mobile layout",
			description:
				"Finalize the mobile layout: stacked tiers, collapsible FAQ, thumb-zone CTAs. Covers 375px and 390px.",
			doneWhen: "Mobile layout approved and renders without overflow.",
			state: "accepted",
			createdAt: clock.daysAgo(9),
			updatedAt: clock.daysAgo(8),
		},
		{
			id: TASK_PRICING_COPY,
			parentTaskId: ROOT_TASK_PRICING,
			ownerId: GROWTH_ID,
			title: "Rewrite pricing copy around outcomes",
			description:
				"Replace feature-count copy with outcome copy: what a team can DO on each tier. Headlines, FAQ answers, CTA.",
			doneWhen: "All page copy rewritten and consistent with the brand-voice document.",
			state: "in_progress",
			createdAt: clock.daysAgo(9),
			updatedAt: clock.hoursAgo(1),
		},
		{
			id: TASK_PRICING_ANNUAL,
			parentTaskId: ROOT_TASK_PRICING,
			ownerId: BUILDER_ID,
			title: "Implement annual billing toggle",
			description:
				"Annual pricing with a discount toggle. Blocked: the discount percentage needs a founder decision (margin vs. conversion).",
			doneWhen: "Toggle live with the founder-approved discount; prorated upgrades handled.",
			state: "blocked",
			createdAt: clock.daysAgo(9),
			updatedAt: clock.hoursAgo(26),
		},
		{
			id: TASK_PRICING_METERING,
			parentTaskId: ROOT_TASK_PRICING,
			ownerId: BUILDER_ID,
			title: "Wire usage metering into the new tiers",
			description:
				"Enforce the tier limits (seats, dashboards) against the metering service. Depends on the annual-billing schema change.",
			doneWhen: "Limits enforced in staging with a test account over the boundary.",
			state: "hold",
			createdAt: clock.daysAgo(8),
			updatedAt: clock.daysAgo(8),
			dependencies: [TASK_PRICING_ANNUAL],
		},
		{
			id: TASK_PRICING_METRICS,
			parentTaskId: ROOT_TASK_PRICING,
			ownerId: QA_ID,
			title: "Set up conversion funnel measurement",
			description:
				"Baseline the trial-to-paid funnel now, so the task's done-condition is measurable when the page ships.",
			doneWhen: "Funnel dashboard live with two weeks of baseline.",
			state: "accepted",
			createdAt: clock.daysAgo(7),
			updatedAt: clock.daysAgo(6),
		},
		// ── Onboarding emails (active, early) ──────────────────────────────
		{
			id: TASK_ONBOARD_AUDIT,
			parentTaskId: ROOT_TASK_ONBOARDING,
			ownerId: PM_ID,
			title: "Audit the current signup-to-activation path",
			description:
				"Walk the funnel step by step, find where the 66% drop, and name the moment the product first shows value.",
			doneWhen: "Funnel audit written up with the drop-off points named.",
			state: "done",
			createdAt: clock.daysAgo(9),
			updatedAt: clock.daysAgo(6),
			outcomeVerdict: "met",
		},
		{
			id: TASK_ONBOARD_SEQUENCE,
			parentTaskId: ROOT_TASK_ONBOARDING,
			ownerId: GROWTH_ID,
			title: "Write the four-email sequence",
			description:
				"Welcome, setup nudge, value moment, check-in — behavior-triggered, one idea per email, subject lines A/B ready.",
			doneWhen: "All four emails written, reviewed against the brand voice, triggers specified.",
			state: "in_progress",
			createdAt: clock.daysAgo(6),
			updatedAt: clock.hoursAgo(2),
		},
		{
			id: TASK_ONBOARD_TEMPLATES,
			parentTaskId: ROOT_TASK_ONBOARDING,
			ownerId: DESIGNER_ID,
			title: "Design the email templates",
			description:
				"One responsive template, four skins. Dark-mode safe, no images that spam filters eat.",
			doneWhen: "Template renders cleanly in the five test clients.",
			state: "accepted",
			createdAt: clock.daysAgo(5),
			updatedAt: clock.daysAgo(4),
		},
		{
			id: TASK_ONBOARD_TRIGGER,
			parentTaskId: ROOT_TASK_ONBOARDING,
			ownerId: BUILDER_ID,
			title: "Wire behavior triggers for the sequence",
			description:
				"Trigger each email on the behavior spec (first login, no dashboard after 3 days, etc.), with suppression rules.",
			doneWhen: "Triggers fire in staging for a synthetic cohort.",
			state: "proposed",
			createdAt: clock.daysAgo(4),
			updatedAt: clock.daysAgo(4),
		},
		// ── Trial extension (completed, validated) ─────────────────────────
		{
			id: TASK_TRIAL_BANNER,
			parentTaskId: ROOT_TASK_TRIAL,
			ownerId: BUILDER_ID,
			title: "Trial-expiry banner and countdown",
			description: "In-app banner for the last five trial days, with the extension affordance.",
			doneWhen: "Banner shows at the right times and dismisses cleanly.",
			state: "done",
			createdAt: clock.daysAgo(39),
			updatedAt: clock.daysAgo(33),
			outcomeVerdict: "met",
		},
		{
			id: TASK_TRIAL_FLOW,
			parentTaskId: ROOT_TASK_TRIAL,
			ownerId: BUILDER_ID,
			title: "Self-serve extension flow",
			description:
				"One-click, one-time, seven days. Date math on the entitlement edge — mind the timezone boundary.",
			doneWhen: "Extension grants exactly seven days once; second attempt declines gracefully.",
			state: "done",
			createdAt: clock.daysAgo(38),
			updatedAt: clock.daysAgo(29),
			outcomeVerdict: "met",
		},
		{
			id: TASK_TRIAL_EMAIL,
			parentTaskId: ROOT_TASK_TRIAL,
			ownerId: GROWTH_ID,
			title: "Expiry email with extension offer",
			description: "Sent two days before expiry; extension link is the primary CTA.",
			doneWhen: "Email sends on schedule; link converts in staging.",
			state: "done",
			createdAt: clock.daysAgo(36),
			updatedAt: clock.daysAgo(27),
			outcomeVerdict: "met_with_rework",
		},
		{
			id: TASK_TRIAL_HEURISTIC,
			parentTaskId: ROOT_TASK_TRIAL,
			ownerId: PM_ID,
			title: "Decide who sees the extension offer",
			description:
				"Everyone expiring, or only accounts with real activity? Write the heuristic and the reason.",
			doneWhen: "Heuristic written, founder-approved.",
			state: "done",
			createdAt: clock.daysAgo(35),
			updatedAt: clock.daysAgo(30),
			outcomeVerdict: "met",
		},
		{
			id: TASK_TRIAL_MEASURE,
			parentTaskId: ROOT_TASK_TRIAL,
			ownerId: QA_ID,
			title: "Measure expiring-trial conversion",
			description:
				"Instrument the funnel: expiry → extension taken → conversion, plus the support baseline.",
			doneWhen: "Two weeks of data on the dashboard.",
			state: "done",
			createdAt: clock.daysAgo(33),
			updatedAt: clock.daysAgo(15),
			outcomeVerdict: "met",
		},
		// ── Search relevance (completed, partial) ──────────────────────────
		{
			id: TASK_SEARCH_PROFILE,
			parentTaskId: ROOT_TASK_SEARCH,
			ownerId: BUILDER_ID,
			title: "Profile real search queries",
			description:
				"Sample two weeks of queries; bucket by intent; find the ones that scroll past the answer.",
			doneWhen: "Query profile written with the failure buckets named.",
			state: "done",
			createdAt: clock.daysAgo(34),
			updatedAt: clock.daysAgo(30),
			outcomeVerdict: "met",
		},
		{
			id: TASK_SEARCH_RANKING,
			parentTaskId: ROOT_TASK_SEARCH,
			ownerId: BUILDER_ID,
			title: "Re-rank on recency and title match",
			description: "Weight recency and exact-title-match above body-match; keep it tunable.",
			doneWhen: "Re-ranking live behind a flag with weights in config.",
			state: "done",
			createdAt: clock.daysAgo(32),
			updatedAt: clock.daysAgo(24),
			outcomeVerdict: "met_with_rework",
		},
		{
			id: TASK_SEARCH_EVAL,
			parentTaskId: ROOT_TASK_SEARCH,
			ownerId: QA_ID,
			title: "Build the 50-query eval loop",
			description:
				"Real queries, expected results, top-3 hit rate — runnable before every search change.",
			doneWhen: "Eval set committed; baseline and post-change runs recorded.",
			state: "done",
			createdAt: clock.daysAgo(31),
			updatedAt: clock.daysAgo(21),
			outcomeVerdict: "partially_met",
		},
		{
			id: TASK_SEARCH_PERSONALIZE,
			parentTaskId: ROOT_TASK_SEARCH,
			ownerId: BUILDER_ID,
			title: "Personalize ranking by team usage",
			description:
				"Boost documents the searcher's team touches. Killed mid-task: out of reach for the appetite.",
			doneWhen: "Personalized ranking live.",
			state: "killed",
			createdAt: clock.daysAgo(30),
			updatedAt: clock.daysAgo(25),
		},
		// ── Mobile spike (killed) ──────────────────────────────────────────
		{
			id: TASK_MOBILE_RESEARCH,
			parentTaskId: ROOT_TASK_MOBILE,
			ownerId: PM_ID,
			title: "Mobile usage research and competitor teardown",
			description:
				"How much Pulse usage is mobile, what competitors ship, what a shell would cost.",
			doneWhen: "Research write-up with a go/no-go recommendation.",
			state: "done",
			createdAt: clock.daysAgo(29),
			updatedAt: clock.daysAgo(12),
			outcomeVerdict: "met",
		},
		{
			id: TASK_MOBILE_PROTO,
			parentTaskId: ROOT_TASK_MOBILE,
			ownerId: DESIGNER_ID,
			title: "Prototype the mobile shell",
			description:
				"Killed with the task — the research said no before a prototype was worth building.",
			doneWhen: "Clickable prototype of the two core screens.",
			state: "killed",
			createdAt: clock.daysAgo(26),
			updatedAt: clock.daysAgo(9),
		},
		{
			id: TASK_MOBILE_SHELL,
			parentTaskId: ROOT_TASK_MOBILE,
			ownerId: BUILDER_ID,
			title: "Spike the native shell",
			description: "Killed with the task.",
			doneWhen: "Shell boots and renders one dashboard.",
			state: "killed",
			createdAt: clock.daysAgo(26),
			updatedAt: clock.daysAgo(9),
		},
		// ── Drafts: proposed tasks ────────────────────────────────────────
		{
			id: TASK_DOWNGRADE_POLICY,
			parentTaskId: ROOT_TASK_DOWNGRADE,
			ownerId: PM_ID,
			title: "Write the downgrade policy",
			description: "Proration, credit, when a retention offer is honest and when it is not.",
			doneWhen: "Policy written and founder-approved.",
			state: "proposed",
			createdAt: clock.daysAgo(4),
			updatedAt: clock.daysAgo(4),
		},
		{
			id: TASK_DOWNGRADE_UI,
			parentTaskId: ROOT_TASK_DOWNGRADE,
			ownerId: DESIGNER_ID,
			title: "Design the downgrade flow",
			description: "In-app downgrade with confirmation and credit summary.",
			doneWhen: "Flow designed at desktop and mobile widths.",
			state: "proposed",
			createdAt: clock.daysAgo(4),
			updatedAt: clock.daysAgo(4),
		},
		{
			id: TASK_CHURN_SIGNALS,
			parentTaskId: ROOT_TASK_CHURN,
			ownerId: QA_ID,
			title: "Score accounts against the three churn signals",
			description:
				"Usage-down, exports-stopped, invites-stopped — weight them against last quarter's churns.",
			doneWhen: "Scoring validated against known churned accounts.",
			state: "proposed",
			createdAt: clock.daysAgo(6),
			updatedAt: clock.daysAgo(6),
		},
		{
			id: TASK_CHURN_DASH,
			parentTaskId: ROOT_TASK_CHURN,
			ownerId: BUILDER_ID,
			title: "Build the at-risk dashboard",
			description:
				"Ten most at-risk accounts, refreshed weekly, one click to the account's activity.",
			doneWhen: "Dashboard live with three weeks of lists reviewed.",
			state: "proposed",
			createdAt: clock.daysAgo(6),
			updatedAt: clock.daysAgo(6),
		},
	];

	for (const task of taskSpecs) {
		await db
			.insert(threads)
			.values({
				id: `thr-${task.id}`,
				hostKind: "team",
				hostId: TEAM_ID,
				initiatorId: task.ownerId,
				participants: "[]",
				lastActiveAt: task.createdAt,
				createdAt: task.createdAt,
			})
			.onConflictDoNothing();
		await db
			.insert(tasks)
			.values({
				id: task.id,
				threadId: `thr-${task.id}`,
				parentTaskId: task.parentTaskId,
				teamId: TEAM_ID,
				ownerAgentId: task.ownerId,
				title: task.title,
				description: task.description,
				doneWhen: JSON.stringify([
					{
						id: `dw-${task.id}`,
						what: task.doneWhen,
						by: task.needsReview === true ? "review" : "check",
						state: "open",
						how: null,
					},
				]),
				reasons: "[]",
				state: task.state,
				dependencies: task.dependencies ? JSON.stringify(task.dependencies) : null,
				createdAt: task.createdAt,
				updatedAt: task.updatedAt,
				outcomeVerdict: task.outcomeVerdict ?? null,
				outcomeRecordedAt: task.outcomeVerdict ? task.updatedAt : null,
				outcomeRecordedBy: task.outcomeVerdict ? PM_ID : null,
			})
			.onConflictDoNothing();
	}
}
