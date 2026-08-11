/**
 * AX1 — demo world work: eight bets across every lifecycle, twenty-seven
 * tasks covering all eight states, and the artifacts they produced.
 *
 * The story: Acme builds "Pulse", a customer-feedback analytics app. They
 * shipped a trial-extension bet (validated), tuned search (partial), killed a
 * mobile spike honestly, and are now mid-flight on a pricing overhaul — with
 * one task in review and one blocked on the founder.
 */

import { artifacts, bets, type HyperIdleDb, tasks } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import {
	ART_MOBILE_RESEARCH,
	ART_ONBOARD_AUDIT,
	ART_PRICING_COPY,
	ART_PRICING_HERO,
	ART_PRICING_PAGE,
	ART_SEARCH_EVAL,
	ART_SEARCH_RANKING,
	ART_TRIAL_FLOW,
	ART_TRIAL_METRICS,
	BET_CHURN,
	BET_DIGEST,
	BET_DOWNGRADE,
	BET_MOBILE,
	BET_ONBOARDING,
	BET_PRICING,
	BET_SEARCH,
	BET_TRIAL,
	BUILDER_ID,
	DESIGNER_ID,
	GROWTH_ID,
	KI_CHURN_SIGNALS,
	PM_ID,
	QA_ID,
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

interface BetSpec {
	readonly id: string;
	readonly description: string;
	readonly hypothesis: string | null;
	readonly doneCondition: string;
	readonly status: "draft" | "active" | "completed" | "killed";
	readonly createdAt: string;
	readonly completedAt?: string;
	readonly outcomeVerdict?: "validated" | "refuted" | "partial" | "inconclusive";
	readonly outcomeSummary?: string;
	readonly sourceKnowledgeItemId?: string;
}

interface TaskSpec {
	readonly id: string;
	readonly betId: string;
	readonly ownerId: string;
	readonly title: string;
	readonly description: string;
	readonly doneCondition: string;
	readonly state: string;
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly dependencies?: readonly string[];
	readonly outcomeVerdict?: "met" | "met_with_rework" | "partially_met" | "not_met";
}

interface ArtifactSpec {
	readonly id: string;
	readonly producingTaskId: string;
	readonly kind: string;
	readonly label: string;
	readonly previewJson: string;
	readonly createdAt: string;
}

export async function seedWork(db: HyperIdleDb, clock: DemoClock): Promise<void> {
	const betSpecs: readonly BetSpec[] = [
		{
			id: BET_PRICING,
			description: `# Pricing page overhaul

Pulse's pricing page still shows the three-tier structure from launch. Trial
users tell us they cannot tell what they would pay after the trial, and
support gets the same "which plan is right for us" question weekly.

**Shape:** collapse to two tiers (Starter, Team) with a visible comparison,
rewrite the page copy around outcomes instead of feature counts, and wire
annual billing with a founder-approved discount.

Out of scope: usage-based pricing, plan downgrades (separate draft bet).`,
			hypothesis:
				"Simplifying to two tiers with a visible comparison lifts trial-to-paid conversion by 15% without raising churn.",
			doneCondition:
				"New pricing page live for two weeks; conversion measured against baseline; pricing-related support questions drop.",
			status: "active",
			createdAt: clock.daysAgo(21),
		},
		{
			id: BET_ONBOARDING,
			description: `# Onboarding email sequence

New signups get one welcome email and then silence. Activation (first saved
dashboard) sits at 34%. A short sequence — welcome, one setup nudge, one
value moment, one check-in — should move it.

**Shape:** four emails, triggered by behavior rather than fixed days,
written in the Pulse voice, measurable per step.`,
			hypothesis:
				"A four-email behavior-triggered sequence lifts 14-day activation from 34% to 45%.",
			doneCondition:
				"Sequence live for two cohorts; 14-day activation measured against the 34% baseline.",
			status: "active",
			createdAt: clock.daysAgo(10),
		},
		{
			id: BET_CHURN,
			description: `# Churn early-warning dashboard

Churned accounts show the same three signals in their final two weeks —
dashboard usage down, exports stop, the admin stops inviting teammates. We
know this from the postmortem; we just cannot see it in time.

**Shape:** a dashboard that scores each account against those signals and
lists the ten most at-risk accounts weekly.`,
			hypothesis:
				"Surfacing at-risk accounts weekly lets us intervene before half of the currently-surprising churns.",
			doneCondition: "Dashboard live; at-risk list reviewed for three consecutive weeks.",
			status: "draft",
			createdAt: clock.daysAgo(6),
			sourceKnowledgeItemId: KI_CHURN_SIGNALS,
		},
		{
			id: BET_DOWNGRADE,
			description: `# Self-serve plan downgrades

Teams that shrink today email support and wait. A self-serve downgrade path
keeps them paying something instead of churning to zero.

**Shape:** downgrade in-app with prorated credit; retention offer only where
usage justifies it.`,
			hypothesis:
				"Self-serve downgrades convert 30% of would-be cancellations into continued revenue.",
			doneCondition: "Downgrade flow live; cancellation reasons tracked for one month.",
			status: "draft",
			createdAt: clock.daysAgo(4),
		},
		{
			id: BET_TRIAL,
			description: `# Trial extension flow

Trials expire mid-evaluation for half our signups — they ask support for more
time, support grants it by hand. A self-serve extension (one click, one time,
with a reason) should convert evaluations that simply needed a week more.`,
			hypothesis:
				"A self-serve one-week trial extension converts 20% of expiring trials that would otherwise lapse.",
			doneCondition: "Extension flow live; conversion of expiring trials measured for two weeks.",
			status: "completed",
			createdAt: clock.daysAgo(40),
			completedAt: clock.daysAgo(14),
			outcomeVerdict: "validated",
			outcomeSummary:
				"27% of expiring trials took the extension and 31% of those converted — the hypothesis held with room to spare. Support-granted extensions dropped to near zero. Kept: the one-time limit; dropped: the reason dropdown (nobody used it).",
		},
		{
			id: BET_SEARCH,
			description: `# Search relevance tuning

Search returns the right documents in the wrong order — users scroll past the
answer to find it. Re-rank on recency + title match, and build an eval loop so
we stop guessing.`,
			hypothesis:
				"Re-ranking on recency and title match puts the clicked result in the top 3 for 80% of queries.",
			doneCondition: "Eval set of 50 real queries; top-3 hit rate measured before/after.",
			status: "completed",
			createdAt: clock.daysAgo(35),
			completedAt: clock.daysAgo(20),
			outcomeVerdict: "partial",
			outcomeSummary:
				"Top-3 hit rate moved 54% → 71% — real, short of the 80% target. Recency mattered more than expected; personalization was killed mid-bet as out of reach. The eval loop itself is the keeper: every future search change gets measured.",
		},
		{
			id: BET_MOBILE,
			description: `# Native mobile spike

Explore a native mobile shell for Pulse — is the reach worth the build cost?
Research first, prototype only if the numbers say yes.`,
			hypothesis:
				"A meaningful share of Pulse usage happens away from a desk, justifying a native shell.",
			doneCondition:
				"Go/no-go decision with evidence: usage patterns, competitor teardown, build-cost estimate.",
			status: "killed",
			createdAt: clock.daysAgo(30),
			completedAt: clock.daysAgo(8),
			outcomeVerdict: "refuted",
			outcomeSummary:
				"Mobile is 6% of sessions and mostly read-only — the responsive web app already covers it. A native shell would cost a quarter of the team's capacity for reach we do not have. Killed honestly; the teardown stays as knowledge.",
		},
	];

	for (const bet of betSpecs) {
		await db
			.insert(bets)
			.values({
				id: bet.id,
				teamId: TEAM_ID,
				description: bet.description,
				doneCondition: bet.doneCondition,
				hypothesis: bet.hypothesis,
				status: bet.status,
				createdAt: bet.createdAt,
				completedAt: bet.completedAt ?? null,
				outcomeVerdict: bet.outcomeVerdict ?? null,
				outcomeSummary: bet.outcomeSummary ?? null,
				outcomeRecordedAt: bet.completedAt ?? null,
				outcomeRecordedBy: bet.completedAt ? PM_ID : null,
				sourceKnowledgeItemId: bet.sourceKnowledgeItemId ?? null,
			})
			.onConflictDoNothing();
	}

	const taskSpecs: readonly TaskSpec[] = [
		// ── Pricing overhaul (active, mid-flight) ──────────────────────────
		{
			id: TASK_PRICING_RESEARCH,
			betId: BET_PRICING,
			ownerId: PM_ID,
			title: "Interview trial users about pricing confusion",
			description:
				"Talk to ten recent trial users. What did they think Pulse cost? Where did the page lose them?",
			doneCondition: "Ten interviews summarized with the three most common confusions named.",
			state: "done",
			createdAt: clock.daysAgo(20),
			updatedAt: clock.daysAgo(16),
			outcomeVerdict: "met",
		},
		{
			id: TASK_PRICING_TIERS,
			betId: BET_PRICING,
			ownerId: PM_ID,
			title: "Draft the two-tier structure and comparison",
			description:
				"Starter and Team tiers: what sits in each, what the comparison table shows, what happens at the boundary.",
			doneCondition: "Tier structure written up and founder-approved.",
			state: "done",
			createdAt: clock.daysAgo(18),
			updatedAt: clock.daysAgo(13),
			outcomeVerdict: "met",
		},
		{
			id: TASK_PRICING_PAGE,
			betId: BET_PRICING,
			ownerId: DESIGNER_ID,
			title: "Build the new pricing page",
			description:
				"Implement the two-tier page from the approved structure: comparison, FAQ, hero rework. Empty states and mobile widths included.",
			doneCondition: "Page rendered at all widths, copy final, awaiting review.",
			state: "review",
			createdAt: clock.daysAgo(13),
			updatedAt: clock.hoursAgo(5),
		},
		{
			id: TASK_PRICING_COPY,
			betId: BET_PRICING,
			ownerId: GROWTH_ID,
			title: "Rewrite pricing copy around outcomes",
			description:
				"Replace feature-count copy with outcome copy: what a team can DO on each tier. Headlines, FAQ answers, CTA.",
			doneCondition: "All page copy rewritten and consistent with the brand-voice knowledge item.",
			state: "in_progress",
			createdAt: clock.daysAgo(9),
			updatedAt: clock.hoursAgo(1),
		},
		{
			id: TASK_PRICING_ANNUAL,
			betId: BET_PRICING,
			ownerId: BUILDER_ID,
			title: "Implement annual billing toggle",
			description:
				"Annual pricing with a discount toggle. Blocked: the discount percentage needs a founder decision (margin vs. conversion).",
			doneCondition: "Toggle live with the founder-approved discount; prorated upgrades handled.",
			state: "blocked",
			createdAt: clock.daysAgo(9),
			updatedAt: clock.hoursAgo(26),
		},
		{
			id: TASK_PRICING_METERING,
			betId: BET_PRICING,
			ownerId: BUILDER_ID,
			title: "Wire usage metering into the new tiers",
			description:
				"Enforce the tier limits (seats, dashboards) against the metering service. Depends on the annual-billing schema change.",
			doneCondition: "Limits enforced in staging with a test account over the boundary.",
			state: "hold",
			createdAt: clock.daysAgo(8),
			updatedAt: clock.daysAgo(8),
			dependencies: [TASK_PRICING_ANNUAL],
		},
		{
			id: TASK_PRICING_METRICS,
			betId: BET_PRICING,
			ownerId: QA_ID,
			title: "Set up conversion funnel measurement",
			description:
				"Baseline the trial-to-paid funnel now, so the bet's done-condition is measurable when the page ships.",
			doneCondition: "Funnel dashboard live with two weeks of baseline.",
			state: "accepted",
			createdAt: clock.daysAgo(7),
			updatedAt: clock.daysAgo(6),
		},
		// ── Onboarding emails (active, early) ──────────────────────────────
		{
			id: TASK_ONBOARD_AUDIT,
			betId: BET_ONBOARDING,
			ownerId: PM_ID,
			title: "Audit the current signup-to-activation path",
			description:
				"Walk the funnel step by step, find where the 66% drop, and name the moment the product first shows value.",
			doneCondition: "Funnel audit written up with the drop-off points named.",
			state: "done",
			createdAt: clock.daysAgo(9),
			updatedAt: clock.daysAgo(6),
			outcomeVerdict: "met",
		},
		{
			id: TASK_ONBOARD_SEQUENCE,
			betId: BET_ONBOARDING,
			ownerId: GROWTH_ID,
			title: "Write the four-email sequence",
			description:
				"Welcome, setup nudge, value moment, check-in — behavior-triggered, one idea per email, subject lines A/B ready.",
			doneCondition:
				"All four emails written, reviewed against the brand voice, triggers specified.",
			state: "in_progress",
			createdAt: clock.daysAgo(6),
			updatedAt: clock.hoursAgo(2),
		},
		{
			id: TASK_ONBOARD_TEMPLATES,
			betId: BET_ONBOARDING,
			ownerId: DESIGNER_ID,
			title: "Design the email templates",
			description:
				"One responsive template, four skins. Dark-mode safe, no images that spam filters eat.",
			doneCondition: "Template renders cleanly in the five test clients.",
			state: "accepted",
			createdAt: clock.daysAgo(5),
			updatedAt: clock.daysAgo(4),
		},
		{
			id: TASK_ONBOARD_TRIGGER,
			betId: BET_ONBOARDING,
			ownerId: BUILDER_ID,
			title: "Wire behavior triggers for the sequence",
			description:
				"Trigger each email on the behavior spec (first login, no dashboard after 3 days, etc.), with suppression rules.",
			doneCondition: "Triggers fire in staging for a synthetic cohort.",
			state: "proposed",
			createdAt: clock.daysAgo(4),
			updatedAt: clock.daysAgo(4),
		},
		// ── Trial extension (completed, validated) ─────────────────────────
		{
			id: TASK_TRIAL_BANNER,
			betId: BET_TRIAL,
			ownerId: BUILDER_ID,
			title: "Trial-expiry banner and countdown",
			description: "In-app banner for the last five trial days, with the extension affordance.",
			doneCondition: "Banner shows at the right times and dismisses cleanly.",
			state: "done",
			createdAt: clock.daysAgo(39),
			updatedAt: clock.daysAgo(33),
			outcomeVerdict: "met",
		},
		{
			id: TASK_TRIAL_FLOW,
			betId: BET_TRIAL,
			ownerId: BUILDER_ID,
			title: "Self-serve extension flow",
			description:
				"One-click, one-time, seven days. Date math on the entitlement edge — mind the timezone boundary.",
			doneCondition:
				"Extension grants exactly seven days once; second attempt declines gracefully.",
			state: "done",
			createdAt: clock.daysAgo(38),
			updatedAt: clock.daysAgo(29),
			outcomeVerdict: "met",
		},
		{
			id: TASK_TRIAL_EMAIL,
			betId: BET_TRIAL,
			ownerId: GROWTH_ID,
			title: "Expiry email with extension offer",
			description: "Sent two days before expiry; extension link is the primary CTA.",
			doneCondition: "Email sends on schedule; link converts in staging.",
			state: "done",
			createdAt: clock.daysAgo(36),
			updatedAt: clock.daysAgo(27),
			outcomeVerdict: "met_with_rework",
		},
		{
			id: TASK_TRIAL_HEURISTIC,
			betId: BET_TRIAL,
			ownerId: PM_ID,
			title: "Decide who sees the extension offer",
			description:
				"Everyone expiring, or only accounts with real activity? Write the heuristic and the reason.",
			doneCondition: "Heuristic written, founder-approved.",
			state: "done",
			createdAt: clock.daysAgo(35),
			updatedAt: clock.daysAgo(30),
			outcomeVerdict: "met",
		},
		{
			id: TASK_TRIAL_MEASURE,
			betId: BET_TRIAL,
			ownerId: QA_ID,
			title: "Measure expiring-trial conversion",
			description:
				"Instrument the funnel: expiry → extension taken → conversion, plus the support baseline.",
			doneCondition: "Two weeks of data on the dashboard.",
			state: "done",
			createdAt: clock.daysAgo(33),
			updatedAt: clock.daysAgo(15),
			outcomeVerdict: "met",
		},
		// ── Search relevance (completed, partial) ──────────────────────────
		{
			id: TASK_SEARCH_PROFILE,
			betId: BET_SEARCH,
			ownerId: BUILDER_ID,
			title: "Profile real search queries",
			description:
				"Sample two weeks of queries; bucket by intent; find the ones that scroll past the answer.",
			doneCondition: "Query profile written with the failure buckets named.",
			state: "done",
			createdAt: clock.daysAgo(34),
			updatedAt: clock.daysAgo(30),
			outcomeVerdict: "met",
		},
		{
			id: TASK_SEARCH_RANKING,
			betId: BET_SEARCH,
			ownerId: BUILDER_ID,
			title: "Re-rank on recency and title match",
			description: "Weight recency and exact-title-match above body-match; keep it tunable.",
			doneCondition: "Re-ranking live behind a flag with weights in config.",
			state: "done",
			createdAt: clock.daysAgo(32),
			updatedAt: clock.daysAgo(24),
			outcomeVerdict: "met_with_rework",
		},
		{
			id: TASK_SEARCH_EVAL,
			betId: BET_SEARCH,
			ownerId: QA_ID,
			title: "Build the 50-query eval loop",
			description:
				"Real queries, expected results, top-3 hit rate — runnable before every search change.",
			doneCondition: "Eval set committed; baseline and post-change runs recorded.",
			state: "done",
			createdAt: clock.daysAgo(31),
			updatedAt: clock.daysAgo(21),
			outcomeVerdict: "partially_met",
		},
		{
			id: TASK_SEARCH_PERSONALIZE,
			betId: BET_SEARCH,
			ownerId: BUILDER_ID,
			title: "Personalize ranking by team usage",
			description:
				"Boost documents the searcher's team touches. Killed mid-bet: out of reach for the appetite.",
			doneCondition: "Personalized ranking live.",
			state: "killed",
			createdAt: clock.daysAgo(30),
			updatedAt: clock.daysAgo(25),
		},
		// ── Mobile spike (killed) ──────────────────────────────────────────
		{
			id: TASK_MOBILE_RESEARCH,
			betId: BET_MOBILE,
			ownerId: PM_ID,
			title: "Mobile usage research and competitor teardown",
			description:
				"How much Pulse usage is mobile, what competitors ship, what a shell would cost.",
			doneCondition: "Research write-up with a go/no-go recommendation.",
			state: "done",
			createdAt: clock.daysAgo(29),
			updatedAt: clock.daysAgo(12),
			outcomeVerdict: "met",
		},
		{
			id: TASK_MOBILE_PROTO,
			betId: BET_MOBILE,
			ownerId: DESIGNER_ID,
			title: "Prototype the mobile shell",
			description:
				"Killed with the bet — the research said no before a prototype was worth building.",
			doneCondition: "Clickable prototype of the two core screens.",
			state: "killed",
			createdAt: clock.daysAgo(26),
			updatedAt: clock.daysAgo(9),
		},
		{
			id: TASK_MOBILE_SHELL,
			betId: BET_MOBILE,
			ownerId: BUILDER_ID,
			title: "Spike the native shell",
			description: "Killed with the bet.",
			doneCondition: "Shell boots and renders one dashboard.",
			state: "killed",
			createdAt: clock.daysAgo(26),
			updatedAt: clock.daysAgo(9),
		},
		// ── Drafts: proposed tasks waiting on bet activation ───────────────
		{
			id: TASK_DOWNGRADE_POLICY,
			betId: BET_DOWNGRADE,
			ownerId: PM_ID,
			title: "Write the downgrade policy",
			description: "Proration, credit, when a retention offer is honest and when it is not.",
			doneCondition: "Policy written and founder-approved.",
			state: "proposed",
			createdAt: clock.daysAgo(4),
			updatedAt: clock.daysAgo(4),
		},
		{
			id: TASK_DOWNGRADE_UI,
			betId: BET_DOWNGRADE,
			ownerId: DESIGNER_ID,
			title: "Design the downgrade flow",
			description: "In-app downgrade with confirmation and credit summary.",
			doneCondition: "Flow designed at desktop and mobile widths.",
			state: "proposed",
			createdAt: clock.daysAgo(4),
			updatedAt: clock.daysAgo(4),
		},
		{
			id: TASK_CHURN_SIGNALS,
			betId: BET_CHURN,
			ownerId: QA_ID,
			title: "Score accounts against the three churn signals",
			description:
				"Usage-down, exports-stopped, invites-stopped — weight them against last quarter's churns.",
			doneCondition: "Scoring validated against known churned accounts.",
			state: "proposed",
			createdAt: clock.daysAgo(6),
			updatedAt: clock.daysAgo(6),
		},
		{
			id: TASK_CHURN_DASH,
			betId: BET_CHURN,
			ownerId: BUILDER_ID,
			title: "Build the at-risk dashboard",
			description:
				"Ten most at-risk accounts, refreshed weekly, one click to the account's activity.",
			doneCondition: "Dashboard live with three weeks of lists reviewed.",
			state: "proposed",
			createdAt: clock.daysAgo(6),
			updatedAt: clock.daysAgo(6),
		},
	];

	for (const task of taskSpecs) {
		await db
			.insert(tasks)
			.values({
				id: task.id,
				betId: task.betId,
				teamId: TEAM_ID,
				ownerAgentId: task.ownerId,
				title: task.title,
				description: task.description,
				doneCondition: task.doneCondition,
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

	// Backdate the skeleton's daily-digest bet so it sits inside the world's
	// history instead of "just now".
	await db
		.update(bets)
		.set({ createdAt: clock.daysAgo(19) })
		.where(eq(bets.id, BET_DIGEST));

	const artifactSpecs: readonly ArtifactSpec[] = [
		{
			id: ART_PRICING_PAGE,
			producingTaskId: TASK_PRICING_PAGE,
			kind: "html",
			label: "New pricing page — preview",
			previewJson: JSON.stringify({
				kind: "html",
				title: "Pricing — Pulse",
				html: "<section><h1>Simple pricing that scales with your team</h1><p>Two tiers. No surprises. Start free for 14 days.</p><table><tr><th></th><th>Starter</th><th>Team</th></tr><tr><td>Dashboards</td><td>5</td><td>Unlimited</td></tr><tr><td>Seats</td><td>3</td><td>Unlimited</td></tr><tr><td>Exports</td><td>Weekly</td><td>Continuous</td></tr></table></section>",
			}),
			createdAt: clock.hoursAgo(5),
		},
		{
			id: ART_PRICING_COPY,
			producingTaskId: TASK_PRICING_COPY,
			kind: "text",
			label: "Pricing copy — draft 2",
			previewJson: JSON.stringify({
				kind: "text",
				format: "markdown",
				body: "# Starter\n\nFor teams getting their first feedback loop running. Five dashboards, three seats, weekly exports.\n\n# Team\n\nFor teams that run on feedback. Unlimited dashboards and seats, continuous exports, priority support.\n\n> Both plans start with a 14-day trial. No card required.",
			}),
			createdAt: clock.hoursAgo(20),
		},
		{
			id: ART_PRICING_HERO,
			producingTaskId: TASK_PRICING_PAGE,
			kind: "image",
			label: "Pricing hero — option B",
			previewJson: JSON.stringify({
				kind: "image",
				url: "https://acme.example/assets/pricing-hero-b.png",
				width: 1600,
				height: 900,
				alt: "Pricing page hero with two tier cards",
			}),
			createdAt: clock.daysAgo(2),
		},
		{
			id: ART_TRIAL_FLOW,
			producingTaskId: TASK_TRIAL_FLOW,
			kind: "code",
			label: "trial/extend.ts — entitlement date math",
			previewJson: JSON.stringify({
				kind: "code",
				path: "src/trial/extend.ts",
				lang: "typescript",
				text: "export function extendTrial(entitlement: Entitlement, now: Date): Entitlement {\n  if (entitlement.extensionUsed) {\n    return entitlement; // one-time: decline gracefully\n  }\n  const until = addDaysUtc(entitlement.expiresAt, 7, TZ_UTC);\n  return { ...entitlement, expiresAt: until, extensionUsed: true };\n}",
			}),
			createdAt: clock.daysAgo(29),
		},
		{
			id: ART_TRIAL_METRICS,
			producingTaskId: TASK_TRIAL_MEASURE,
			kind: "data",
			label: "Expiring-trial conversion — two weeks",
			previewJson: JSON.stringify({
				kind: "data",
				headlines: [
					{ label: "Extensions taken", value: "27%" },
					{ label: "Of those, converted", value: "31%" },
					{ label: "Support-granted extensions", value: "-92%" },
				],
				charts: [{ label: "Daily extensions", values: [2, 3, 1, 4, 5, 3, 6, 4, 5, 7, 6, 8, 7, 9] }],
			}),
			createdAt: clock.daysAgo(15),
		},
		{
			id: ART_SEARCH_RANKING,
			producingTaskId: TASK_SEARCH_RANKING,
			kind: "code",
			label: "search/rank.ts — weight config",
			previewJson: JSON.stringify({
				kind: "code",
				path: "src/search/rank.ts",
				lang: "typescript",
				text: "export const RANK_WEIGHTS = {\n  recency: 0.45,\n  titleMatch: 0.35,\n  bodyMatch: 0.2,\n} as const;\n\nexport function score(hit: SearchHit, now: number): number {\n  return (\n    RANK_WEIGHTS.recency * recencyScore(hit.updatedAt, now) +\n    RANK_WEIGHTS.titleMatch * hit.titleScore +\n    RANK_WEIGHTS.bodyMatch * hit.bodyScore\n  );\n}",
			}),
			createdAt: clock.daysAgo(24),
		},
		{
			id: ART_SEARCH_EVAL,
			producingTaskId: TASK_SEARCH_EVAL,
			kind: "data",
			label: "Search eval — top-3 hit rate",
			previewJson: JSON.stringify({
				kind: "data",
				headlines: [
					{ label: "Baseline top-3", value: "54%" },
					{ label: "After re-rank", value: "71%" },
					{ label: "Queries", value: "50" },
				],
				charts: [{ label: "Hit rate by bucket", values: [54, 58, 63, 66, 71] }],
			}),
			createdAt: clock.daysAgo(21),
		},
		{
			id: ART_ONBOARD_AUDIT,
			producingTaskId: TASK_ONBOARD_AUDIT,
			kind: "text",
			label: "Signup-to-activation funnel audit",
			previewJson: JSON.stringify({
				kind: "text",
				format: "markdown",
				body: "## Where the 66% drop\n\n1. **Signup → first login: 91%** — fine.\n2. **First login → connect a source: 58%** — the big cliff. The connect screen assumes a data source exists.\n3. **Connect → first saved dashboard: 72%** — recoverable with a template.\n\nThe value moment is the first saved dashboard. Everything before it is friction budget.",
			}),
			createdAt: clock.daysAgo(6),
		},
		{
			id: ART_MOBILE_RESEARCH,
			producingTaskId: TASK_MOBILE_RESEARCH,
			kind: "url",
			label: "Mobile research write-up",
			previewJson: JSON.stringify({
				kind: "url",
				url: "https://acme.example/research/mobile-spike",
				status: "ok",
				statusLabel: "Published",
			}),
			createdAt: clock.daysAgo(12),
		},
	];

	for (const artifact of artifactSpecs) {
		await db
			.insert(artifacts)
			.values({
				id: artifact.id,
				producingTaskId: artifact.producingTaskId,
				kind: artifact.kind,
				label: artifact.label,
				previewJson: artifact.previewJson,
				createdAt: artifact.createdAt,
			})
			.onConflictDoNothing();
	}
}
