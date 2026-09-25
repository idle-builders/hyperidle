/**
 * AX1 — demo world activity: ~45 sessions (terminal history + two live).
 * @lore BA9d: ritual subscriptions (retro, knowledge decay, knowledge promotion) removed
 * from the demo world — the plugin owns them. A demo install without the plugin
 * shows no ritual subscriptions; installing the plugin produces exactly one of each.
 * @lore BC5 T7b: the notification-popover fixture rows and the daily-digest
 * subscription's run-history row are deleted with `notification_queue` and
 * `routine_runs` — no fabricated inbox row replaces them (no code path
 * writes an inbox row except a real subscription's own wake), so the demo
 * inbox starts empty.
 */

import { type HyperIdleDb, sessions } from "@hyperidle/db";
import {
	ASSISTANT_ID,
	BUILDER_ID,
	GROWTH_ID,
	PM_ID,
	QA_ID,
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
		{ taskId: TASK_TRIAL_MEASURE, agentId: QA_ID, finishedDaysAgo: 15, count: 2 },
		{ taskId: TASK_SEARCH_PROFILE, agentId: BUILDER_ID, finishedDaysAgo: 30, count: 2 },
		{ taskId: TASK_SEARCH_RANKING, agentId: BUILDER_ID, finishedDaysAgo: 24, count: 3 },
		{ taskId: TASK_SEARCH_EVAL, agentId: QA_ID, finishedDaysAgo: 21, count: 2 },
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

	// ── Live session: one on a task ────────────────────────────────────────
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

	// Review-found defect: this used to be seeded "active" forever, which
	// permanently occupied the assistant's one concurrency slot and required
	// bumping that slot count to 2 just to make room for it — a fake session
	// forcing a fake ceiling. Seeded terminal instead (ended an hour ago), so
	// the demo shows honest concurrency: a single slot, and the assistant is
	// actually free to answer.
	await db
		.insert(sessions)
		.values({
			id: SESSION_ACTIVE_ASSISTANT,
			taskId: null,
			agentId: ASSISTANT_ID,
			modelTier: "fast",
			startedAt: clock.hoursAgo(1.25),
			endedAt: clock.hoursAgo(1),
			state: "done",
			outcome: "completed",
			notes: "Prepared the morning summary.",
			effectivenessScore: "0.85",
			effectivenessRecordedAt: clock.hoursAgo(1),
			effectivenessRecordedBy: "demo-founder",
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
