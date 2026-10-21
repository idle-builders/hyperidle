/**
 * The conversations that are not a task's own: the hand-off "Trial-end
 * confusion, three tickets" — Maya's tickets, Builder taking it, its question
 * about the charge's name, the two reviews and round 1 rejected with a reason —
 * Maya's question about the rollout rule, three quieter threads, and the
 * comments on "Should trials be 10 days?".
 */

import type { HyperIdleDb } from "@hyperidle/db";
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
				reasoning: [
					"Page says the date and the amount before the trial runs out. Proration bug fixed on the way. Two things I flagged for you.",
					"Proration bug on mid-cycle upgrade — fixed, 3 cases cover it.",
					"Pricing page and receipt now name the first bill and its date.",
					"Support macro updated to match.",
					"Flag A, on the warning email: I added the amount, not just the date — you did not ask for that. Dishonest to warn about a charge without saying how much.",
					"Flag B, on proration.ts:216: rounding is half-up at the boundary now. It matches the invoice engine, but it is a behaviour change.",
				],
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
					"ZD-4471, to priya@northwind.co: You were charged on 2 September, the day your trial ended. We have rewritten that page so the date and amount now show before the trial runs out — and here is the breakdown for your account.",
					"ZD-4468, to sam@lumen.dev: Your first bill is £24 on 12 September for the Team plan. You will get an email three days before. The pricing page now says this on the plan you are trialling.",
					"ZD-4460, to ops@fairbank.io: That invoice covered the first month starting the day the trial ended. We found a proration bug on mid-cycle upgrades that made it read oddly — fixed, and your invoice has been reissued.",
					"These go to customers, so I am not sending them — and they are not yours to approve either. They are Maya's.",
				],
				taskId: TASK_EXPLAIN,
			},
		}),
		trialEnd("07", FOUNDER_ID, clock.at(1, "14:50"), {
			type: "plain",
			payload: plain("“2 September” reads as the trial end date. Both dates?", {
				spotLabel: "the heading",
			}),
		}),
		trialEnd("08", BUILDER_ID, clock.at(1, "14:52"), {
			type: "plain",
			payload: plain("Changed to “Trial ends 1 Sep · first bill 2 Sep”.", {
				spotLabel: "the heading",
			}),
		}),
		trialEnd("09", FOUNDER_ID, clock.at(1, "15:05"), {
			type: "plain",
			payload: plain("This one went the wrong way — is that us?", { spotLabel: "refund requests" }),
		}),
		trialEnd("10", BUILDER_ID, clock.at(1, "15:07"), {
			type: "plain",
			payload: plain(
				"Three of the four predate the fix. The fourth asked for a refund because they did not see the warning, which is the thing we just changed.",
				{ spotLabel: "refund requests" },
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
				reasoning: [
					"Moved the warning into the email, as you asked. The page stays as it was. Two things I flagged for you.",
					"New: the three-day warning email, with date and amount.",
					"Same: the trial-end page and the proration fix.",
					"Flag A, on the warning email: this is what you asked for — the three-day warning now goes out by email, with the date and the amount.",
					"Flag B, on the trial-end page: unchanged from round 1. The page still says the same thing, so the email and the page agree.",
				],
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
				options: [],
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
				blockId: "what-we-know",
				spotLabel: "Most cancellations happen on day 13.",
			}),
			createdAt: clock.at(0, "10:42"),
		},
		{
			id: "demo-msg-ten-days-02",
			threadId: THREAD_TEN_DAYS,
			senderId: GROWTH_ID,
			type: "plain",
			payload: plain("About 1 in 5. This line should say so.", {
				blockId: "what-we-know",
				spotLabel: "Most cancellations happen on day 13.",
			}),
			createdAt: clock.at(0, "10:44"),
		},
	];

	await seedThreads(db, threadSpecs, messageSpecs);
}
