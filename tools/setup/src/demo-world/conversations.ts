/**
 * AX1 — demo world conversations: fifteen threads across every host kind and
 * all four message types, with real reviews, verdicts, a blocking
 * questionnaire, DMs, and the founder's assistant history.
 */

import { type HyperIdleDb, messages, threads } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import {
	ART_PRICING_PAGE,
	ART_SEARCH_RANKING,
	ART_TRIAL_FLOW,
	ART_TRIAL_METRICS,
	ASSISTANT_ID,
	BET_MOBILE,
	BET_PRICING,
	BET_SEARCH,
	BET_TRIAL,
	BUILDER_ID,
	DESIGNER_ID,
	FOUNDER_ID,
	GROWTH_ID,
	KI_CHURN_SIGNALS,
	KI_MOBILE_POSTMORTEM,
	KI_TRIAL_RETRO,
	MAYA_ID,
	MSG_PRICING_QUESTIONNAIRE,
	MSG_PRICING_REVIEW,
	MSG_SEARCH_REVIEW,
	MSG_TRIAL_REVIEW,
	PM_ID,
	PROPAGATION_ID,
	QA_ID,
	TASK_ONBOARD_SEQUENCE,
	TASK_PRICING_ANNUAL,
	TASK_PRICING_PAGE,
	TASK_SEARCH_RANKING,
	TASK_TRIAL_FLOW,
	TEAM_ID,
	THREAD_ART_TRIAL_METRICS,
	THREAD_ASSISTANT,
	THREAD_BET_MOBILE_KILL,
	THREAD_BET_PRICING,
	THREAD_BET_TRIAL_RETRO,
	THREAD_DM_FOUNDER_BUILDER,
	THREAD_DM_MAYA_GROWTH,
	THREAD_DM_PM_FOUNDER,
	THREAD_KI_CHURN,
	THREAD_PRICING_BLOCKED,
	THREAD_PRICING_REVIEW,
	THREAD_SEARCH_REVIEW,
	THREAD_TASK_ONBOARD,
	THREAD_TEAM_FEED,
	THREAD_TRIAL_REVIEW,
} from "./ids.js";
import type { DemoClock } from "./time.js";

interface ThreadSpec {
	readonly id: string;
	readonly hostKind: string;
	readonly hostId: string;
	readonly initiatorId: string;
	readonly participants: readonly string[];
	readonly pinned?: boolean;
	readonly createdAt: string;
}

interface MessageSpec {
	readonly id: string;
	readonly threadId: string;
	readonly senderId: string;
	readonly type: "plain" | "review" | "questionnaire" | "verdict";
	readonly payload: Record<string, unknown>;
	readonly createdAt: string;
	readonly resolvedAt?: string;
}

const plain = (text: string, refs?: readonly Record<string, unknown>[]): Record<string, unknown> =>
	refs ? { text, refs } : { text };

export async function seedConversations(db: HyperIdleDb, clock: DemoClock): Promise<void> {
	const threadSpecs: readonly ThreadSpec[] = [
		{
			id: THREAD_ASSISTANT,
			hostKind: "user",
			hostId: FOUNDER_ID,
			initiatorId: FOUNDER_ID,
			participants: [FOUNDER_ID, ASSISTANT_ID],
			pinned: true,
			createdAt: clock.daysAgo(40),
		},
		{
			id: THREAD_PRICING_REVIEW,
			hostKind: "task",
			hostId: TASK_PRICING_PAGE,
			initiatorId: DESIGNER_ID,
			participants: [DESIGNER_ID, FOUNDER_ID, PM_ID],
			createdAt: clock.daysAgo(3),
		},
		{
			id: THREAD_PRICING_BLOCKED,
			hostKind: "task",
			hostId: TASK_PRICING_ANNUAL,
			initiatorId: BUILDER_ID,
			participants: [BUILDER_ID, FOUNDER_ID],
			createdAt: clock.daysAgo(2),
		},
		{
			id: THREAD_TRIAL_REVIEW,
			hostKind: "task",
			hostId: TASK_TRIAL_FLOW,
			initiatorId: BUILDER_ID,
			participants: [BUILDER_ID, FOUNDER_ID],
			createdAt: clock.daysAgo(30),
		},
		{
			id: THREAD_SEARCH_REVIEW,
			hostKind: "task",
			hostId: TASK_SEARCH_RANKING,
			initiatorId: BUILDER_ID,
			participants: [BUILDER_ID, FOUNDER_ID],
			createdAt: clock.daysAgo(25),
		},
		{
			id: THREAD_DM_PM_FOUNDER,
			hostKind: "agent",
			hostId: PM_ID,
			initiatorId: PM_ID,
			participants: [PM_ID, FOUNDER_ID],
			createdAt: clock.daysAgo(6),
		},
		{
			id: THREAD_DM_FOUNDER_BUILDER,
			hostKind: "agent",
			hostId: BUILDER_ID,
			initiatorId: FOUNDER_ID,
			participants: [FOUNDER_ID, BUILDER_ID],
			createdAt: clock.daysAgo(12),
		},
		{
			id: THREAD_DM_MAYA_GROWTH,
			hostKind: "agent",
			hostId: GROWTH_ID,
			initiatorId: MAYA_ID,
			participants: [MAYA_ID, GROWTH_ID],
			createdAt: clock.daysAgo(3),
		},
		{
			id: THREAD_BET_PRICING,
			hostKind: "bet",
			hostId: BET_PRICING,
			initiatorId: PM_ID,
			participants: [PM_ID, FOUNDER_ID, BUILDER_ID, DESIGNER_ID],
			createdAt: clock.daysAgo(21),
		},
		{
			id: THREAD_BET_TRIAL_RETRO,
			hostKind: "bet",
			hostId: BET_TRIAL,
			initiatorId: PM_ID,
			participants: [PM_ID, FOUNDER_ID, MAYA_ID],
			createdAt: clock.daysAgo(14),
		},
		{
			id: THREAD_BET_MOBILE_KILL,
			hostKind: "bet",
			hostId: BET_MOBILE,
			initiatorId: PM_ID,
			participants: [PM_ID, FOUNDER_ID],
			createdAt: clock.daysAgo(9),
		},
		{
			id: THREAD_TEAM_FEED,
			hostKind: "team",
			hostId: TEAM_ID,
			initiatorId: PROPAGATION_ID,
			participants: [FOUNDER_ID, MAYA_ID, PM_ID, BUILDER_ID, DESIGNER_ID, QA_ID, GROWTH_ID],
			createdAt: clock.daysAgo(14),
		},
		{
			id: THREAD_KI_CHURN,
			hostKind: "knowledge_item",
			hostId: KI_CHURN_SIGNALS,
			initiatorId: MAYA_ID,
			participants: [MAYA_ID, PM_ID, QA_ID],
			createdAt: clock.daysAgo(7),
		},
		{
			id: THREAD_ART_TRIAL_METRICS,
			hostKind: "artifact",
			hostId: ART_TRIAL_METRICS,
			initiatorId: QA_ID,
			participants: [QA_ID, FOUNDER_ID],
			createdAt: clock.daysAgo(15),
		},
		{
			id: THREAD_TASK_ONBOARD,
			hostKind: "task",
			hostId: TASK_ONBOARD_SEQUENCE,
			initiatorId: GROWTH_ID,
			participants: [GROWTH_ID, FOUNDER_ID],
			createdAt: clock.daysAgo(2),
		},
	];

	for (const thread of threadSpecs) {
		await db
			.insert(threads)
			.values({
				id: thread.id,
				hostKind: thread.hostKind,
				hostId: thread.hostId,
				initiatorId: thread.initiatorId,
				participants: JSON.stringify(thread.participants),
				pinned: thread.pinned ?? false,
				lastActiveAt: thread.createdAt,
				createdAt: thread.createdAt,
			})
			.onConflictDoNothing();
	}

	const verdictAt = clock.daysAgo(29);
	const searchVerdictAt = clock.daysAgo(24);

	const messageSpecs: readonly MessageSpec[] = [
		// ── Assistant thread: weeks of direction-shaping history ───────────
		{
			id: "demo-msg-asst-01",
			threadId: THREAD_ASSISTANT,
			senderId: ASSISTANT_ID,
			type: "plain",
			payload: plain(
				"Monthly reflection time. Three things stood out this month: the trial bet is tracking ahead of its hypothesis, search relevance keeps surfacing in support calls, and you approved reviews within an hour on average — the team is never waiting on you.",
			),
			createdAt: clock.daysAgo(40),
		},
		{
			id: "demo-msg-asst-02",
			threadId: THREAD_ASSISTANT,
			senderId: FOUNDER_ID,
			type: "plain",
			payload: plain("The search complaints surprise me. Is it one loud customer or broad?"),
			createdAt: clock.daysAgo(40),
		},
		{
			id: "demo-msg-asst-03",
			threadId: THREAD_ASSISTANT,
			senderId: ASSISTANT_ID,
			type: "plain",
			payload: plain(
				"Broad but shallow — eleven accounts mentioned it, none churned over it. The pattern worth keeping: results are right, ordering is wrong. That is a ranking bet, not an indexing bet.",
			),
			createdAt: clock.daysAgo(39),
		},
		{
			id: "demo-msg-asst-04",
			threadId: THREAD_ASSISTANT,
			senderId: FOUNDER_ID,
			type: "plain",
			payload: plain("Good framing. Ask the PM to shape it when the trial bet lands."),
			createdAt: clock.daysAgo(39),
		},
		{
			id: "demo-msg-asst-05",
			threadId: THREAD_ASSISTANT,
			senderId: ASSISTANT_ID,
			type: "plain",
			payload: plain(
				"Done — search relevance is queued as a draft. One more observation: Maya has reviewed every ops knowledge item this month. If operations keeps growing, the team roster has a hole in it.",
			),
			createdAt: clock.daysAgo(33),
		},
		{
			id: "demo-msg-asst-06",
			threadId: THREAD_ASSISTANT,
			senderId: FOUNDER_ID,
			type: "plain",
			payload: plain(
				"Noted. Not yet — let's see what the onboarding bet does to support volume first.",
			),
			createdAt: clock.daysAgo(33),
		},
		{
			id: "demo-msg-asst-07",
			threadId: THREAD_ASSISTANT,
			senderId: ASSISTANT_ID,
			type: "plain",
			payload: plain(
				"The trial-extension bet completed — validated, 27% of expiring trials took the extension. Retro review item is waiting in Work when you have fifteen minutes.",
			),
			createdAt: clock.daysAgo(14),
		},
		{
			id: "demo-msg-asst-08",
			threadId: THREAD_ASSISTANT,
			senderId: FOUNDER_ID,
			type: "plain",
			payload: plain("Did the retro this morning. The one-time limit was the right call."),
			createdAt: clock.daysAgo(13),
		},
		{
			id: "demo-msg-asst-09",
			threadId: THREAD_ASSISTANT,
			senderId: ASSISTANT_ID,
			type: "plain",
			payload: plain(
				"Agreed — and it is now a knowledge item, so the next pricing conversation starts from it. Your focus list still says 'activation before expansion'. Still true?",
			),
			createdAt: clock.daysAgo(13),
		},
		{
			id: "demo-msg-asst-10",
			threadId: THREAD_ASSISTANT,
			senderId: FOUNDER_ID,
			type: "plain",
			payload: plain(
				"Still true. Pricing is the exception — it was leaking trials we already paid to acquire.",
			),
			createdAt: clock.daysAgo(12),
		},
		{
			id: "demo-msg-asst-11",
			threadId: THREAD_ASSISTANT,
			senderId: ASSISTANT_ID,
			type: "plain",
			payload: plain(
				"That distinction is worth writing down — I drafted a focus update: 'Activation first; pricing only where acquisition spend is leaking.' Approve and it becomes the factory focus item.",
			),
			createdAt: clock.daysAgo(12),
		},
		{
			id: "demo-msg-asst-12",
			threadId: THREAD_ASSISTANT,
			senderId: FOUNDER_ID,
			type: "plain",
			payload: plain("Approve."),
			createdAt: clock.daysAgo(11),
		},
		{
			id: "demo-msg-asst-13",
			threadId: THREAD_ASSISTANT,
			senderId: ASSISTANT_ID,
			type: "plain",
			payload: plain(
				"Morning. Two things need you: the new pricing page is in review from the Designer, and annual billing is blocked on your discount decision. Everything else is moving.",
			),
			createdAt: clock.hoursAgo(26),
		},
		{
			id: "demo-msg-asst-14",
			threadId: THREAD_ASSISTANT,
			senderId: FOUNDER_ID,
			type: "plain",
			payload: plain("Pricing page review first — I want that live this week."),
			createdAt: clock.hoursAgo(25),
		},
		{
			id: "demo-msg-asst-15",
			threadId: THREAD_ASSISTANT,
			senderId: ASSISTANT_ID,
			type: "plain",
			payload: plain(
				"The Builder asked a clean question about the annual discount — three options, one tap. It is the blocking thread in Conversations whenever you are ready.",
			),
			createdAt: clock.hoursAgo(3),
		},
		{
			id: "demo-msg-asst-16",
			threadId: THREAD_ASSISTANT,
			senderId: FOUNDER_ID,
			type: "plain",
			payload: plain("On it after lunch."),
			createdAt: clock.hoursAgo(2),
		},
		// ── Blocking review: the new pricing page ──────────────────────────
		{
			id: "demo-msg-pr-01",
			threadId: THREAD_PRICING_REVIEW,
			senderId: DESIGNER_ID,
			type: "plain",
			payload: plain(
				"Page build is nearly done. Comparison table renders at all widths; the FAQ collapses to the four questions support actually gets.",
			),
			createdAt: clock.daysAgo(3),
		},
		{
			id: "demo-msg-pr-02",
			threadId: THREAD_PRICING_REVIEW,
			senderId: PM_ID,
			type: "plain",
			payload: plain(
				"Copy is still in flight on the FAQ section — Growth has draft 2 of everything else.",
			),
			createdAt: clock.daysAgo(1),
		},
		{
			id: "demo-msg-pr-03",
			threadId: THREAD_PRICING_REVIEW,
			senderId: DESIGNER_ID,
			type: "plain",
			payload: plain(
				"Hero options A and B are in the artifacts. I recommend B — it leads with the trial, not the logo.",
			),
			createdAt: clock.daysAgo(2),
		},
		{
			id: MSG_PRICING_REVIEW,
			threadId: THREAD_PRICING_REVIEW,
			senderId: DESIGNER_ID,
			type: "review",
			payload: {
				title: "New pricing page — ready for your eyes",
				reasoning: [
					"Two-tier structure renders exactly as approved, desktop through mobile.",
					"Comparison table answers the top four support questions inline.",
					"Hero option B leads with the trial — matches the activation focus.",
					"Copy is final except the FAQ, which Growth delivers tomorrow.",
				],
				artifactRef: { id: ART_PRICING_PAGE, kind: "html" },
				id: MSG_PRICING_REVIEW,
				betId: BET_PRICING,
				betTitle: "Pricing page overhaul",
				taskId: TASK_PRICING_PAGE,
				taskTitle: "Build the new pricing page",
				prompt:
					"Implement the two-tier page from the approved structure: comparison, FAQ, hero rework. Empty states and mobile widths included.",
				authorName: "Acme Designer",
				reviewerName: "You",
				blocking: true,
				producedAgo: "5h",
				tokens: "9.2k",
				tools: ["vite", "figma"],
				outcome:
					"Rebuilt the pricing page around two tiers with a visible comparison; the FAQ is data-driven so support can edit it without a deploy. Hero B leads with the trial, not the logo. Copy is final except the FAQ section.",
				resultKpis: [
					{
						label: "Support pricing questions",
						value: "4 / week",
						delta: "was 11 / week",
						good: true,
					},
					{ label: "Page length", value: "-38%", good: true },
					{ label: "Mobile comparison", value: "stacks clean", good: true },
				],
				intent: [
					{ text: "Two tiers with a visible comparison", met: true },
					{ text: "FAQ answers the four real support questions", met: true },
					{ text: "Copy final on every section", met: false },
					{ text: "Live for two weeks of conversion measurement", met: false },
				],
				needs: [
					{
						id: "n-1",
						kind: "unverified-claim",
						label: "Hero B over A is judgment, not data",
						detail:
							"B leads with the trial, matching the activation focus — but it has not been A/B tested. Your call.",
						artifactId: "demo-rv-pricing-visual",
					},
				],
				conversation: [],
				artifacts: [
					{
						id: "demo-rv-pricing-summary",
						tool: "vite",
						app: "Pulse",
						sourceHref: "/work/bet/demo-bet-pricing",
						title: "Outcome summary",
						kind: "outcome_summary",
						payload: {
							agentName: "Acme Designer",
							agentInitials: "AD",
							reviewerName: "You",
							achieved: "Two-tier pricing page built from the approved structure",
							tools: ["vite", "figma"],
							tokens: 9200,
							standing: "Blocking",
							doneConditions: [
								{ label: "Page rendered at all widths", met: true },
								{ label: "Comparison answers the four support questions", met: true },
								{
									label: "Copy final on every section",
									met: false,
									note: "FAQ lands tomorrow from Growth",
								},
							],
							needsYou: [
								{
									category: "verdict",
									severity: "warning",
									detail: "The page cannot ship without your verdict — the bet's last open thread.",
									jumpLabel: "Review the page",
								},
							],
						},
					},
					{
						id: "demo-rv-pricing-visual",
						tool: "figma",
						app: "Figma",
						sourceHref: "https://acme.example/pricing-preview",
						title: "Pricing page — before / after",
						kind: "visual_diff",
						payload: {
							before: { label: "Launch page (three tiers)" },
							after: { label: "New page (two tiers)" },
							diffRegions: [
								{ id: "r1", label: "Comparison table replaces the middle tier" },
								{ id: "r2", label: "Hero leads with the trial, not the logo" },
							],
							overlayMode: "side-by-side",
						},
					},
					{
						id: "demo-rv-pricing-preview",
						tool: "vite",
						app: "Pulse",
						sourceHref: "https://acme.example/pricing-preview",
						title: "Rendered preview",
						kind: "browser_preview",
						payload: {
							url: "https://acme.example/pricing-preview",
							title: "Pricing — Pulse",
							previewBody:
								"<section><h1>Simple pricing that scales with your team</h1><p>Two tiers. No surprises. Start free for 14 days.</p><table><tr><th></th><th>Starter</th><th>Team</th></tr><tr><td>Dashboards</td><td>5</td><td>Unlimited</td></tr><tr><td>Seats</td><td>3</td><td>Unlimited</td></tr></table></section>",
						},
					},
					// @lore `action_operation` had no demo data anywhere; seeded here
					// (data, not code) so the renderer is proven. Hosted on the
					// pricing review: an account migrated to annual mid-cycle during
					// the page overhaul and is owed a prorated credit — a
					// pricing-adjacent, not fabricated, staged action.
					{
						id: "demo-rv-pricing-credit",
						tool: "stripe",
						app: "Stripe",
						sourceHref: "https://dashboard.stripe.example/customers/acct-2290",
						title: "Issue migration credit",
						kind: "action_operation",
						payload: {
							verb: "Issue migration credit",
							amountWire: { currency: "USD", units: 1000, formatted: "$10.00" },
							irreversible: false,
							reversible: true,
							blastRadius: ["Applies to the next invoice for acct-2290 (annual plan)"],
							receiptFields: [
								{ label: "Account", value: "acct-2290" },
								{ label: "Reason", value: "Prorated credit for early annual switch" },
							],
						},
					},
				],
			},
			createdAt: clock.hoursAgo(5),
		},
		{
			id: "demo-msg-pr-05",
			threadId: THREAD_PRICING_REVIEW,
			senderId: PM_ID,
			type: "plain",
			payload: plain(
				"Once the verdict lands, this bet is one blocked task from done — the annual discount decision.",
			),
			createdAt: clock.hoursAgo(4),
		},
		// ── Blocked task: annual billing, questionnaire waiting ────────────
		{
			id: "demo-msg-pb-01",
			threadId: THREAD_PRICING_BLOCKED,
			senderId: BUILDER_ID,
			type: "plain",
			payload: plain(
				"Annual billing is ready to build except one number: the discount. It changes the proration math and the metering schema, so I would rather not guess.",
			),
			createdAt: clock.hoursAgo(27),
		},
		{
			id: MSG_PRICING_QUESTIONNAIRE,
			threadId: THREAD_PRICING_BLOCKED,
			senderId: BUILDER_ID,
			type: "questionnaire",
			payload: {
				title: "Annual billing discount",
				question:
					"What discount should annual plans carry? Margin says low, conversion data from the trial bet says users respond to visible savings.",
				options: [
					"10% — protect margin, modest nudge",
					"15% — market standard, balanced",
					"20% — aggressive, maximizes annual mix",
				],
			},
			createdAt: clock.hoursAgo(26),
		},
		{
			id: "demo-msg-pb-03",
			threadId: THREAD_PRICING_BLOCKED,
			senderId: BUILDER_ID,
			type: "plain",
			payload: plain(
				"Either way it is a one-line constant — the moment you pick, this task unblocks.",
			),
			createdAt: clock.hoursAgo(25),
		},
		// ── Resolved review: trial flow, approved ──────────────────────────
		{
			id: "demo-msg-tr-01",
			threadId: THREAD_TRIAL_REVIEW,
			senderId: BUILDER_ID,
			type: "plain",
			payload: plain(
				"Extension flow is built. The date math runs in UTC end-to-end — the trial entitlement edge was timezone-sensitive before, this closes it.",
			),
			createdAt: clock.daysAgo(30),
		},
		{
			id: MSG_TRIAL_REVIEW,
			threadId: THREAD_TRIAL_REVIEW,
			senderId: BUILDER_ID,
			type: "review",
			payload: {
				title: "Trial extension — entitlement date math",
				reasoning: [
					"One-click, one-time, exactly seven days — second attempt declines gracefully.",
					"All date math in UTC; the old timezone drift at the entitlement edge is gone.",
					"Covered by the extension tests, including the decline path.",
				],
				artifactRef: { id: ART_TRIAL_FLOW, kind: "code" },
				id: MSG_TRIAL_REVIEW,
				betId: BET_TRIAL,
				betTitle: "Trial extension flow",
				taskId: TASK_TRIAL_FLOW,
				taskTitle: "Self-serve extension flow",
				prompt:
					"One-click, one-time, seven days. Date math on the entitlement edge — mind the timezone boundary.",
				authorName: "Acme Builder",
				reviewerName: "You",
				blocking: false,
				producedAgo: "4w",
				tokens: "6.1k",
				tools: ["github"],
				outcome:
					"Extension flow built and covered by tests. The entitlement edge now runs in UTC end-to-end; the timezone drift that could grant six or eight days is gone.",
				resultKpis: [
					{ label: "Tests", value: "18 / 18", delta: "+6 new", good: true },
					{ label: "Extension grant", value: "exactly 7d", good: true },
					{ label: "Second attempt", value: "declines gracefully", good: true },
				],
				intent: [
					{ text: "One-click, one-time, seven days", met: true },
					{ text: "Date math timezone-safe", met: true },
					{ text: "Decline path covered by tests", met: true },
				],
				needs: [],
				conversation: [],
				verdict: {
					decision: "approve",
					note: "Clean. Ship it to staging and start the measurement task.",
				},
				artifacts: [
					{
						id: "demo-rv-trial-summary",
						tool: "github",
						app: "GitHub",
						sourceHref: "/work/bet/demo-bet-trial-extension",
						title: "Outcome summary",
						kind: "outcome_summary",
						payload: {
							agentName: "Acme Builder",
							agentInitials: "AB",
							reviewerName: "You",
							achieved: "Self-serve trial extension with timezone-safe entitlement math",
							tools: ["github"],
							tokens: 6100,
							standing: "Awaiting",
							doneConditions: [
								{ label: "Extension grants exactly seven days once", met: true },
								{ label: "Second attempt declines gracefully", met: true },
							],
							needsYou: [],
						},
					},
					{
						id: "demo-rv-trial-diff",
						tool: "github",
						app: "GitHub",
						sourceHref: "https://github.com/acme/pulse/pull/218",
						title: "src/trial/extend.ts",
						kind: "code_diff",
						payload: {
							prTitle: "Trial extension: UTC entitlement math",
							description:
								"One-click, one-time, seven days. All date math in UTC, rounding up to whole days.",
							checks: ["ci / tests — passing", "ci / typecheck — passing"],
							files: [
								{
									path: "src/trial/extend.ts",
									band: "logic",
									rationale: "The entitlement edge — where the timezone drift lived.",
									added: 9,
									removed: 4,
									hunks: [
										{
											header: "@@ -12,9 +12,14 @@ export function extendTrial(",
											lines: [
												{
													kind: "ctx",
													oldNo: 12,
													newNo: 12,
													text: "export function extendTrial(entitlement: Entitlement, now: Date): Entitlement {",
												},
												{
													kind: "ctx",
													oldNo: 13,
													newNo: 13,
													text: "  if (entitlement.extensionUsed) {",
												},
												{
													kind: "ctx",
													oldNo: 14,
													newNo: 14,
													text: "    return entitlement; // one-time: decline gracefully",
												},
												{ kind: "ctx", oldNo: 15, newNo: 15, text: "  }" },
												{
													kind: "del",
													oldNo: 16,
													newNo: null,
													text: "  const until = addDays(entitlement.expiresAt, 7);",
												},
												{
													kind: "add",
													oldNo: null,
													newNo: 16,
													text: "  const until = addDaysUtc(roundUpToWholeDayUtc(entitlement.expiresAt), 7);",
												},
												{
													kind: "add",
													oldNo: null,
													newNo: 17,
													text: "  // UTC end-to-end: no six-or-eight-day grants across zones.",
												},
												{
													kind: "ctx",
													oldNo: 17,
													newNo: 18,
													text: "  return { ...entitlement, expiresAt: until, extensionUsed: true };",
												},
												{ kind: "ctx", oldNo: 18, newNo: 19, text: "}" },
											],
										},
									],
								},
							],
							triviaSummary: "Two renamed imports and a comment fix.",
							trivia: { count: 3, summary: "Import renames + comment.", added: 3, removed: 3 },
						},
					},
					// @lore `field_change_set` and `rendered_in_context` had no demo
					// data anywhere; seeded here (data, not code) so both renderers
					// are proven. Hosted on the trial review: extending a trial IS a
					// record field change (the entitlement's expiry), and granting it
					// triggers a real confirmation email — the most direct fit of the
					// three bets.
					{
						id: "demo-rv-trial-fieldchange",
						tool: "github",
						app: "Pulse",
						sourceHref: "/work/bet/demo-bet-trial-extension",
						title: "Trial entitlement — acct-4821",
						kind: "field_change_set",
						payload: {
							recordLabel: "Trial entitlement — acct-4821",
							fields: [
								{
									label: "Expires at",
									old: "2026-08-21",
									new: "2026-08-28",
									provenance: "extendTrial()",
								},
								{
									label: "Extension used",
									old: "false",
									new: "true",
									provenance: "extendTrial()",
								},
							],
							unchangedCount: 4,
						},
					},
					{
						id: "demo-rv-trial-email",
						tool: "github",
						app: "Pulse",
						sourceHref: "/work/bet/demo-bet-trial-extension",
						title: "Extension confirmation email",
						kind: "rendered_in_context",
						payload: {
							inboxRow: {
								sender: "Acme Pulse <noreply@acmepulse.example>",
								subject: "Your trial just got 7 more days",
								preview: "Good news — we've extended your trial through August 28.",
							},
							body: "Hi there,\n\nWe've extended your trial by seven days — no action needed on your end. Your new expiry is August 28.\n\n— Acme Pulse",
							renderMode: "email",
							flags: [],
						},
					},
				],
			},
			createdAt: clock.daysAgo(29),
			resolvedAt: verdictAt,
		},
		{
			id: "demo-msg-tr-03",
			threadId: THREAD_TRIAL_REVIEW,
			senderId: FOUNDER_ID,
			type: "verdict",
			payload: {
				decision: "approve",
				resolvesMessageId: MSG_TRIAL_REVIEW,
				note: "Clean. Ship it to staging and start the measurement task.",
			},
			createdAt: verdictAt,
		},
		{
			id: "demo-msg-tr-04",
			threadId: THREAD_TRIAL_REVIEW,
			senderId: BUILDER_ID,
			type: "plain",
			payload: plain("Merged. Extension flow is live in staging; QA has the funnel instrumented."),
			createdAt: clock.daysAgo(28),
		},
		// ── Resolved review: search ranking, changes requested ─────────────
		{
			id: MSG_SEARCH_REVIEW,
			threadId: THREAD_SEARCH_REVIEW,
			senderId: BUILDER_ID,
			type: "review",
			payload: {
				title: "Search re-ranking — first cut",
				reasoning: [
					"Recency and title-match now outrank body-match.",
					"Eval loop shows 54% → 68% top-3 on the first forty queries.",
					"Weights are constants in rank.ts for now.",
				],
				artifactRef: { id: ART_SEARCH_RANKING, kind: "code" },
				id: MSG_SEARCH_REVIEW,
				betId: BET_SEARCH,
				betTitle: "Search relevance tuning",
				taskId: TASK_SEARCH_RANKING,
				taskTitle: "Re-rank on recency and title match",
				prompt: "Weight recency and exact-title-match above body-match; keep it tunable.",
				authorName: "Acme Builder",
				reviewerName: "You",
				blocking: false,
				producedAgo: "3w",
				tokens: "7.8k",
				tools: ["github"],
				outcome:
					"Re-ranking live behind a flag. Top-3 hit rate moved 54% → 68% on the eval set; recency carried more of the lift than expected.",
				resultKpis: [
					{ label: "Top-3 hit rate", value: "68%", delta: "was 54%", good: true },
					{ label: "Queries in eval", value: "40", delta: "of 50", good: true },
					{ label: "P95 latency", value: "+4ms", good: true },
				],
				intent: [
					{ text: "Recency and title-match outrank body-match", met: true },
					{ text: "Weights tunable without a deploy", met: false },
					{ text: "Eval loop runnable before every change", met: true },
				],
				needs: [
					{
						id: "n-1",
						kind: "unverified-claim",
						label: "Weights will need weekly tuning",
						detail: "They are constants in code; a weight tweak should not be a deploy.",
						artifactId: "demo-rv-search-diff",
					},
				],
				conversation: [],
				verdict: {
					decision: "request-changes",
					note: "The direction is right, but the weights belong in config, not code — we will tune them weekly.",
				},
				artifacts: [
					{
						id: "demo-rv-search-summary",
						tool: "github",
						app: "GitHub",
						sourceHref: "/work/bet/demo-bet-search-relevance",
						title: "Outcome summary",
						kind: "outcome_summary",
						payload: {
							agentName: "Acme Builder",
							agentInitials: "AB",
							reviewerName: "You",
							achieved: "Re-ranking on recency and title match, behind a flag",
							tools: ["github"],
							tokens: 7800,
							standing: "Awaiting",
							doneConditions: [
								{ label: "Re-ranking live behind a flag", met: true },
								{
									label: "Weights in config",
									met: false,
									note: "Constants in rank.ts — the review ask",
								},
							],
							needsYou: [],
						},
					},
					{
						id: "demo-rv-search-diff",
						tool: "github",
						app: "GitHub",
						sourceHref: "https://github.com/acme/pulse/pull/204",
						title: "src/search/rank.ts",
						kind: "code_diff",
						payload: {
							prTitle: "Search: re-rank on recency + title match",
							description:
								"Recency and exact-title-match outrank body-match. Weights as constants (config move requested in review).",
							checks: ["ci / tests — passing", "ci / eval-loop — 68% top-3"],
							files: [
								{
									path: "src/search/rank.ts",
									band: "logic",
									rationale: "The ranking function itself.",
									added: 12,
									removed: 3,
									hunks: [
										{
											header: "@@ -4,6 +4,15 @@ export function score(",
											lines: [
												{
													kind: "ctx",
													oldNo: 4,
													newNo: 4,
													text: "export function score(hit: SearchHit, now: number): number {",
												},
												{ kind: "del", oldNo: 5, newNo: null, text: "  return hit.bodyScore;" },
												{ kind: "add", oldNo: null, newNo: 5, text: "  return (" },
												{
													kind: "add",
													oldNo: null,
													newNo: 6,
													text: "    0.45 * recencyScore(hit.updatedAt, now) +",
												},
												{ kind: "add", oldNo: null, newNo: 7, text: "    0.35 * hit.titleScore +" },
												{ kind: "add", oldNo: null, newNo: 8, text: "    0.2 * hit.bodyScore" },
												{ kind: "add", oldNo: null, newNo: 9, text: "  );" },
												{ kind: "ctx", oldNo: 6, newNo: 10, text: "}" },
											],
										},
									],
								},
							],
							triviaSummary: "One import reorder.",
							trivia: { count: 1, summary: "Import reorder.", added: 1, removed: 1 },
						},
					},
					{
						id: "demo-rv-search-metrics",
						tool: "github",
						app: "GitHub",
						sourceHref: "https://acme.example/search-eval",
						title: "Eval loop — top-3 hit rate",
						kind: "metrics_moved",
						payload: {
							period: "two weeks of queries",
							headlines: [
								{ label: "Top-3 hit rate", prior: 54, current: 68 },
								{ label: "Scroll-past rate", prior: 31, current: 19 },
							],
							rows: [],
							tieOut: { opening: 54, activity: 14, closing: 68, ties: true },
							exceptions: [],
						},
					},
					// @lore `batch` had no demo data anywhere; seeded here (data, not
					// code) so the renderer is proven. Hosted on the search review:
					// the eval loop's 40 queries are a natural per-item batch.
					{
						id: "demo-rv-search-batch",
						tool: "github",
						app: "GitHub",
						sourceHref: "https://acme.example/search-eval",
						title: "Eval queries — triage",
						kind: "batch",
						payload: {
							rollup: { total: 40, needYou: 3, autoResolved: 30, drafted: 7 },
							flagged: [
								{
									id: "q-1",
									ref: "query: 'pricing faq'",
									reason: "Top-3 hit dropped after re-rank",
								},
								{
									id: "q-2",
									ref: "query: 'cancel plan'",
									reason: "Recency overweighted a stale doc",
								},
								{
									id: "q-3",
									ref: "query: 'sso setup'",
									reason: "No exact title match; needs a manual tune",
								},
							],
							auto: [{ id: "a-1", label: "Queries within ±2 rank of baseline", count: 30 }],
							drafted: [{ id: "d-1", label: "Weight adjustments queued for next eval", count: 7 }],
							approveAllExcept: ["q-1", "q-2", "q-3"],
						},
					},
				],
			},
			createdAt: clock.daysAgo(25),
			resolvedAt: searchVerdictAt,
		},
		{
			id: "demo-msg-sr-02",
			threadId: THREAD_SEARCH_REVIEW,
			senderId: FOUNDER_ID,
			type: "verdict",
			payload: {
				decision: "request-changes",
				resolvesMessageId: MSG_SEARCH_REVIEW,
				note: "The direction is right, but the weights belong in config, not code — we will tune them weekly.",
			},
			createdAt: searchVerdictAt,
		},
		{
			id: "demo-msg-sr-03",
			threadId: THREAD_SEARCH_REVIEW,
			senderId: BUILDER_ID,
			type: "plain",
			payload: plain(
				"Fair. Weights moved to config with the same defaults — re-requesting review on the task.",
			),
			createdAt: clock.daysAgo(24),
		},
		{
			id: "demo-msg-sr-04",
			threadId: THREAD_SEARCH_REVIEW,
			senderId: FOUNDER_ID,
			type: "plain",
			payload: plain(
				"That was the whole ask. The eval loop is the real win here — keep it running.",
			),
			createdAt: clock.daysAgo(23),
		},
		// ── DM: PM noticed a pattern ───────────────────────────────────────
		{
			id: "demo-msg-dmpm-01",
			threadId: THREAD_DM_PM_FOUNDER,
			senderId: PM_ID,
			type: "plain",
			payload: plain(
				"I noticed three of our recent bets all touch the same onboarding drop-off — trial expiry, activation, and now the email sequence. We keep paying the acquisition cost twice.",
			),
			createdAt: clock.daysAgo(6),
		},
		{
			id: "demo-msg-dmpm-02",
			threadId: THREAD_DM_PM_FOUNDER,
			senderId: FOUNDER_ID,
			type: "plain",
			payload: plain("You are not wrong. What would you do about it?"),
			createdAt: clock.daysAgo(6),
		},
		{
			id: "demo-msg-dmpm-03",
			threadId: THREAD_DM_PM_FOUNDER,
			senderId: PM_ID,
			type: "plain",
			payload: plain(
				"Maya keeps surfacing churn signals in support calls, and QA says all three are scoreable. A churn early-warning dashboard would let us intervene while the account is still alive.",
			),
			createdAt: clock.daysAgo(5),
		},
		{
			id: "demo-msg-dmpm-04",
			threadId: THREAD_DM_PM_FOUNDER,
			senderId: FOUNDER_ID,
			type: "plain",
			payload: plain(
				"Draft it. If the signals are real, it activates after the pricing bet ships.",
			),
			createdAt: clock.daysAgo(5),
		},
		{
			id: "demo-msg-dmpm-05",
			threadId: THREAD_DM_PM_FOUNDER,
			senderId: PM_ID,
			type: "plain",
			payload: plain(
				"Drafted — and I promoted it straight from the churn-signals knowledge item, so the provenance is visible on the bet.",
				[
					{
						kind: "knowledge_item",
						id: KI_CHURN_SIGNALS,
					},
				],
			),
			createdAt: clock.daysAgo(4),
		},
		// ── DM: founder checks in with the builder ─────────────────────────
		{
			id: "demo-msg-dmb-01",
			threadId: THREAD_DM_FOUNDER_BUILDER,
			senderId: FOUNDER_ID,
			type: "plain",
			payload: plain(
				"How is the metering service holding up? The pricing bet is about to lean on it.",
			),
			createdAt: clock.daysAgo(12),
		},
		{
			id: "demo-msg-dmb-02",
			threadId: THREAD_DM_FOUNDER_BUILDER,
			senderId: BUILDER_ID,
			type: "plain",
			payload: plain(
				"Solid. It processed the trial-extension entitlements without a hiccup. The one watch-item: seat-count events arrive out of order under load, so I dedupe on the consumer side.",
			),
			createdAt: clock.daysAgo(12),
		},
		{
			id: "demo-msg-dmb-03",
			threadId: THREAD_DM_FOUNDER_BUILDER,
			senderId: FOUNDER_ID,
			type: "plain",
			payload: plain("Dedupe on the consumer is fine as long as it is documented. Is it?"),
			createdAt: clock.daysAgo(11),
		},
		{
			id: "demo-msg-dmb-04",
			threadId: THREAD_DM_FOUNDER_BUILDER,
			senderId: BUILDER_ID,
			type: "plain",
			payload: plain(
				"Now it is — wrote it up as a practice item so the next person wiring a consumer sees it first.",
			),
			createdAt: clock.daysAgo(11),
		},
		// ── DM: Maya and Growth on email metrics ───────────────────────────
		{
			id: "demo-msg-dmm-01",
			threadId: THREAD_DM_MAYA_GROWTH,
			senderId: MAYA_ID,
			type: "plain",
			payload: plain(
				"Can you walk me through how we will measure the onboarding emails? Support wants to know what success looks like.",
			),
			createdAt: clock.daysAgo(3),
		},
		{
			id: "demo-msg-dmm-02",
			threadId: THREAD_DM_MAYA_GROWTH,
			senderId: GROWTH_ID,
			type: "plain",
			payload: plain(
				"Per email: delivery, open, and the one action each email asks for. For the sequence overall: 14-day activation against the 34% baseline. No vanity metrics — opens alone tell us nothing.",
			),
			createdAt: clock.daysAgo(3),
		},
		{
			id: "demo-msg-dmm-03",
			threadId: THREAD_DM_MAYA_GROWTH,
			senderId: MAYA_ID,
			type: "plain",
			payload: plain(
				"That is what support needs. Let's review the first cohort together when it lands.",
			),
			createdAt: clock.daysAgo(2),
		},
		// ── Bet discussion: pricing ────────────────────────────────────────
		{
			id: "demo-msg-bp-01",
			threadId: THREAD_BET_PRICING,
			senderId: PM_ID,
			type: "plain",
			payload: plain(
				"Kicking off the pricing overhaul. Shape: research first, then the two-tier structure, then the page build. Hypothesis and done-condition are on the bet — push back now, not at review.",
			),
			createdAt: clock.daysAgo(21),
		},
		{
			id: "demo-msg-bp-02",
			threadId: THREAD_BET_PRICING,
			senderId: FOUNDER_ID,
			type: "plain",
			payload: plain(
				"Keep the FAQ short. If a pricing page needs a long FAQ, the tiers are still confusing.",
			),
			createdAt: clock.daysAgo(20),
		},
		{
			id: "demo-msg-bp-03",
			threadId: THREAD_BET_PRICING,
			senderId: PM_ID,
			type: "plain",
			payload: plain("Taken — four questions max, sourced from real support tickets."),
			createdAt: clock.daysAgo(20),
		},
		{
			id: "demo-msg-bp-04",
			threadId: THREAD_BET_PRICING,
			senderId: PM_ID,
			type: "plain",
			payload: plain(
				"Interviews done: ten users, three recurring confusions. The biggest — nobody could tell what happened after the trial. That goes straight into the page.",
			),
			createdAt: clock.daysAgo(16),
		},
		{
			id: "demo-msg-bp-05",
			threadId: THREAD_BET_PRICING,
			senderId: DESIGNER_ID,
			type: "plain",
			payload: plain(
				"Page approach: comparison table above the fold, FAQ collapsed, one CTA. Mocks coming as artifacts.",
			),
			createdAt: clock.daysAgo(13),
		},
		{
			id: "demo-msg-bp-06",
			threadId: THREAD_BET_PRICING,
			senderId: PM_ID,
			type: "plain",
			payload: plain(
				"Mid-bet check: four of seven tasks done. The page is in review, copy lands tomorrow, and annual billing is waiting on the discount decision.",
			),
			createdAt: clock.hoursAgo(28),
		},
		{
			id: "demo-msg-bp-07",
			threadId: THREAD_BET_PRICING,
			senderId: FOUNDER_ID,
			type: "plain",
			payload: plain("Review is next on my list. The discount answer goes today too."),
			createdAt: clock.hoursAgo(27),
		},
		// ── Retro: trial extension ─────────────────────────────────────────
		{
			id: "demo-msg-retro-01",
			threadId: THREAD_BET_TRIAL_RETRO,
			senderId: PM_ID,
			type: "plain",
			payload: plain(
				"Post-bet retro for Trial extension. Hypothesis said 20% of expiring trials; reality delivered 27% taking the extension and 31% of those converting. Validated.",
			),
			createdAt: clock.daysAgo(14),
		},
		{
			id: "demo-msg-retro-02",
			threadId: THREAD_BET_TRIAL_RETRO,
			senderId: FOUNDER_ID,
			type: "plain",
			payload: plain(
				"What surprised me: support-granted extensions dropped 92%. We built back real hidden labor.",
			),
			createdAt: clock.daysAgo(14),
		},
		{
			id: "demo-msg-retro-03",
			threadId: THREAD_BET_TRIAL_RETRO,
			senderId: MAYA_ID,
			type: "plain",
			payload: plain(
				"Confirmed from the support side — those requests were two or three a week, each with a manual entitlement edit. The flow pays for itself in labor alone.",
			),
			createdAt: clock.daysAgo(13),
		},
		{
			id: "demo-msg-retro-04",
			threadId: THREAD_BET_TRIAL_RETRO,
			senderId: PM_ID,
			type: "plain",
			payload: plain(
				"Retro captured as a knowledge item — the one-time limit decision and the dropped reason dropdown are both in it.",
				[{ kind: "knowledge_item", id: KI_TRIAL_RETRO }],
			),
			createdAt: clock.daysAgo(13),
		},
		// ── Kill decision: mobile spike ────────────────────────────────────
		{
			id: "demo-msg-kill-01",
			threadId: THREAD_BET_MOBILE_KILL,
			senderId: PM_ID,
			type: "plain",
			payload: plain(
				"Recommendation: kill the mobile spike. Mobile is 6% of sessions, mostly read-only, and the responsive web app covers it. A native shell would cost a quarter of team capacity.",
			),
			createdAt: clock.daysAgo(9),
		},
		{
			id: "demo-msg-kill-02",
			threadId: THREAD_BET_MOBILE_KILL,
			senderId: FOUNDER_ID,
			type: "plain",
			payload: plain(
				"Agreed — kill it. Write up what we learned so we don't pay for this research twice.",
			),
			createdAt: clock.daysAgo(9),
		},
		{
			id: "demo-msg-kill-03",
			threadId: THREAD_BET_MOBILE_KILL,
			senderId: PM_ID,
			type: "plain",
			payload: plain(
				"Done — postmortem captured with the usage numbers and the competitor teardown.",
				[{ kind: "knowledge_item", id: KI_MOBILE_POSTMORTEM }],
			),
			createdAt: clock.daysAgo(8),
		},
		// ── Team feed: announcements and summaries ─────────────────────────
		{
			id: "demo-msg-feed-01",
			threadId: THREAD_TEAM_FEED,
			senderId: PROPAGATION_ID,
			type: "plain",
			payload: plain(
				"Bet completed: Trial extension flow — hypothesis VALIDATED. 27% of expiring trials took the extension; 31% of those converted. Retro review item posted for the team.",
			),
			createdAt: clock.daysAgo(14),
		},
		{
			id: "demo-msg-feed-02",
			threadId: THREAD_TEAM_FEED,
			senderId: PROPAGATION_ID,
			type: "plain",
			payload: plain(
				"Ship confirmation: trial extension flow is live in production. Support-granted extensions are now the exception path.",
			),
			createdAt: clock.daysAgo(13),
		},
		{
			id: "demo-msg-feed-03",
			threadId: THREAD_TEAM_FEED,
			senderId: PROPAGATION_ID,
			type: "plain",
			payload: plain(
				"Bet killed: Native mobile spike — hypothesis refuted. Mobile is 6% of sessions; the responsive app covers it. Postmortem captured.",
			),
			createdAt: clock.daysAgo(8),
		},
		{
			id: "demo-msg-feed-04",
			threadId: THREAD_TEAM_FEED,
			senderId: PM_ID,
			type: "plain",
			payload: plain(
				"Weekly summary: pricing overhaul is mid-flight (page in review, one blocked task), onboarding emails are writing, churn dashboard drafted and waiting. No bet is at risk.",
			),
			createdAt: clock.daysAgo(7),
		},
		{
			id: "demo-msg-feed-05",
			threadId: THREAD_TEAM_FEED,
			senderId: PM_ID,
			type: "plain",
			payload: plain(
				"The new pricing page is in review — feedback welcome before the founder verdict.",
			),
			createdAt: clock.hoursAgo(4),
		},
		// ── Knowledge discussion: churn signals ────────────────────────────
		{
			id: "demo-msg-kc-01",
			threadId: THREAD_KI_CHURN,
			senderId: MAYA_ID,
			type: "plain",
			payload: plain(
				"These three churn signals keep showing up in support calls — usage down, exports stop, invites stop. We always notice after the cancellation.",
			),
			createdAt: clock.daysAgo(7),
		},
		{
			id: "demo-msg-kc-02",
			threadId: THREAD_KI_CHURN,
			senderId: QA_ID,
			type: "plain",
			payload: plain(
				"All three are in the event stream already. Scoring accounts against them is a week of work, not a quarter.",
			),
			createdAt: clock.daysAgo(7),
		},
		{
			id: "demo-msg-kc-03",
			threadId: THREAD_KI_CHURN,
			senderId: PM_ID,
			type: "plain",
			payload: plain(
				"That is a bet, not a discussion. Drafting it from this item so the provenance stays attached.",
			),
			createdAt: clock.daysAgo(6),
		},
		// ── Artifact discussion: trial metrics ─────────────────────────────
		{
			id: "demo-msg-am-01",
			threadId: THREAD_ART_TRIAL_METRICS,
			senderId: QA_ID,
			type: "plain",
			payload: plain(
				"Two weeks of extension metrics attached. The daily trend is still climbing — no plateau yet.",
			),
			createdAt: clock.daysAgo(15),
		},
		{
			id: "demo-msg-am-02",
			threadId: THREAD_ART_TRIAL_METRICS,
			senderId: FOUNDER_ID,
			type: "plain",
			payload: plain("27% is better than I hoped. And the support-line drop is the quiet win."),
			createdAt: clock.daysAgo(15),
		},
		{
			id: "demo-msg-am-03",
			threadId: THREAD_ART_TRIAL_METRICS,
			senderId: QA_ID,
			type: "plain",
			payload: plain(
				"Agreed — support-granted extensions are basically gone. Keeping this dashboard running through the pricing bet too.",
			),
			createdAt: clock.daysAgo(14),
		},
		// ── Task thread: onboarding sequence, live session ─────────────────
		{
			id: "demo-msg-to-01",
			threadId: THREAD_TASK_ONBOARD,
			senderId: GROWTH_ID,
			type: "plain",
			payload: plain(
				"Working through email two — the setup nudge. The trigger is 'connected a source but no dashboard after three days', which catches exactly the cliff from the audit.",
			),
			createdAt: clock.hoursAgo(8),
		},
		{
			id: "demo-msg-to-02",
			threadId: THREAD_TASK_ONBOARD,
			senderId: GROWTH_ID,
			type: "plain",
			payload: plain(
				"Session note: three subject-line candidates for the nudge, all behavior-referencing ('your data connected — here is your first dashboard'). Picking the plainest.",
			),
			createdAt: clock.hoursAgo(2),
		},
		// ── Lived-in depth: the everyday chatter of a six-week-old team ────
		{
			id: "demo-msg-bp-08",
			threadId: THREAD_BET_PRICING,
			senderId: BUILDER_ID,
			type: "plain",
			payload: plain(
				"Metering side is ready for the tier limits — just waiting on the annual schema before I wire it.",
			),
			createdAt: clock.daysAgo(8),
		},
		{
			id: "demo-msg-bp-09",
			threadId: THREAD_BET_PRICING,
			senderId: DESIGNER_ID,
			type: "plain",
			payload: plain(
				"Mobile widths checked on the comparison table — it stacks cleanly. FAQ accordion keeps the page short.",
			),
			createdAt: clock.daysAgo(2),
		},
		{
			id: "demo-msg-bp-10",
			threadId: THREAD_BET_PRICING,
			senderId: PM_ID,
			type: "plain",
			payload: plain(
				"Reminder: the done-condition needs two weeks of conversion data AFTER ship, so the earlier the verdict, the earlier we call the bet.",
			),
			createdAt: clock.daysAgo(1),
		},
		{
			id: "demo-msg-dmpm-06",
			threadId: THREAD_DM_PM_FOUNDER,
			senderId: PM_ID,
			type: "plain",
			payload: plain(
				"One more thing — the onboarding bet and the churn draft share the activation metric. I will keep them coordinated so we measure once, not twice.",
			),
			createdAt: clock.daysAgo(4),
		},
		{
			id: "demo-msg-dmpm-07",
			threadId: THREAD_DM_PM_FOUNDER,
			senderId: FOUNDER_ID,
			type: "plain",
			payload: plain("Good instinct. Shared metric, separate bets."),
			createdAt: clock.daysAgo(3),
		},
		{
			id: "demo-msg-feed-06",
			threadId: THREAD_TEAM_FEED,
			senderId: PM_ID,
			type: "plain",
			payload: plain(
				"Kicking off the onboarding email sequence bet — audit first, then the sequence. Hypothesis is on the bet.",
			),
			createdAt: clock.daysAgo(10),
		},
		{
			id: "demo-msg-feed-07",
			threadId: THREAD_TEAM_FEED,
			senderId: PROPAGATION_ID,
			type: "plain",
			payload: plain(
				"Knowledge promoted: 'Churn early signals' is now validated — it repeated across support, QA, and PM scopes.",
			),
			createdAt: clock.daysAgo(6),
		},
		{
			id: "demo-msg-feed-08",
			threadId: THREAD_TEAM_FEED,
			senderId: GROWTH_ID,
			type: "plain",
			payload: plain(
				"Onboarding emails: audit task done, the cliff is source-connection. Sequence writing is in progress.",
			),
			createdAt: clock.daysAgo(5),
		},
		{
			id: "demo-msg-asst-17",
			threadId: THREAD_ASSISTANT,
			senderId: ASSISTANT_ID,
			type: "plain",
			payload: plain(
				"Weekly note: knowledge triage has four items waiting. The annual-discount one is the only item that needs you specifically.",
			),
			createdAt: clock.daysAgo(2),
		},
		{
			id: "demo-msg-asst-18",
			threadId: THREAD_ASSISTANT,
			senderId: FOUNDER_ID,
			type: "plain",
			payload: plain(
				"The facilitator can clear the other three. Only bring me the ones that are actually mine.",
			),
			createdAt: clock.daysAgo(2),
		},
		{
			id: "demo-msg-retro-05",
			threadId: THREAD_BET_TRIAL_RETRO,
			senderId: PM_ID,
			type: "plain",
			payload: plain(
				"One process note for the next bet: the funnel was instrumented before the flow shipped. That is why this retro could be written on day one — keeping it.",
			),
			createdAt: clock.daysAgo(13),
		},
		{
			id: "demo-msg-retro-06",
			threadId: THREAD_BET_TRIAL_RETRO,
			senderId: FOUNDER_ID,
			type: "plain",
			payload: plain("Agreed — metric-before-build goes into the practice items."),
			createdAt: clock.daysAgo(12),
		},
		{
			id: "demo-msg-dmb-05",
			threadId: THREAD_DM_FOUNDER_BUILDER,
			senderId: FOUNDER_ID,
			type: "plain",
			payload: plain(
				"While I have you — the pricing page build is in review. Anything on the implementation side I should know before I verdict?",
			),
			createdAt: clock.hoursAgo(6),
		},
		{
			id: "demo-msg-dmb-06",
			threadId: THREAD_DM_FOUNDER_BUILDER,
			senderId: BUILDER_ID,
			type: "plain",
			payload: plain(
				"It composes from tokens end to end, and the FAQ is data-driven — support can edit the four questions without a deploy. No concerns from my side.",
			),
			createdAt: clock.hoursAgo(5),
		},
		{
			id: "demo-msg-kc-04",
			threadId: THREAD_KI_CHURN,
			senderId: MAYA_ID,
			type: "plain",
			payload: plain(
				"For what it is worth, support sees the invites-stop signal first almost every time. If the dashboard orders the signals, that one should lead.",
			),
			createdAt: clock.daysAgo(6),
		},
		{
			id: "demo-msg-kc-05",
			threadId: THREAD_KI_CHURN,
			senderId: QA_ID,
			type: "plain",
			payload: plain("Noted — I will weight the score so a drop in invites outranks the others."),
			createdAt: clock.daysAgo(6),
		},
		{
			id: "demo-msg-to-03",
			threadId: THREAD_TASK_ONBOARD,
			senderId: FOUNDER_ID,
			type: "plain",
			payload: plain(
				"Keep email one under five sentences. The welcome email is the only one people definitely open.",
			),
			createdAt: clock.hoursAgo(7),
		},
		{
			id: "demo-msg-to-04",
			threadId: THREAD_TASK_ONBOARD,
			senderId: GROWTH_ID,
			type: "plain",
			payload: plain(
				"Done — four sentences and one link. The value-moment email carries the dashboard template from the audit.",
			),
			createdAt: clock.hoursAgo(6),
		},
		{
			id: "demo-msg-to-05",
			threadId: THREAD_TASK_ONBOARD,
			senderId: GROWTH_ID,
			type: "plain",
			payload: plain(
				"Sequence draft is complete pending the template design — triggers specified, suppression rules in the task notes.",
			),
			createdAt: clock.hoursAgo(1),
		},
		{
			id: "demo-msg-pr-06",
			threadId: THREAD_PRICING_REVIEW,
			senderId: DESIGNER_ID,
			type: "plain",
			payload: plain(
				"One open question for the verdict: hero A leads with the product, hero B leads with the trial. I put B in the review artifact.",
			),
			createdAt: clock.hoursAgo(5),
		},
		{
			id: "demo-msg-pr-07",
			threadId: THREAD_PRICING_REVIEW,
			senderId: FOUNDER_ID,
			type: "plain",
			payload: plain(
				"Looking at it this afternoon. B is the right instinct given the activation focus.",
			),
			createdAt: clock.hoursAgo(3),
		},
		{
			id: "demo-msg-pb-04",
			threadId: THREAD_PRICING_BLOCKED,
			senderId: FOUNDER_ID,
			type: "plain",
			payload: plain(
				"Seen — deciding today. Leaning market standard but I want the margin numbers in front of me first.",
			),
			createdAt: clock.hoursAgo(2),
		},
		{
			id: "demo-msg-dmm-04",
			threadId: THREAD_DM_MAYA_GROWTH,
			senderId: GROWTH_ID,
			type: "plain",
			payload: plain(
				"Friday works. I will have the first cohort numbers drafted — even if they are early, the shape will be visible.",
			),
			createdAt: clock.daysAgo(2),
		},
		{
			id: "demo-msg-dmm-05",
			threadId: THREAD_DM_MAYA_GROWTH,
			senderId: MAYA_ID,
			type: "plain",
			payload: plain(
				"Perfect. Support asked one more thing: will the emails mention the trial extension? They want to stop explaining it by hand.",
			),
			createdAt: clock.daysAgo(1),
		},
		{
			id: "demo-msg-am-04",
			threadId: THREAD_ART_TRIAL_METRICS,
			senderId: QA_ID,
			type: "plain",
			payload: plain(
				"Heads-up: I am reusing this dashboard shape for the pricing funnel. Same headlines-plus-trend layout.",
			),
			createdAt: clock.daysAgo(13),
		},
		{
			id: "demo-msg-sr-05",
			threadId: THREAD_SEARCH_REVIEW,
			senderId: BUILDER_ID,
			type: "plain",
			payload: plain("Eval run after the config move: 71% held. No regression from the refactor."),
			createdAt: clock.daysAgo(23),
		},
		{
			id: "demo-msg-sr-06",
			threadId: THREAD_SEARCH_REVIEW,
			senderId: FOUNDER_ID,
			type: "plain",
			payload: plain("Then that is the bet's real deliverable. Good work."),
			createdAt: clock.daysAgo(22),
		},
		{
			id: "demo-msg-tr-05",
			threadId: THREAD_TRIAL_REVIEW,
			senderId: FOUNDER_ID,
			type: "plain",
			payload: plain("Two weeks in, the numbers are better than the hypothesis. Nice build."),
			createdAt: clock.daysAgo(14),
		},
		{
			id: "demo-msg-kill-04",
			threadId: THREAD_BET_MOBILE_KILL,
			senderId: PM_ID,
			type: "plain",
			payload: plain(
				"Also killed the two remaining mobile tasks so the bet closes clean. The research artifact stays linked from the postmortem.",
			),
			createdAt: clock.daysAgo(8),
		},
	];

	for (const message of messageSpecs) {
		await db
			.insert(messages)
			.values({
				id: message.id,
				senderId: message.senderId,
				threadId: message.threadId,
				type: message.type,
				payload: JSON.stringify(message.payload),
				clientKey: `demo-ck-${message.id}`,
				resolvedAt: message.resolvedAt ?? null,
				createdAt: message.createdAt,
			})
			.onConflictDoNothing();
	}

	// Thread lastActiveAt = newest message in the thread.
	for (const thread of threadSpecs) {
		const latest = messageSpecs
			.filter((m) => m.threadId === thread.id)
			.reduce((max, m) => (m.createdAt > max ? m.createdAt : max), thread.createdAt);
		await db.update(threads).set({ lastActiveAt: latest }).where(eq(threads.id, thread.id));
	}
}
