/**
 * The work: the task "Trials that convert without a call" with its whole tree
 * of parts, the small fix "Trial dates normalised to UTC", the recurring
 * "Support themes, weekly" with one part per Monday, and the other root tasks
 * in the Work list. Each task has a conversation, which holds its questions and
 * reviews: its own, or the one it was handed off in (the trial-end fixes). The
 * documents an agent made while working hang on the part that made them.
 *
 * A task's summary is its outcome summary once it is done, and its notes while
 * it runs or waits. A part that waits for other parts is in `hold`. Finn
 * follows the trials task, since he started it.
 */

import { documents, type HyperIdleDb, subscriptions, tasks } from "@hyperidle/db";
import type { ReviewPart, TaskState } from "@hyperidle/domain-model";
import {
	BUILDER_ID,
	DESIGNER_ID,
	DOC_PLAN,
	FOUNDER_ID,
	GROWTH_ID,
	MAYA_ID,
	MSG_LAYOUT_REVIEW,
	PRODUCT_TEAM_ID,
	SUPPORT_TEAM_ID,
	TASK_BUILD,
	TASK_CARD,
	TASK_CHECKOUT,
	TASK_DROPOFF,
	TASK_EMAIL,
	TASK_EXPLAIN,
	TASK_LAYOUT,
	TASK_METERING,
	TASK_NUMBERS,
	TASK_PAGE,
	TASK_PAYFORM,
	TASK_PICKER,
	TASK_PRORATION,
	TASK_RECEIPT,
	TASK_REFUNDS,
	TASK_REMINDER,
	TASK_TEST,
	TASK_TRIALS,
	TASK_UNDERSTAND,
	TASK_UTC,
	TASK_WEEKLY,
	TASK_WIRE,
	TASK_WRITEUP,
	THREAD_TRIAL_END,
	taskThreadId,
	weeklyRunId,
} from "./ids.js";
import { COMPARISON_TABLE } from "./review-pages.js";
import { type MessageSpec, plain, seedThreads, type ThreadSpec } from "./threads.js";
import type { DemoClock } from "./time.js";

interface Close {
	readonly what: string;
	readonly by: "check" | "review";
	readonly state: "met" | "open" | "failed";
	readonly how: string;
}

interface ReasonSpec {
	readonly kind: "decision" | "assumption";
	readonly what: string;
	readonly state: "made" | "waiting" | "held" | "open" | "broke";
	readonly why: string;
}

interface TaskSpec {
	readonly id: string;
	readonly parent?: string;
	readonly team?: string;
	readonly owner: string;
	readonly title: string;
	readonly about: string;
	readonly state: TaskState;
	/** Parts that must be done before this one starts. */
	readonly after?: readonly string[];
	readonly doneWhen?: readonly Close[];
	readonly reasons?: readonly ReasonSpec[];
	readonly summary?: readonly string[];
	readonly createdAt: string;
	readonly updatedAt: string;
	/** The conversation it came from, when it was handed off in one. */
	readonly threadId?: string;
	/** Who else is in its conversation besides the owner. */
	readonly members?: readonly string[];
	/** Who started it; a part is started by the agent that owns its parent. */
	readonly startedBy?: string;
	readonly sourceDocumentId?: string;
	/** Its place among its siblings, when not set by `CHILD_ORDER`. */
	readonly position?: number;
}

/** The parts in the order they read under their parent. */
const CHILD_ORDER = [
	TASK_UNDERSTAND,
	TASK_BUILD,
	TASK_TEST,
	TASK_WRITEUP,
	TASK_NUMBERS,
	TASK_DROPOFF,
	TASK_EMAIL,
	TASK_CHECKOUT,
	TASK_LAYOUT,
	TASK_REMINDER,
	TASK_PAGE,
	TASK_CARD,
	TASK_WIRE,
	TASK_PICKER,
	TASK_PAYFORM,
	TASK_RECEIPT,
];

const WEEKLY_RUNS = 12;
const WEEKLY_NEXT = "demo-task-weekly-next";
/** Tickets read in each of the twelve weeks, oldest first. */
const TICKETS = [22, 24, 21, 23, 20, 22, 19, 21, 18, 17, 19, 14];
const weekLabel = (iso: string): string =>
	new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long" });

function trialsTree(clock: DemoClock): TaskSpec[] {
	return [
		{
			id: TASK_TRIALS,
			startedBy: FOUNDER_ID,
			owner: GROWTH_ID,
			title: "Trials that convert without a call",
			about:
				"Can a trial turn into a paid plan without a sales call? Put a self-serve checkout in front of people on day 12 and compare it with what we do today.",
			state: "in_progress",
			sourceDocumentId: DOC_PLAN,
			reasons: [
				{
					kind: "decision",
					what: "Try a self-serve checkout on day 12 instead of a sales call.",
					state: "made",
					why: "by Finn, in Plan: trials without a call",
				},
				{
					kind: "assumption",
					what: "Most people who leave before paying stop at the card form.",
					state: "held",
					why: "checked by Find where people drop off before paying: 171 of 284 stopped there",
				},
				{
					kind: "assumption",
					what: "By day 12 people have used the product enough to decide.",
					state: "open",
					why: "the two-week test will show it",
				},
				{
					kind: "assumption",
					what: "People who pay on their own stay as long as those who had a call.",
					state: "open",
					why: "two weeks cannot show it; Growth checks again after three months",
				},
				{
					kind: "decision",
					what: "The test covers monthly plans only.",
					state: "made",
					why: "by Growth, after Finn said yearly plans still need a call",
				},
			],
			doneWhen: [
				{
					what: "The test ran for two weeks on new signups.",
					by: "check",
					state: "open",
					how: "the test counts its own days · not started",
				},
				{
					what: "We know how many paid without a call, next to last quarter.",
					by: "check",
					state: "open",
					how: "Growth puts both numbers side by side when the test ends",
				},
				{
					what: "What we learned is written down in How we price.",
					by: "review",
					state: "open",
					how: "Finn reviews the change to How we price",
				},
			],
			summary: [
				"Two parts need a person: an answer on the checkout, and a review of the stacked layout.",
				"Builder is writing the reminder email now.",
				"We know why people leave before paying: most stop at the card form. The plan rests on that.",
				"The two-week test starts by itself when the day-12 path is built.",
			],
			createdAt: clock.daysAgo(14),
			updatedAt: clock.at(0, "14:32"),
		},
		{
			id: TASK_UNDERSTAND,
			parent: TASK_TRIALS,
			owner: GROWTH_ID,
			title: "Understand today",
			about:
				"Before changing anything, find out how trials turn into paid plans today and where people leave.",
			state: "done",
			summary: [
				"31% of trials became paid last quarter, almost all of them after a sales call.",
				"Most people who leave before paying stop at the card form.",
			],
			createdAt: clock.daysAgo(14),
			updatedAt: clock.at(9, "15:00"),
		},
		{
			id: TASK_NUMBERS,
			parent: TASK_UNDERSTAND,
			owner: GROWTH_ID,
			title: "Pull last quarter's trial-to-paid numbers",
			about:
				"How many trials started last quarter, how many became paid, and how many of those had a sales call first.",
			state: "done",
			summary: ["412 trials started. 128 became paid (31%). 119 of those had a sales call first."],
			createdAt: clock.daysAgo(14),
			updatedAt: clock.at(10, "11:00"),
		},
		{
			id: TASK_DROPOFF,
			parent: TASK_UNDERSTAND,
			owner: GROWTH_ID,
			title: "Find where people drop off before paying",
			about: "Of the people who did not pay, where did they stop?",
			state: "done",
			summary: [
				"Of the 284 who did not pay, 171 stopped at the card form.",
				"Second most common: the trial ended while nobody was looking (62).",
			],
			createdAt: clock.daysAgo(14),
			updatedAt: clock.at(9, "14:40"),
		},
		{
			id: TASK_BUILD,
			parent: TASK_TRIALS,
			after: [TASK_UNDERSTAND],
			owner: GROWTH_ID,
			title: "Build the day-12 path",
			about:
				"Everything a person on day 12 sees: the email, the checkout page, the comparison table and the reminder.",
			state: "in_progress",
			summary: [
				"The checkout page is built but needs an answer about the card.",
				"The stacked layout needs a review.",
				"Builder is writing the reminder email. The day-12 email is done.",
			],
			createdAt: clock.daysAgo(5),
			updatedAt: clock.at(0, "14:05"),
		},
		{
			id: TASK_EMAIL,
			parent: TASK_BUILD,
			after: [TASK_DROPOFF],
			owner: DESIGNER_ID,
			title: "Draft the day-12 checkout email",
			about: "One email on day 12 that says what the plan costs and lets the person pay.",
			state: "done",
			summary: [
				"One email, sent on day 12, with the plan, the price and a pay-now button.",
				"Subject line picked from three, by how often last quarter's emails were opened.",
			],
			createdAt: clock.daysAgo(5),
			updatedAt: clock.at(3, "12:00"),
		},
		{
			id: TASK_CHECKOUT,
			parent: TASK_BUILD,
			owner: BUILDER_ID,
			title: "Self-serve checkout at day 12",
			about: "Let someone on a trial pay by themselves on day 12, without talking to us.",
			state: "in_progress",
			reasons: [
				{
					kind: "decision",
					what: "One page for picking a plan and paying, not two.",
					state: "made",
					why: "by Builder · fewer steps where people leave",
				},
				{
					kind: "decision",
					what: "When the card is taken.",
					state: "waiting",
					why: "Builder asked Finn on Decide when the card is taken",
				},
				{
					kind: "assumption",
					what: "The card already on file can be charged without asking again.",
					state: "held",
					why: "checked on a test account: the charge went through",
				},
			],
			doneWhen: [
				{
					what: "A person on day 12 can pick a plan and pay on one page.",
					by: "check",
					state: "met",
					how: "Builder paid on a test account · 09:40",
				},
				{
					what: "People who already pay see nothing new.",
					by: "check",
					state: "open",
					how: "Builder checks it on a paying test account once the card question is answered",
				},
				{
					what: "The checkout is right for trial users.",
					by: "review",
					state: "open",
					how: "Finn asked to look at it before it counts as done",
				},
			],
			summary: [
				"Stuck on one question: when do we take the card?",
				"The checkout page is built and works on a test account.",
				"Once that is answered: put it in, then hand the page to Designer for the layout.",
			],
			createdAt: clock.at(1, "21:15"),
			updatedAt: clock.at(0, "09:45"),
		},
		{
			id: TASK_PAGE,
			parent: TASK_CHECKOUT,
			owner: BUILDER_ID,
			title: "Build the checkout page",
			about: "One page where a person on a trial picks a plan and pays.",
			state: "done",
			summary: [
				"The checkout page is built and works on a test account.",
				"Plan picker, payment form and receipt are each a part of their own.",
			],
			createdAt: clock.at(0, "08:40"),
			updatedAt: clock.at(0, "09:40"),
		},
		{
			id: TASK_PICKER,
			parent: TASK_PAGE,
			owner: BUILDER_ID,
			title: "Plan picker",
			about: "Show the plans side by side and let the person pick one.",
			state: "done",
			summary: ["Three plans side by side, the one from the trial picked to start with."],
			createdAt: clock.at(0, "08:50"),
			updatedAt: clock.at(0, "09:05"),
		},
		{
			id: TASK_PAYFORM,
			parent: TASK_PAGE,
			after: [TASK_PICKER],
			owner: BUILDER_ID,
			title: "Payment form",
			about: "Take the payment for the picked plan on the same page.",
			state: "done",
			summary: [
				"Card payment works on a test account. It uses the card on file when there is one.",
			],
			createdAt: clock.at(0, "08:50"),
			updatedAt: clock.at(0, "09:30"),
		},
		{
			id: TASK_RECEIPT,
			parent: TASK_PAGE,
			after: [TASK_PAYFORM],
			owner: BUILDER_ID,
			title: "Receipt line",
			about: "After paying, say what was charged and when the next bill comes.",
			state: "done",
			summary: ["The page ends with the amount charged and the date of the next bill."],
			createdAt: clock.at(0, "08:50"),
			updatedAt: clock.at(0, "09:40"),
		},
		{
			id: TASK_CARD,
			parent: TASK_CHECKOUT,
			after: [TASK_PAGE],
			owner: BUILDER_ID,
			title: "Decide when the card is taken",
			about:
				"Taking the card on day 12 instead of at the start changes what every new trial user sees.",
			state: "in_progress",
			members: [FOUNDER_ID],
			reasons: [
				{
					kind: "decision",
					what: "When the card is taken: at the start, or on day 12.",
					state: "waiting",
					why: "Builder asked Finn · it is seen by every trial user, so it is not Builder's to pick",
				},
				{
					kind: "assumption",
					what: "Asking for the card on day 12 does not scare people off.",
					state: "open",
					why: "the two-week test will show it",
				},
			],
			doneWhen: [
				{
					what: "The answer is in the checkout.",
					by: "check",
					state: "open",
					how: "Put the answer into the checkout comes after this",
				},
			],
			summary: [
				"Stuck on one question: when do we take the card?",
				"Today we take it when the trial starts.",
			],
			createdAt: clock.at(0, "09:40"),
			updatedAt: clock.at(0, "09:45"),
		},
		{
			id: TASK_WIRE,
			parent: TASK_CHECKOUT,
			after: [TASK_CARD],
			owner: BUILDER_ID,
			title: "Put the answer into the checkout",
			about: "Take the card when the answer says, then hand the page to Designer for the layout.",
			state: "hold",
			createdAt: clock.at(0, "09:40"),
			updatedAt: clock.at(0, "09:40"),
		},
		{
			id: TASK_LAYOUT,
			parent: TASK_BUILD,
			owner: DESIGNER_ID,
			title: "Comparison table, stacked layout",
			about: "The table that compares the plans, stacked so it reads on a phone.",
			state: "review",
			members: [FOUNDER_ID],
			reasons: [
				{
					kind: "decision",
					what: "Stack the plans into one column below 600 px wide.",
					state: "made",
					why: "by Designer",
				},
				{
					kind: "assumption",
					what: "People compare the plans by price first.",
					state: "open",
					why: "Designer put the price on top and flagged it in the review",
				},
			],
			doneWhen: [
				{
					what: "The table reads at phone width.",
					by: "check",
					state: "met",
					how: "Designer checked it at 375 and 1280 px; both are in the review",
				},
				{
					what: "The plans read in the right order.",
					by: "review",
					state: "open",
					how: "Finn reviews it · one spot flagged",
				},
			],
			summary: [
				"Finished and waiting for a review.",
				"The table stacks into one column on a narrow screen. Two widths are in the review.",
				"One spot I am not sure about and flagged: the order of the plans on a phone.",
			],
			createdAt: clock.at(0, "09:30"),
			updatedAt: clock.at(0, "11:10"),
		},
		{
			id: TASK_REMINDER,
			parent: TASK_BUILD,
			after: [TASK_EMAIL],
			owner: BUILDER_ID,
			title: "Reminder email three days before",
			about:
				"An email three days before the trial ends that says the date and the amount of the first bill.",
			state: "in_progress",
			summary: [
				"The email text is written. I am putting in the date and the amount from billing.",
				"Next: send it to a test account.",
			],
			createdAt: clock.at(0, "16:05"),
			updatedAt: clock.at(0, "16:05"),
		},
		{
			id: TASK_TEST,
			parent: TASK_TRIALS,
			after: [TASK_BUILD],
			owner: GROWTH_ID,
			title: "Run the test for two weeks",
			about: "Half of new signups get the day-12 path, half get what we do today. Two weeks.",
			state: "hold",
			createdAt: clock.daysAgo(14),
			updatedAt: clock.daysAgo(14),
		},
		{
			id: TASK_WRITEUP,
			parent: TASK_TRIALS,
			after: [TASK_TEST],
			owner: GROWTH_ID,
			title: "Write up what we learned",
			about: "What happened, in numbers, and what we change in How we price.",
			state: "hold",
			doneWhen: [
				{
					what: "What we learned is written into How we price.",
					by: "review",
					state: "open",
					how: "Finn reviews the change",
				},
			],
			createdAt: clock.daysAgo(14),
			updatedAt: clock.daysAgo(14),
		},
	];
}

/** Twelve Mondays so far, oldest first, and the next one still to come. */
function weeklyTree(clock: DemoClock): { tasks: TaskSpec[]; mondays: string[] } {
	const mondaysBack = (i: number): number => clock.daysSinceMonday + 7 * (WEEKLY_RUNS - 1 - i);
	const mondays = Array.from({ length: WEEKLY_RUNS }, (_, i) => clock.at(mondaysBack(i), "07:00"));
	const runs = mondays.map(
		(monday, i): TaskSpec => ({
			id: weeklyRunId(i),
			parent: TASK_WEEKLY,
			position: i,
			owner: GROWTH_ID,
			title: `Week of ${weekLabel(monday)}`,
			about: `Read the support tickets from the week of ${weekLabel(monday)} and say what people struggled with most.`,
			state: "done",
			summary: [`${TICKETS[i]} tickets. Top theme: trial-end billing.`],
			createdAt: monday,
			updatedAt: clock.at(mondaysBack(i), "07:20"),
		}),
	);
	const next = clock.at(clock.daysSinceMonday - 7, "07:00");
	return {
		mondays,
		tasks: [
			{
				id: TASK_WEEKLY,
				owner: GROWTH_ID,
				title: "Support themes, weekly",
				about:
					"Every Monday, read last week's support tickets and say what people struggled with most.",
				state: "in_progress",
				summary: [
					"Trial-end billing was the top theme for the third week running: 5 of 14 tickets.",
					"New this week: two people could not find where to download an invoice.",
					"Tickets are down from 19 to 14 since the pricing page changed.",
				],
				createdAt: mondays[0] ?? clock.now,
				updatedAt: clock.at(clock.daysSinceMonday, "07:20"),
			},
			...runs,
			{
				id: WEEKLY_NEXT,
				parent: TASK_WEEKLY,
				position: WEEKLY_RUNS,
				owner: GROWTH_ID,
				title: `Week of ${weekLabel(next)}`,
				about: `Read the support tickets from the week of ${weekLabel(next)} and say what people struggled with most.`,
				state: "proposed",
				createdAt: clock.at(clock.daysSinceMonday, "07:20"),
				updatedAt: clock.at(clock.daysSinceMonday, "07:20"),
			},
		],
	};
}

/** The other root tasks the Work list shows. */
function otherRoots(clock: DemoClock): TaskSpec[] {
	return [
		{
			id: TASK_UTC,
			startedBy: FOUNDER_ID,
			owner: BUILDER_ID,
			title: "Trial dates normalised to UTC",
			about:
				"Trial end dates were stored in local time, so some trials ended a day early or a day late. Store and compare them in UTC.",
			state: "done",
			reasons: [
				{
					kind: "assumption",
					what: "Every stored trial date was in the server's time zone.",
					state: "held",
					why: "checked: Builder read all 412 trial rows",
				},
			],
			doneWhen: [
				{
					what: "Trial end dates are stored and compared in UTC.",
					by: "check",
					state: "met",
					how: "38 tests pass, 4 of them new for dates around midnight",
				},
				{
					what: "Nobody is charged on the wrong day.",
					by: "check",
					state: "met",
					how: "41 wrong end dates corrected; none had been charged yet",
				},
			],
			summary: [
				"Trial end dates are stored and compared in UTC.",
				"41 trials had the wrong end date. I corrected them; nobody was charged early.",
				"Nothing a customer sees changed.",
			],
			createdAt: clock.at(0, "05:10"),
			updatedAt: clock.at(0, "05:55"),
			threadId: THREAD_TRIAL_END,
		},
		{
			id: TASK_PRORATION,
			owner: BUILDER_ID,
			title: "Proration math covered end to end",
			about:
				"Cover proration on a mid-cycle upgrade with tests from the upgrade to the invoice, so the bug found on the trial-end work cannot come back.",
			state: "done",
			doneWhen: [
				{
					what: "Proration on a mid-cycle upgrade is right.",
					by: "check",
					state: "met",
					how: "38 tests pass, 3 new ones cover it",
				},
			],
			summary: ["Proration is covered from the upgrade to the invoice. Rounding is half-up."],
			createdAt: clock.at(0, "01:30"),
			updatedAt: clock.at(0, "03:40"),
		},
		{
			id: TASK_EXPLAIN,
			startedBy: FOUNDER_ID,
			owner: BUILDER_ID,
			title: "Explain what happens when a trial ends",
			about:
				"People finish the trial and cannot tell what they will pay. Say the date and the amount of the first bill before the trial runs out, and fix what is wrong on the way.",
			state: "review",
			threadId: THREAD_TRIAL_END,
			reasons: [
				{
					kind: "assumption",
					what: "People read the trial-end page before they are charged.",
					state: "broke",
					why: "Finn rejected round 1 for it; the warning moved into the email",
				},
				{
					kind: "assumption",
					what: "People open an email about money three days before.",
					state: "open",
					why: "opens are counted from today",
				},
				{
					kind: "decision",
					what: "Leave the trial-end page as it was.",
					state: "made",
					why: "by Builder · it was right, only not enough",
				},
			],
			doneWhen: [
				{
					what: "A warning email goes out three days before the trial ends.",
					by: "check",
					state: "met",
					how: "sent to a test account three days before its trial ended",
				},
				{
					what: "The email says the date and the amount.",
					by: "check",
					state: "met",
					how: "read back from the test inbox",
				},
				{
					what: "A customer understands what they will pay.",
					by: "review",
					state: "open",
					how: "Finn reviews it",
				},
			],
			summary: [
				"Round 1 was rejected: the warning has to be in the email, not only on the page.",
				"Round 2 moves the warning into the email and leaves the page as it was.",
			],
			createdAt: clock.at(1, "08:13"),
			updatedAt: clock.at(0, "08:17"),
		},
		{
			id: TASK_METERING,
			startedBy: FOUNDER_ID,
			owner: BUILDER_ID,
			title: "Usage-based tier, metering",
			about:
				"Meter what a team uses and bill it with the month, for the usage-based tier in Tiers and metering.",
			state: "in_progress",
			summary: ["Counting usage per team works on a test account. Now putting it on the invoice."],
			createdAt: clock.daysAgo(3),
			updatedAt: clock.hoursAgo(2),
		},
		{
			id: TASK_REFUNDS,
			startedBy: MAYA_ID,
			team: SUPPORT_TEAM_ID,
			owner: DESIGNER_ID,
			title: "Refund wording",
			about: "The words we use when we refund someone, in the help centre and on the receipt.",
			state: "review",
			members: [MAYA_ID, FOUNDER_ID],
			doneWhen: [
				{
					what: "The wording is right for customers.",
					by: "review",
					state: "open",
					how: "Maya reviews it",
				},
			],
			summary: ["Finished and waiting for Maya's review."],
			createdAt: clock.daysAgo(1),
			updatedAt: clock.hoursAgo(2),
		},
	];
}

const REFUND_WORDING = {
	id: "wording",
	kind: "text",
	label: "Help centre",
	title: "Refunds",
	body: "You get all of it back if you ask within 14 days of a payment.\n\nAfter that, we refund the days you have not used, to the card you paid with.",
} as const satisfies ReviewPart;

function questionsAndReviews(clock: DemoClock): MessageSpec[] {
	return [
		{
			id: "demo-msg-trials-01",
			threadId: taskThreadId(TASK_TRIALS),
			senderId: GROWTH_ID,
			type: "plain",
			payload: plain(
				"Two parts need a person before the test can start: one answer on the checkout and one review of the layout.",
			),
			createdAt: clock.at(0, "14:32"),
		},
		{
			id: "demo-msg-card-01",
			threadId: taskThreadId(TASK_CARD),
			senderId: BUILDER_ID,
			type: "plain",
			payload: plain("The page works. One thing I will not decide on my own."),
			createdAt: clock.at(0, "09:45"),
		},
		{
			id: "demo-msg-card-question",
			threadId: taskThreadId(TASK_CARD),
			senderId: BUILDER_ID,
			type: "questionnaire",
			payload: {
				title: "When do we take the card?",
				question:
					"Today we take it when the trial starts. A checkout on day 12 only makes sense if some people have not given one yet. It changes what every new trial user sees.\n\nKeep it up front: nothing changes for trials. Day 12 becomes a reminder with a pay-now button.\nAsk on day 12: more people start a trial. Some will leave on day 12 instead of paying.\nTest both: half of new signups each way, for two weeks.",
				options: ["Keep it up front", "Ask on day 12", "Test both"],
			},
			createdAt: clock.at(0, "09:45"),
		},
		{
			id: MSG_LAYOUT_REVIEW,
			threadId: taskThreadId(TASK_LAYOUT),
			senderId: DESIGNER_ID,
			type: "review",
			payload: {
				title: "Comparison table, stacked layout",
				stage: "Design",
				reasoning: [
					"The table stacks into one column on a narrow screen. Look at it at phone width; it reads the same at 1280.",
				],
				parts: [
					{
						id: "table",
						kind: "preview",
						label: "Live preview",
						title: "Comparison table",
						url: COMPARISON_TABLE,
					},
				],
				flags: [
					{
						id: "order",
						part: "table",
						label: "the order of the plans on a phone",
						spot: { kind: "element", selector: "#starter .price" },
						says: "I put the price on top of each plan. It assumes people compare plans by price first — I am not sure that holds on a phone.",
					},
				],
				taskId: TASK_LAYOUT,
			},
			createdAt: clock.at(0, "11:10"),
		},
		{
			id: "demo-msg-refunds-review",
			threadId: taskThreadId(TASK_REFUNDS),
			senderId: DESIGNER_ID,
			type: "review",
			payload: {
				title: "Refund wording",
				reasoning: [
					"Two short paragraphs: a full refund within 14 days of a payment, the unused days after that.",
				],
				parts: [REFUND_WORDING],
				flags: [
					{
						id: "unused",
						part: "wording",
						label: "the second paragraph",
						spot: {
							kind: "range",
							start: REFUND_WORDING.body.indexOf("days you have not used"),
							end:
								REFUND_WORDING.body.indexOf("days you have not used") +
								"days you have not used".length,
						},
						says: "This says “days you have not used”; the receipt says “unused time”. One of them should change.",
					},
				],
				reviewer: MAYA_ID,
				taskId: TASK_REFUNDS,
			},
			createdAt: clock.hoursAgo(2),
		},
		{
			id: "demo-msg-refunds-mention",
			threadId: taskThreadId(TASK_REFUNDS),
			senderId: MAYA_ID,
			type: "plain",
			payload: plain(
				"@Finn Olsen can you read the second paragraph before I approve it? It is the one customers quote back to us.",
				{ mentions: [{ id: FOUNDER_ID, name: "Finn Olsen" }] },
			),
			createdAt: clock.hoursAgo(0.05),
		},
	];
}

/** What the agents made while working, kept on the part that made it. */
interface MadeDoc {
	readonly id: string;
	readonly taskId: string;
	readonly by: string;
	readonly title: string;
	readonly body: string;
	readonly draft?: boolean;
	readonly at: string;
}

function madeWhileWorking(clock: DemoClock): MadeDoc[] {
	return [
		{
			id: "demo-doc-trial-numbers",
			taskId: TASK_NUMBERS,
			by: GROWTH_ID,
			title: "Trial-to-paid numbers, last quarter",
			body: "| | Trials | Paid | After a call |\n|---|---|---|---|\n| Last quarter | 412 | 128 (31%) | 119 |",
			at: clock.at(10, "11:00"),
		},
		{
			id: "demo-doc-dropoff",
			taskId: TASK_DROPOFF,
			by: GROWTH_ID,
			title: "Where people drop off before paying",
			body: "Of the 284 who did not pay:\n\n- 171 stopped at the card form.\n- 62 let the trial end while nobody was looking.\n- 51 left somewhere else.",
			at: clock.at(9, "14:40"),
		},
		{
			id: "demo-doc-day12-email-1",
			taskId: TASK_EMAIL,
			by: DESIGNER_ID,
			title: "Day-12 email, draft 1",
			body: "Subject: Your trial ends in two days\n\nYou have two days left. Pick a plan and keep going.",
			at: clock.at(4, "11:00"),
		},
		{
			id: "demo-doc-day12-email-2",
			taskId: TASK_EMAIL,
			by: DESIGNER_ID,
			title: "Day-12 email, draft 2",
			body: "Subject: Two days left\n\nKeep going on the Team plan for £24 a month. Pay now, or we will remind you before the trial ends.",
			at: clock.at(4, "11:40"),
		},
		{
			id: "demo-doc-day12-email",
			taskId: TASK_EMAIL,
			by: DESIGNER_ID,
			title: "Day-12 checkout email",
			body: "Subject: Keep going for £24 a month\n\nYour trial ends in two days. The Team plan is £24 a month.\n\n[Pay now]",
			at: clock.at(3, "12:00"),
		},
		{
			id: "demo-doc-billing-cards",
			taskId: TASK_CHECKOUT,
			by: BUILDER_ID,
			title: "How billing takes cards today",
			body: "The card is taken when the trial starts and charged the day after it ends. A card on file can be charged again without asking.",
			at: clock.at(1, "22:00"),
		},
		{
			id: "demo-doc-reminder-draft",
			taskId: TASK_REMINDER,
			by: BUILDER_ID,
			title: "Reminder email, draft",
			body: "Subject: Your trial ends in 3 days\n\nYour trial ends on [date]. The day after, we start your plan and charge [amount].",
			draft: true,
			at: clock.at(0, "16:12"),
		},
	];
}

export async function seedWork(db: HyperIdleDb, clock: DemoClock): Promise<void> {
	await db
		.insert(documents)
		.values({
			id: DOC_PLAN,
			scopeKind: "team",
			scopeId: PRODUCT_TEAM_ID,
			title: "Plan: trials without a call",
			body: "Can a trial turn into a paid plan without a sales call?\n\nPut a self-serve checkout in front of people on day 12, and compare it with what we do today for two weeks. Monthly plans only; yearly plans still need a call.",
			format: "markdown",
			status: "active",
			slot: "ordinary",
			parentKind: "task",
			parentId: TASK_TRIALS,
			updatedBy: FOUNDER_ID,
			createdAt: clock.daysAgo(15),
			updatedAt: clock.daysAgo(15),
		})
		.onConflictDoNothing();

	const weekly = weeklyTree(clock);
	const specs = [...trialsTree(clock), ...weekly.tasks, ...otherRoots(clock)];
	const teamOf = new Map<string, string>();
	for (const task of specs) {
		const team =
			task.team ?? (task.parent ? teamOf.get(task.parent) : undefined) ?? PRODUCT_TEAM_ID;
		teamOf.set(task.id, team);
	}

	const ownThreads: ThreadSpec[] = specs
		.filter((t) => t.threadId === undefined)
		.map((t) => ({
			id: taskThreadId(t.id),
			title: t.title,
			host: { kind: "team", id: teamOf.get(t.id) ?? PRODUCT_TEAM_ID },
			initiatorId: t.owner,
			members: [t.owner, ...(t.members ?? [])],
			createdAt: t.createdAt,
		}));
	await seedThreads(db, ownThreads, []);

	for (const task of specs) {
		const done = task.state === "done";
		const summary = task.summary?.join("\n") ?? null;
		await db
			.insert(tasks)
			.values({
				id: task.id,
				threadId: task.threadId ?? taskThreadId(task.id),
				parentTaskId: task.parent ?? null,
				teamId: teamOf.get(task.id) ?? PRODUCT_TEAM_ID,
				ownerAgentId: task.owner,
				startedBy:
					task.startedBy ??
					(task.parent ? specs.find((p) => p.id === task.parent)?.owner : task.owner),
				title: task.title,
				description: task.about,
				doneWhen: JSON.stringify(
					(task.doneWhen ?? []).map((line, i) => ({ id: `${task.id}-dw-${i}`, ...line })),
				),
				reasons: JSON.stringify(
					(task.reasons ?? []).map((reason, i) => ({ id: `${task.id}-r-${i}`, ...reason })),
				),
				state: task.state,
				dependencies: task.after ? JSON.stringify(task.after) : null,
				notes: done ? null : summary,
				position: task.position ?? Math.max(0, CHILD_ORDER.indexOf(task.id)),
				createdAt: task.createdAt,
				updatedAt: task.updatedAt,
				completedAt: done ? task.updatedAt : null,
				outcomeVerdict: done ? "met" : null,
				outcomeSummary: done ? summary : null,
				outcomeRecordedAt: done ? task.updatedAt : null,
				outcomeRecordedBy: done ? task.owner : null,
				sourceDocumentId: task.sourceDocumentId ?? null,
			})
			.onConflictDoNothing();
	}

	await seedThreads(db, [], questionsAndReviews(clock));

	// Finn started the trials task, and a person follows what they start.
	await db
		.insert(subscriptions)
		.values({
			id: "demo-sub-follow-trials",
			userId: FOUNDER_ID,
			event: "task.changed",
			objectId: TASK_TRIALS,
			schedule: null,
			paused: false,
			nextRunAt: null,
			createdAt: clock.daysAgo(14),
			updatedAt: clock.daysAgo(14),
		})
		.onConflictDoNothing();

	const made: MadeDoc[] = [
		...madeWhileWorking(clock),
		...weekly.mondays.map(
			(monday, i): MadeDoc => ({
				id: `demo-doc-support-themes-${i}`,
				taskId: weeklyRunId(i),
				by: GROWTH_ID,
				title: `Support themes, week of ${weekLabel(monday)}`,
				body: `${TICKETS[i]} tickets. Top theme: trial-end billing.`,
				at: monday,
			}),
		),
	];
	for (const doc of made) {
		await db
			.insert(documents)
			.values({
				id: doc.id,
				scopeKind: "team",
				scopeId: teamOf.get(doc.taskId) ?? PRODUCT_TEAM_ID,
				title: doc.title,
				body: doc.body,
				format: "markdown",
				status: doc.draft ? "proposed" : "active",
				slot: "ordinary",
				parentKind: "task",
				parentId: doc.taskId,
				updatedBy: doc.by,
				createdAt: doc.at,
				updatedAt: doc.at,
			})
			.onConflictDoNothing();
	}
}
