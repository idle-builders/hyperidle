/**
 * AX1 — demo world activity: ~45 sessions (terminal history + two live),
 * the skeleton's daily digest with run history, and the notifications.
 * @lore BA9d: ritual routines (retro, knowledge decay, knowledge promotion) removed
 * from the demo world — the plugin owns them. A demo install without the plugin
 * shows no ritual routines; installing the plugin produces exactly one of each.
 */

import {
	type HyperIdleDb,
	notificationQueue,
	routineRuns,
	routines,
	sessions,
} from "@hyperidle/db";
import { eq } from "drizzle-orm";
import {
	ASSISTANT_ID,
	BUILDER_ID,
	GROWTH_ID,
	MSG_PRICING_REVIEW,
	PM_ID,
	ROUTINE_DAILY_DIGEST,
	SESSION_ACTIVE_ASSISTANT,
	SESSION_ACTIVE_COPY,
	TASK_MOBILE_RESEARCH,
	TASK_ONBOARD_AUDIT,
	TASK_PRICING_COPY,
	TASK_PRICING_RESEARCH,
	TASK_PRICING_TIERS,
	TASK_SEARCH_EVAL,
	TASK_SEARCH_PROFILE,
	TASK_SEARCH_RANKING,
	TASK_TRIAL_BANNER,
	TASK_TRIAL_EMAIL,
	TASK_TRIAL_FLOW,
	TASK_TRIAL_HEURISTIC,
	TASK_TRIAL_MEASURE,
	THREAD_PRICING_BLOCKED,
	THREAD_PRICING_REVIEW,
} from "./ids.js";
import type { DemoClock } from "./time.js";

interface DoneTaskRef {
	readonly taskId: string;
	readonly agentId: string;
	/** Days ago the task finished — sessions cluster just before it. */
	readonly finishedDaysAgo: number;
	readonly count: number;
}

const SESSION_NOTES: readonly string[] = [
	"Implemented the core path and covered it with tests. Remaining: edge cases at the boundary.",
	"Spent the first half reproducing the issue, the second half fixing it. Root cause was an ordering assumption.",
	"Draft complete and self-reviewed against the done condition. Left one open question in the task notes.",
	"Worked through the spec step by step; the done condition is met in staging. Watching for regressions.",
	"Hit a snag with the fixture data halfway through, resolved it, and documented the gotcha as knowledge.",
	"Finished ahead of the estimate. Used the spare context to clean up two adjacent rough edges.",
];

export async function seedActivity(db: HyperIdleDb, clock: DemoClock): Promise<void> {
	await seedSessions(db, clock);
	await seedNotifications(db, clock);
}

async function seedSessions(db: HyperIdleDb, clock: DemoClock): Promise<void> {
	// ── Terminal sessions clustered around finished tasks ─────────────────
	const doneTasks: readonly DoneTaskRef[] = [
		{ taskId: TASK_PRICING_RESEARCH, agentId: PM_ID, finishedDaysAgo: 16, count: 3 },
		{ taskId: TASK_PRICING_TIERS, agentId: PM_ID, finishedDaysAgo: 13, count: 2 },
		{ taskId: TASK_ONBOARD_AUDIT, agentId: PM_ID, finishedDaysAgo: 6, count: 2 },
		{ taskId: TASK_TRIAL_BANNER, agentId: BUILDER_ID, finishedDaysAgo: 33, count: 2 },
		{ taskId: TASK_TRIAL_FLOW, agentId: BUILDER_ID, finishedDaysAgo: 29, count: 3 },
		{ taskId: TASK_TRIAL_EMAIL, agentId: GROWTH_ID, finishedDaysAgo: 27, count: 2 },
		{ taskId: TASK_TRIAL_HEURISTIC, agentId: PM_ID, finishedDaysAgo: 30, count: 1 },
		{ taskId: TASK_TRIAL_MEASURE, agentId: "demo-agent-qa", finishedDaysAgo: 15, count: 2 },
		{ taskId: TASK_SEARCH_PROFILE, agentId: BUILDER_ID, finishedDaysAgo: 30, count: 2 },
		{ taskId: TASK_SEARCH_RANKING, agentId: BUILDER_ID, finishedDaysAgo: 24, count: 3 },
		{ taskId: TASK_SEARCH_EVAL, agentId: "demo-agent-qa", finishedDaysAgo: 21, count: 2 },
		{ taskId: TASK_MOBILE_RESEARCH, agentId: PM_ID, finishedDaysAgo: 12, count: 2 },
	];

	let noteIndex = 0;
	for (const ref of doneTasks) {
		for (let i = 0; i < ref.count; i++) {
			const startedDaysAgo = ref.finishedDaysAgo + (ref.count - i);
			const crashed = ref.taskId === TASK_SEARCH_RANKING && i === 0;
			const stopped = ref.taskId === TASK_TRIAL_EMAIL && i === 0;
			const durationHours = 1 + ((i + ref.finishedDaysAgo) % 3);
			const startedAt = clock.daysAgoAt(startedDaysAgo, 9 + (i % 4) * 2);
			const endedAt = new Date(
				new Date(startedAt).getTime() + durationHours * 3_600_000,
			).toISOString();
			await db
				.insert(sessions)
				.values({
					id: `demo-session-${ref.taskId}-${i + 1}`,
					taskId: ref.taskId,
					agentId: ref.agentId,
					modelTier: i === 0 ? "reasoning" : "workhorse",
					startedAt,
					endedAt,
					state: "done",
					outcome: crashed ? "crashed" : stopped ? "stopped" : "completed",
					notes: crashed
						? "Session crashed mid-run during the ranking change; recovered context from the task notes in the next session."
						: SESSION_NOTES[noteIndex++ % SESSION_NOTES.length],
					effectivenessScore: crashed
						? "0.2"
						: (0.7 + ((i + ref.finishedDaysAgo) % 5) * 0.05).toFixed(2),
					effectivenessRecordedAt: endedAt,
					effectivenessRecordedBy: PM_ID,
				})
				.onConflictDoNothing();
		}
	}

	// ── Live sessions: one on a task, one assistant turn ──────────────────
	await db
		.insert(sessions)
		.values({
			id: SESSION_ACTIVE_COPY,
			taskId: TASK_PRICING_COPY,
			agentId: GROWTH_ID,
			modelTier: "workhorse",
			startedAt: clock.hoursAgo(2),
			endedAt: null,
			state: "active",
			notes: "Working through the FAQ copy and the tier descriptions.",
		})
		.onConflictDoNothing();

	await db
		.insert(sessions)
		.values({
			id: SESSION_ACTIVE_ASSISTANT,
			taskId: null,
			agentId: ASSISTANT_ID,
			modelTier: "fast",
			startedAt: clock.hoursAgo(1),
			endedAt: null,
			state: "active",
			notes: "Preparing the morning summary.",
		})
		.onConflictDoNothing();

	// ── Assistant turn history (task-free sessions) ───────────────────────
	for (let i = 0; i < 6; i++) {
		const startedAt = clock.daysAgoAt(35 - i * 6, 8);
		await db
			.insert(sessions)
			.values({
				id: `demo-session-assistant-turn-${i + 1}`,
				taskId: null,
				agentId: ASSISTANT_ID,
				modelTier: "reasoning",
				startedAt,
				endedAt: new Date(new Date(startedAt).getTime() + 45 * 60_000).toISOString(),
				state: "done",
				outcome: "completed",
				notes:
					i === 0
						? "Monthly reflection with the founder; focus list updated."
						: "Morning check-in: summarized waiting reviews and overnight activity.",
				effectivenessScore: "0.85",
				effectivenessRecordedAt: startedAt,
				effectivenessRecordedBy: "demo-founder",
			})
			.onConflictDoNothing();
	}
}

async function seedNotifications(db: HyperIdleDb, clock: DemoClock): Promise<void> {
	// ── Notifications waiting in the popover ──────────────────────────────
	const notifications: readonly {
		id: string;
		eventType: string;
		subjectId: string;
		title: string;
		body: string;
		reason: string;
		typeKey: string;
		urgency: string;
		sourceLink: string;
		createdAt: string;
		seenAt?: string;
		readAt?: string;
	}[] = [
		{
			id: "demo-notif-pricing-review",
			eventType: "review_requested",
			subjectId: MSG_PRICING_REVIEW,
			title: "Review requested: New pricing page",
			body: "Acme Designer requests your verdict on the pricing page build.",
			reason: "review_request",
			typeKey: "review_request",
			urgency: "immediate",
			sourceLink: `/conversations/${THREAD_PRICING_REVIEW}`,
			createdAt: clock.hoursAgo(5),
		},
		{
			id: "demo-notif-annual-blocked",
			eventType: "task_blocked",
			subjectId: "demo-task-pricing-annual",
			title: "Annual billing is blocked",
			body: "The Builder needs your discount decision to continue.",
			reason: "blocker_alert",
			typeKey: "blocker_alert",
			urgency: "immediate",
			sourceLink: `/conversations/${THREAD_PRICING_BLOCKED}`,
			createdAt: clock.hoursAgo(26),
		},
		{
			id: "demo-notif-trial-review",
			eventType: "review_requested",
			subjectId: MSG_PRICING_REVIEW,
			title: "Review requested: Trial extension flow",
			body: "Approved — the verdict landed the same day.",
			reason: "review_request",
			typeKey: "review_request",
			urgency: "immediate",
			sourceLink: `/conversations/${THREAD_PRICING_REVIEW}`,
			createdAt: clock.daysAgo(29),
			seenAt: clock.daysAgo(29),
			readAt: clock.daysAgo(29),
		},
	];

	for (const notification of notifications) {
		await db
			.insert(notificationQueue)
			.values({
				id: notification.id,
				eventType: notification.eventType,
				subjectId: notification.subjectId,
				severity: "blocking",
				title: notification.title,
				body: notification.body,
				reason: notification.reason,
				status: "sent",
				typeKey: notification.typeKey,
				urgency: notification.urgency,
				sourceLink: notification.sourceLink,
				createdAt: notification.createdAt,
				sentAt: notification.createdAt,
				seenAt: notification.seenAt ?? null,
				readAt: notification.readAt ?? null,
			})
			.onConflictDoNothing();
	}

	// The skeleton's daily-digest routine stays inactive but gets a last-run
	// history entry so the routine pane has something to show.
	await db
		.update(routines)
		.set({ lastRunAt: clock.daysAgo(1), nextRunAt: clock.daysAgo(-1) })
		.where(eq(routines.id, ROUTINE_DAILY_DIGEST));
	await db
		.insert(routineRuns)
		.values({
			id: "demo-run-digest-1",
			routineId: ROUTINE_DAILY_DIGEST,
			startedAt: clock.daysAgoAt(1, 8),
			endedAt: clock.daysAgoAt(1, 8),
			outcome: "success",
			errorMessage: null,
			sessionId: null,
			summary: "Digest compiled: two reviews waiting, one task blocked.",
		})
		.onConflictDoNothing();
}
