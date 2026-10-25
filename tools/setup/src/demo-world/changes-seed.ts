/**
 * What changed, and what Finn is told about. The `changes` rows are a sample
 * — enough that every object kind has some, and that each notification points
 * at the change it tells about. Finn's inbox: Proration done and How we price
 * edited are new; July support themes published and the layout review raised
 * he has read.
 */

import { changes, type HyperIdleDb, inbox } from "@hyperidle/db";
import {
	BUILDER_ID,
	DESIGNER_ID,
	DOC_HOW_WE_PRICE,
	DOC_JULY_THEMES,
	FOUNDER_ID,
	GROWTH_ID,
	MAYA_ID,
	MSG_LAYOUT_REVIEW,
	TASK_LAYOUT,
	TASK_PRORATION,
	TASK_TRIALS,
	TASK_UTC,
	THREAD_TRIAL_END,
	taskThreadId,
} from "./ids.js";
import type { DemoClock } from "./time.js";

interface ChangeSpec {
	readonly id: string;
	readonly object: "task" | "thread" | "document" | "user";
	readonly objectId: string;
	readonly kind: "created" | "changed" | "message";
	readonly actor: string;
	readonly before?: Record<string, unknown>;
	readonly after: Record<string, unknown>;
	readonly at: string;
	/** Finn's notification for it: unread, or read at this time. */
	readonly told?: { readonly readAt: string | null };
}

export async function seedChanges(db: HyperIdleDb, clock: DemoClock): Promise<void> {
	const specs: readonly ChangeSpec[] = [
		...[
			[FOUNDER_ID, 98],
			[MAYA_ID, 97],
			[BUILDER_ID, 98],
			[GROWTH_ID, 87],
			[DESIGNER_ID, 81],
		].map(
			([id, days]): ChangeSpec => ({
				id: `demo-ch-user-${id}`,
				object: "user",
				objectId: String(id),
				kind: "created",
				actor: FOUNDER_ID,
				after: { id },
				at: clock.daysAgo(Number(days)),
			}),
		),
		{
			id: "demo-ch-task-trials",
			object: "task",
			objectId: TASK_TRIALS,
			kind: "created",
			actor: FOUNDER_ID,
			after: { id: TASK_TRIALS, state: "proposed" },
			at: clock.daysAgo(14),
		},
		{
			id: "demo-ch-task-utc",
			object: "task",
			objectId: TASK_UTC,
			kind: "changed",
			actor: BUILDER_ID,
			before: { state: "in_progress" },
			after: { state: "done" },
			at: clock.at(0, "05:55"),
		},
		{
			id: "demo-ch-task-proration",
			object: "task",
			objectId: TASK_PRORATION,
			kind: "changed",
			actor: BUILDER_ID,
			before: { state: "in_progress" },
			after: { state: "done" },
			at: clock.at(0, "03:40"),
			told: { readAt: null },
		},
		{
			id: "demo-ch-thread-trial-end",
			object: "thread",
			objectId: THREAD_TRIAL_END,
			kind: "created",
			actor: MAYA_ID,
			after: { id: THREAD_TRIAL_END },
			at: clock.at(1, "08:12"),
		},
		{
			id: "demo-ch-thread-layout-review",
			object: "thread",
			objectId: taskThreadId(TASK_LAYOUT),
			kind: "message",
			actor: DESIGNER_ID,
			after: { messageId: MSG_LAYOUT_REVIEW, type: "review" },
			at: clock.at(0, "11:10"),
			told: { readAt: clock.at(0, "11:30") },
		},
		{
			id: "demo-ch-doc-how-we-price",
			object: "document",
			objectId: DOC_HOW_WE_PRICE,
			kind: "changed",
			actor: GROWTH_ID,
			before: { version: 1 },
			after: { version: 2 },
			at: clock.daysAgo(2),
			told: { readAt: null },
		},
		{
			id: "demo-ch-doc-july-themes",
			object: "document",
			objectId: DOC_JULY_THEMES,
			kind: "changed",
			actor: MAYA_ID,
			before: { status: "proposed" },
			after: { status: "active" },
			at: clock.daysAgo(3),
			told: { readAt: clock.daysAgo(3) },
		},
	];

	for (const spec of specs) {
		await db
			.insert(changes)
			.values({
				id: spec.id,
				object: spec.object,
				objectId: spec.objectId,
				kind: spec.kind,
				actor: spec.actor,
				before: spec.before ? JSON.stringify(spec.before) : null,
				after: JSON.stringify(spec.after),
				at: spec.at,
			})
			.onConflictDoNothing();
		if (spec.told) {
			await db
				.insert(inbox)
				.values({
					userId: FOUNDER_ID,
					changeId: spec.id,
					seenAt: spec.told.readAt,
					readAt: spec.told.readAt,
				})
				.onConflictDoNothing();
		}
	}
}
