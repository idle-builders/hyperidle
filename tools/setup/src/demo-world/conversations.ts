/**
 * The conversations that are not a task's own: the hand-off "Trial-end
 * confusion, three tickets" — Maya's tickets, Builder taking it, its question
 * about the charge's name, the two reviews — round 1 with Finn's comments on its
 * parts, rejected with a reason, and round 2 — Maya's question about the rollout rule, three quieter threads, and the
 * comments on "Should trials be 10 days?".
 */

import type { HyperIdleDb } from "@hyperidle/db";
import type { Anchor, Flag, Pin, ReviewPart, Spot } from "@hyperidle/domain-model";
import { TEN_DAYS_BODY } from "./documents.js";
import {
	BUILDER_ID,
	DOC_DEPLOY_RULE,
	DOC_TEN_DAYS,
	FOUNDER_ID,
	GROWTH_ID,
	MAYA_ID,
	MSG_EXPLAINER_REVIEW,
	PRODUCT_TEAM_ID,
	SUPPORT_TEAM_ID,
	TASK_EXPLAIN,
	THREAD_TEN_DAYS,
	THREAD_TRIAL_END,
} from "./ids.js";
import { TRIAL_END_PAGE } from "./review-pages.js";
import { type MessageSpec, plain, seedThreads, type ThreadSpec } from "./threads.js";
import type { DemoClock } from "./time.js";

const THREAD_ROLLOUT = "demo-thread-rollout-rule";
const THREAD_PRICING_Q4 = "demo-thread-pricing-q4";
const THREAD_ONBOARDING = "demo-thread-onboarding-emails";
const THREAD_HIRING = "demo-thread-support-hire";

const NAME_QUESTION = "demo-msg-te-name-question";
const EXPLAINER_ROUND_1 = "demo-msg-explainer-review-1";

const REJECT_REASON =
	"Wrong direction. Customers need the warning in the email, not only on this page — most never open the page before the charge.";

const BUILDER = { id: BUILDER_ID, name: "Builder" };

const TRIAL_PAGE_PART: ReviewPart = {
	id: "page",
	kind: "preview",
	label: "Live preview",
	title: "Trial-end page",
	url: TRIAL_END_PAGE,
};

const PRORATION_PART: ReviewPart = {
	id: "proration",
	kind: "code",
	label: "Code",
	title: "billing/proration.ts",
	files: [
		{
			path: "billing/proration.ts",
			hunks: [
				{
					lines: [
						{ op: "same", n: 214, text: "  const cycleStart = plan.currentPeriodStart;" },
						{ op: "del", n: 215, text: "  const days = differenceInDays(now, cycleStart);" },
						{
							op: "add",
							n: 215,
							text: "  const days = differenceInCalendarDays(utc(now), utc(cycleStart));",
						},
						{ op: "same", n: 216, text: "  const unused = days / plan.cycleLength;" },
						{ op: "del", n: 217, text: "  return Math.round(plan.amount * unused);" },
						{ op: "add", n: 217, text: "  // half-up at the boundary, matches the invoice engine" },
						{ op: "add", n: 218, text: "  return roundHalfUp(plan.amount * unused);" },
					],
				},
			],
		},
	],
};

const TICKETS_PART: ReviewPart = {
	id: "tickets",
	kind: "numbers",
	label: "Numbers",
	title: "Trial-end tickets · 30 days",
	figures: [
		{ label: "Trial-end tickets", value: "31", change: "−58%", good: true },
		{ label: "Reached support", value: "12", change: "−64%", good: true },
		{ label: "Trial → paid", value: "24.1%", change: "+1.8pt", good: true },
		{ label: "Refund requests", value: "4", change: "+1", good: false },
	],
};

const WARNING_EMAIL_PART = {
	id: "email",
	kind: "text",
	label: "Email",
	title: "Three-day warning · new in round 2",
	to: "the trial user",
	subject: "Your trial ends in 3 days",
	body: "Hi Sam,\n\nYour trial ends on 1 September. On 2 September we start your Team plan and charge £24.\n\nIf you do not want to continue, cancel before 1 September and nothing is charged.",
} as const satisfies ReviewPart;

const FLAG_AMOUNT: Flag = {
	id: "amount",
	part: "page",
	label: "the amount",
	spot: { kind: "element", selector: "#amount" },
	says: "I added the amount, not just the date — you did not ask for that. Dishonest to warn about a charge without saying how much.",
};

const FLAG_ROUNDING: Flag = {
	id: "rounding",
	part: "proration",
	label: "proration.ts:218",
	spot: { kind: "line", file: "billing/proration.ts", line: 218 },
	says: "Rounding is half-up at the boundary now. It matches the invoice engine, but it is a behaviour change.",
};

/** Where a flag points, without its words: the pin its replies take. */
const pinOf = ({ says: _, ...pin }: Flag): Pin => pin;

const PIN_HEADING: Anchor = {
	review: EXPLAINER_ROUND_1,
	id: "heading",
	part: "page",
	label: "the heading",
	spot: { kind: "element", selector: "h1" },
};

const PIN_REFUNDS: Anchor = {
	review: EXPLAINER_ROUND_1,
	id: "refunds",
	part: "tickets",
	label: "refund requests",
	spot: { kind: "figure", label: "Refund requests" },
};

const DAY_13 = "Most cancellations happen on day 13.";

/** Finn's comment on one line of "Should trials be 10 days?"; Growth proposes what it should say. */
const PIN_DAY_13: Anchor = {
	id: "day-13",
	part: DOC_TEN_DAYS,
	label: DAY_13,
	spot: rangeOf(TEN_DAYS_BODY, DAY_13),
};

/** The characters of `body` that `words` covers. */
function rangeOf(body: string, words: string): Spot {
	const start = body.indexOf(words);
	if (start < 0) throw new Error(`"${words}" is not in the text`);
	return { kind: "range", start, end: start + words.length };
}
const GROWTH = { id: GROWTH_ID, name: "Growth" };

export async function seedConversations(db: HyperIdleDb, clock: DemoClock): Promise<void> {
	const lastMonday = clock.daysSinceMonday === 0 ? 7 : clock.daysSinceMonday;
	const lastFriday = (clock.daysSinceMonday + 3) % 7 || 7;

	const threadSpecs: readonly ThreadSpec[] = [
		{
			id: THREAD_TRIAL_END,
			title: "Trial-end confusion, three tickets",
			host: { kind: "team", id: SUPPORT_TEAM_ID },
			initiatorId: MAYA_ID,
			members: [MAYA_ID, FOUNDER_ID, BUILDER_ID],
			createdAt: clock.at(1, "08:12"),
		},
		{
			id: THREAD_ROLLOUT,
			title: "Rollout rule, written down",
			host: { kind: "team", id: PRODUCT_TEAM_ID },
			initiatorId: MAYA_ID,
			members: [MAYA_ID, FOUNDER_ID],
			createdAt: clock.at(0, "05:10"),
		},
		{
			id: THREAD_PRICING_Q4,
			title: "Pricing page, Q4 pass",
			host: { kind: "team", id: PRODUCT_TEAM_ID },
			initiatorId: FOUNDER_ID,
			members: [FOUNDER_ID, GROWTH_ID],
			createdAt: clock.at(2, "10:00"),
		},
		{
			id: THREAD_ONBOARDING,
			title: "Onboarding emails",
			host: { kind: "team", id: PRODUCT_TEAM_ID },
			initiatorId: GROWTH_ID,
			members: [GROWTH_ID, FOUNDER_ID],
			createdAt: clock.at(lastMonday, "09:30"),
		},
		{
			id: THREAD_HIRING,
			title: "Support hire, second round",
			host: { kind: "team", id: SUPPORT_TEAM_ID },
			initiatorId: MAYA_ID,
			members: [MAYA_ID, FOUNDER_ID],
			createdAt: clock.at(lastFriday, "11:00"),
		},
		{
			id: THREAD_TEN_DAYS,
			title: "Should trials be 10 days?",
			host: { kind: "document", id: DOC_TEN_DAYS },
			initiatorId: FOUNDER_ID,
			members: [FOUNDER_ID, GROWTH_ID],
			createdAt: clock.at(0, "10:42"),
		},
	];

	const trialEnd = (
		id: string,
		senderId: string,
		at: string,
		rest: Pick<MessageSpec, "type" | "payload" | "resolvedAt">,
	): MessageSpec => ({
		id: `demo-msg-te-${id}`,
		threadId: THREAD_TRIAL_END,
		senderId,
		createdAt: at,
		...rest,
	});

	const messageSpecs: readonly MessageSpec[] = [
		// ── The hand-off ──────────────────────────────────────────────────────
		trialEnd("01", MAYA_ID, clock.at(1, "08:12"), {
			type: "plain",
			payload: plain(
				"Three support tickets this week asking the same thing — people finish the trial and cannot tell what they will actually pay.",
			),
		}),
		trialEnd("02", FOUNDER_ID, clock.at(1, "08:13"), {
			type: "plain",
			payload: plain("@Builder can you take a look at this and propose a fix", {
				mentions: [BUILDER],
			}),
		}),
		trialEnd("03", BUILDER_ID, clock.at(1, "08:13"), {
			type: "plain",
			payload: plain("Yes — taking it. I will come back here when I have something to look at."),
		}),
		{
			id: NAME_QUESTION,
			threadId: THREAD_TRIAL_END,
			senderId: BUILDER_ID,
			type: "questionnaire",
			payload: {
				title: "What do we call the charge after a trial ends?",
				question:
					"Fix is written and the maths is covered. One thing I will not name on my own, because it goes in front of every trial user. Internally it is trial_conversion — that name is mine to pick. This one is on the pricing page and in the receipt, so it is yours.\n\nYour first bill: plainest, says exactly when money moves.\nPlan starts: frames it as beginning, not charging.\nTrial ends: matches the email we already send.",
				options: ["Your first bill", "Plan starts", "Trial ends"],
			},
			createdAt: clock.at(1, "12:31"),
			resolvedAt: clock.at(1, "12:40"),
		},
		trialEnd("04", FOUNDER_ID, clock.at(1, "12:40"), {
			type: "answer",
			payload: { resolvesMessageId: NAME_QUESTION, option: "Your first bill" },
		}),
		trialEnd("05", BUILDER_ID, clock.at(1, "12:48"), {
			type: "plain",
			payload: plain(
				"Went with Your first bill. Fix is in and the page says it in three places. I raised two reviews — the change is yours, the replies are Maya's.",
			),
		}),
		{
			id: EXPLAINER_ROUND_1,
			threadId: THREAD_TRIAL_END,
			senderId: BUILDER_ID,
			type: "review",
			payload: {
				title: "Trial-end explainer",
				stage: "Final",
				reasoning: [
					"Page says the date and the amount before the trial runs out. Proration bug fixed on the way. Two things I flagged for you.",
				],
				parts: [TRIAL_PAGE_PART, PRORATION_PART, TICKETS_PART],
				flags: [FLAG_AMOUNT, FLAG_ROUNDING],
				reviewer: FOUNDER_ID,
				taskId: TASK_EXPLAIN,
			},
			createdAt: clock.at(1, "12:49"),
			resolvedAt: clock.at(1, "15:20"),
		},
		trialEnd("06", BUILDER_ID, clock.at(1, "12:50"), {
			type: "review",
			payload: {
				title: "Three replies to customers",
				reasoning: [
					"These go to customers, so I am not sending them — and they are not yours to approve either. They are Maya's.",
				],
				parts: [
					{
						id: "replies",
						kind: "items",
						label: "Replies",
						title: "Three tickets, one reply each",
						items: [
							{
								id: "zd-4471",
								title: "ZD-4471 · priya@northwind.co",
								body: "You were charged on 2 September, the day your trial ended. We have rewritten that page so the date and amount now show before the trial runs out — and here is the breakdown for your account.",
							},
							{
								id: "zd-4468",
								title: "ZD-4468 · sam@lumen.dev",
								body: "Your first bill is £24 on 12 September for the Team plan. You will get an email three days before. The pricing page now says this on the plan you are trialling.",
							},
							{
								id: "zd-4460",
								title: "ZD-4460 · ops@fairbank.io",
								body: "That invoice covered the first month starting the day the trial ended. We found a proration bug on mid-cycle upgrades that made it read oddly — fixed, and your invoice has been reissued.",
							},
						],
					},
				],
				reviewer: MAYA_ID,
				taskId: TASK_EXPLAIN,
			},
		}),
		trialEnd("07", FOUNDER_ID, clock.at(1, "14:50"), {
			type: "plain",
			payload: plain("“2 September” reads as the trial end date. Both dates?", {
				anchor: PIN_HEADING,
			}),
		}),
		trialEnd("08", BUILDER_ID, clock.at(1, "14:52"), {
			type: "plain",
			payload: plain("Changed to “Trial ends 1 Sep · first bill 2 Sep”.", { anchor: PIN_HEADING }),
		}),
		trialEnd("08a", FOUNDER_ID, clock.at(1, "14:58"), {
			type: "plain",
			payload: plain("Good call. Keep the amount.", {
				anchor: { ...pinOf(FLAG_AMOUNT), review: EXPLAINER_ROUND_1 },
			}),
		}),
		trialEnd("09", FOUNDER_ID, clock.at(1, "15:05"), {
			type: "plain",
			payload: plain("This one went the wrong way — is that us?", { anchor: PIN_REFUNDS }),
		}),
		trialEnd("10", BUILDER_ID, clock.at(1, "15:07"), {
			type: "plain",
			payload: plain(
				"Three of the four predate the fix. The fourth asked for a refund because they did not see the warning, which is the thing we just changed.",
				{ anchor: PIN_REFUNDS },
			),
		}),
		trialEnd("11", FOUNDER_ID, clock.at(1, "15:20"), {
			type: "verdict",
			payload: { decision: "reject", resolvesMessageId: EXPLAINER_ROUND_1, note: REJECT_REASON },
		}),
		{
			id: MSG_EXPLAINER_REVIEW,
			threadId: THREAD_TRIAL_END,
			senderId: BUILDER_ID,
			type: "review",
			payload: {
				title: "Trial-end explainer",
				stage: "Final",
				reasoning: [
					"Moved the warning into the email, as you asked. The page stays as it was. Two things I flagged for you.",
				],
				previousReviewId: EXPLAINER_ROUND_1,
				changed: [
					"New: the three-day warning email, with date and amount",
					"Same: the trial-end page and the proration fix",
				],
				parts: [WARNING_EMAIL_PART, { ...TRIAL_PAGE_PART, title: "Trial-end page · unchanged" }],
				flags: [
					{
						id: "email",
						part: "email",
						label: "the warning email",
						spot: rangeOf(
							WARNING_EMAIL_PART.body,
							"On 2 September we start your Team plan and charge £24.",
						),
						says: "This is what you asked for: the three-day warning now goes out by email, with the date and the amount.",
					},
					{
						id: "page",
						part: "page",
						label: "the trial-end page",
						spot: { kind: "element", selector: "h1" },
						says: "Unchanged from round 1. The page still says the same thing, so the email and the page agree.",
					},
				],
				reviewer: FOUNDER_ID,
				taskId: TASK_EXPLAIN,
			},
			createdAt: clock.at(0, "08:17"),
		},
		// ── Maya asks Finn to own the rollout rule ──────────────────────────
		{
			id: "demo-msg-rollout-01",
			threadId: THREAD_ROLLOUT,
			senderId: MAYA_ID,
			type: "plain",
			payload: plain(
				"Facilitation wrote the rollout rule down as a draft, from the two Friday rollbacks in August.",
				{ documents: [DOC_DEPLOY_RULE] },
			),
			createdAt: clock.at(0, "05:15"),
		},
		{
			id: "demo-msg-rollout-question",
			threadId: THREAD_ROLLOUT,
			senderId: MAYA_ID,
			type: "questionnaire",
			payload: {
				title: "Rollout rule, written down: will you own it?",
				question:
					"Once it is published, someone has to keep it true and say yes to the exceptions. Will you own it?",
				options: ["I will own it", "Someone else should"],
			},
			createdAt: clock.at(0, "05:17"),
		},
		// ── Quieter threads ─────────────────────────────────────────────────
		{
			id: "demo-msg-q4-01",
			threadId: THREAD_PRICING_Q4,
			senderId: FOUNDER_ID,
			type: "plain",
			payload: plain(
				"@Growth draft two options for the pricing page this quarter. One can be bold.",
				{ mentions: [GROWTH] },
			),
			createdAt: clock.at(2, "10:00"),
		},
		{
			id: "demo-msg-q4-02",
			threadId: THREAD_PRICING_Q4,
			senderId: GROWTH_ID,
			type: "plain",
			payload: plain(
				"Two options drafted. Option B shortens the trial to 10 days and adds a reminder.",
			),
			createdAt: clock.at(1, "16:40"),
		},
		{
			id: "demo-msg-onboarding-01",
			threadId: THREAD_ONBOARDING,
			senderId: GROWTH_ID,
			type: "plain",
			payload: plain(
				"The onboarding emails are drafted. Do you want them before the trial test, or after?",
			),
			createdAt: clock.at(lastMonday, "09:30"),
		},
		{
			id: "demo-msg-onboarding-02",
			threadId: THREAD_ONBOARDING,
			senderId: FOUNDER_ID,
			type: "plain",
			payload: plain("After. Park until October."),
			createdAt: clock.at(lastMonday, "11:05"),
		},
		{
			id: "demo-msg-hiring-01",
			threadId: THREAD_HIRING,
			senderId: MAYA_ID,
			type: "plain",
			payload: plain("Second round is done. Two candidates left; notes are in the shared drive."),
			createdAt: clock.at(lastFriday, "13:10"),
		},
		// ── Comments on "Should trials be 10 days?" ─────────────────────────
		{
			id: "demo-msg-ten-days-01",
			threadId: THREAD_TEN_DAYS,
			senderId: FOUNDER_ID,
			type: "plain",
			payload: plain("@Growth if trials end on day 10, how many people who pay would we lose?", {
				mentions: [GROWTH],
				anchor: PIN_DAY_13,
			}),
			createdAt: clock.at(0, "10:42"),
		},
		{
			id: "demo-msg-ten-days-02",
			threadId: THREAD_TEN_DAYS,
			senderId: GROWTH_ID,
			type: "plain",
			payload: plain("About 1 in 5. This line should say so.", {
				anchor: PIN_DAY_13,
				change: {
					from: DAY_13,
					to: "Most cancellations happen on day 13, and 1 in 5 people who pay decide on days 11–14.",
				},
			}),
			createdAt: clock.at(0, "10:44"),
		},
	];

	await seedThreads(db, threadSpecs, messageSpecs);
}
