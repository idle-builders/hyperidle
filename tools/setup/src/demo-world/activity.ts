/**
 * The sessions behind the work: one row per time an agent worked on a task,
 * with what it did. Two are running now — Builder's reminder email and the
 * metering — which fills Builder's two slots.
 */

import { type HyperIdleDb, sessions } from "@hyperidle/db";
import {
	BUILDER_ID,
	DESIGNER_ID,
	GROWTH_ID,
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
	TASK_TRIALS,
	TASK_UNDERSTAND,
	TASK_UTC,
	TASK_WEEKLY,
	weeklyRunId,
} from "./ids.js";
import type { DemoClock } from "./time.js";

interface SessionSpec {
	readonly taskId: string;
	readonly agentId: string;
	readonly startedAt: string;
	/** Minutes it ran; a running session has none. */
	readonly minutes?: number;
	readonly notes: string;
}

export async function seedActivity(db: HyperIdleDb, clock: DemoClock): Promise<void> {
	const specs: SessionSpec[] = [
		// Growth checks on the trials task every couple of days and rewrites its summary.
		...[13, 11, 8, 5, 2].map((days) => ({
			taskId: TASK_TRIALS,
			agentId: GROWTH_ID,
			startedAt: clock.at(days, "14:00"),
			minutes: 80,
			notes: "Checked on the parts, wrote the summary.",
		})),
		{
			taskId: TASK_TRIALS,
			agentId: GROWTH_ID,
			startedAt: clock.at(0, "14:10"),
			minutes: 22,
			notes: "Checked on the parts, wrote the summary.",
		},
		{
			taskId: TASK_NUMBERS,
			agentId: GROWTH_ID,
			startedAt: clock.at(10, "10:20"),
			minutes: 40,
			notes: "Pulled last quarter's trials and conversions. Finished.",
		},
		{
			taskId: TASK_DROPOFF,
			agentId: GROWTH_ID,
			startedAt: clock.at(9, "13:20"),
			minutes: 80,
			notes: "Followed the people who did not pay to where they stopped. Finished.",
		},
		{
			taskId: TASK_UNDERSTAND,
			agentId: GROWTH_ID,
			startedAt: clock.at(9, "14:45"),
			minutes: 15,
			notes: "Read both parts, wrote the summary.",
		},
		...[
			[4, "15:00"],
			[2, "15:00"],
			[0, "14:05"],
		].map(([days, at]) => ({
			taskId: TASK_BUILD,
			agentId: GROWTH_ID,
			startedAt: clock.at(Number(days), String(at)),
			minutes: 5,
			notes: "Read the parts, wrote the summary.",
		})),
		{
			taskId: TASK_EMAIL,
			agentId: DESIGNER_ID,
			startedAt: clock.at(4, "10:50"),
			minutes: 50,
			notes: "Wrote two drafts.",
		},
		{
			taskId: TASK_EMAIL,
			agentId: DESIGNER_ID,
			startedAt: clock.at(3, "11:25"),
			minutes: 35,
			notes: "Picked the subject line, finished the email.",
		},
		{
			taskId: TASK_CHECKOUT,
			agentId: BUILDER_ID,
			startedAt: clock.at(1, "21:15"),
			minutes: 48,
			notes: "Read how billing takes cards today, split the work in three.",
		},
		{
			taskId: TASK_PAGE,
			agentId: BUILDER_ID,
			startedAt: clock.at(0, "08:40"),
			minutes: 10,
			notes: "Split the page in three.",
		},
		{
			taskId: TASK_PICKER,
			agentId: BUILDER_ID,
			startedAt: clock.at(0, "08:50"),
			minutes: 15,
			notes: "Finished.",
		},
		{
			taskId: TASK_PAYFORM,
			agentId: BUILDER_ID,
			startedAt: clock.at(0, "09:05"),
			minutes: 25,
			notes: "Finished.",
		},
		{
			taskId: TASK_RECEIPT,
			agentId: BUILDER_ID,
			startedAt: clock.at(0, "09:30"),
			minutes: 10,
			notes: "Finished.",
		},
		{
			taskId: TASK_CARD,
			agentId: BUILDER_ID,
			startedAt: clock.at(0, "09:40"),
			minutes: 5,
			notes: "Stopped to ask.",
		},
		{
			taskId: TASK_LAYOUT,
			agentId: DESIGNER_ID,
			startedAt: clock.at(0, "09:30"),
			minutes: 100,
			notes: "Finished, asked for a review.",
		},
		{
			taskId: TASK_REMINDER,
			agentId: BUILDER_ID,
			startedAt: clock.at(0, "16:05"),
			notes:
				"Read the Trials document for the wording we use. Wrote the email text. Asked billing for the date and amount of the first bill. Started putting both into the email.",
		},
		{
			taskId: TASK_UTC,
			agentId: BUILDER_ID,
			startedAt: clock.at(0, "05:10"),
			minutes: 45,
			notes: "Finished.",
		},
		{
			taskId: TASK_PRORATION,
			agentId: BUILDER_ID,
			startedAt: clock.at(0, "01:30"),
			minutes: 130,
			notes: "Covered proration from the upgrade to the invoice. Finished.",
		},
		{
			taskId: TASK_EXPLAIN,
			agentId: BUILDER_ID,
			startedAt: clock.at(1, "08:14"),
			minutes: 260,
			notes:
				"Read 14 support tickets tagged trial-end. Traced entitlement dates through billing. Found the proration bug on mid-cycle upgrade. Wrote the fix and 3 cases. Drafted the explainer copy.",
		},
		{
			taskId: TASK_EXPLAIN,
			agentId: BUILDER_ID,
			startedAt: clock.at(0, "06:30"),
			minutes: 105,
			notes: "Moved the warning into the email, sent it to a test account, raised round 2.",
		},
		{
			taskId: TASK_METERING,
			agentId: BUILDER_ID,
			startedAt: clock.hoursAgo(2),
			notes: "Putting the metered usage on the invoice.",
		},
		{
			taskId: TASK_REFUNDS,
			agentId: DESIGNER_ID,
			startedAt: clock.hoursAgo(3),
			minutes: 55,
			notes: "Wrote the wording, asked Maya for a review.",
		},
		// Each Monday's run reads the tickets; a short session afterwards updates the summary.
		...Array.from({ length: 12 }, (_, i) => ({
			taskId: weeklyRunId(i),
			agentId: GROWTH_ID,
			startedAt: clock.at(clock.daysSinceMonday + 7 * (11 - i), "07:00"),
			minutes: 18,
			notes: "Read the week's tickets and wrote the themes down. Finished.",
		})),
		{
			taskId: TASK_WEEKLY,
			agentId: GROWTH_ID,
			startedAt: clock.at(clock.daysSinceMonday, "07:18"),
			minutes: 2,
			notes: "Read the run, wrote the summary.",
		},
	];

	for (const [i, spec] of specs.entries()) {
		const running = spec.minutes === undefined;
		await db
			.insert(sessions)
			.values({
				id: `demo-session-${i + 1}`,
				taskId: spec.taskId,
				agentId: spec.agentId,
				modelTier: "workhorse",
				startedAt: spec.startedAt,
				endedAt: running
					? null
					: new Date(
							new Date(spec.startedAt).getTime() + (spec.minutes ?? 0) * 60_000,
						).toISOString(),
				state: running ? "active" : "done",
				outcome: running ? null : "completed",
				notes: spec.notes,
			})
			.onConflictDoNothing();
	}
}
