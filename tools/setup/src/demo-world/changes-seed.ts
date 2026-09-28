/**
 * AX1 — demo world changes: one "created" row per object kind so the
 * changes table is non-empty for every kind the app subscribes to.
 *
 * Only a representative sample is seeded — the full audit trail would be
 * hundreds of rows. `onConflictDoNothing` keeps this idempotent.
 */

import { changes, type HyperIdleDb } from "@hyperidle/db";
import {
	ASSISTANT_ID,
	FOUNDER_ID,
	MAYA_ID,
	PM_ID,
	ROOT_TASK_PRICING,
	ROOT_TASK_TRIAL,
	TASK_PRICING_PAGE,
	TASK_TRIAL_FLOW,
	THREAD_ASSISTANT,
	THREAD_PRICING_REVIEW,
	THREAD_TRIAL_REVIEW,
} from "./ids.js";
import type { DemoClock } from "./time.js";

export async function seedChanges(db: HyperIdleDb, clock: DemoClock): Promise<void> {
	// ── user "created" rows ────────────────────────────────────────────────────
	await db
		.insert(changes)
		.values({
			id: "demo-ch-user-founder",
			object: "user",
			objectId: FOUNDER_ID,
			kind: "created",
			actor: FOUNDER_ID,
			before: null,
			after: JSON.stringify({ id: FOUNDER_ID }),
			at: clock.daysAgo(45),
		})
		.onConflictDoNothing();

	await db
		.insert(changes)
		.values({
			id: "demo-ch-user-maya",
			object: "user",
			objectId: MAYA_ID,
			kind: "created",
			actor: FOUNDER_ID,
			before: null,
			after: JSON.stringify({ id: MAYA_ID }),
			at: clock.daysAgo(31),
		})
		.onConflictDoNothing();

	await db
		.insert(changes)
		.values({
			id: "demo-ch-user-assistant",
			object: "user",
			objectId: ASSISTANT_ID,
			kind: "created",
			actor: FOUNDER_ID,
			before: null,
			after: JSON.stringify({ id: ASSISTANT_ID }),
			at: clock.daysAgo(44),
		})
		.onConflictDoNothing();

	// ── task "created" rows ────────────────────────────────────────────────────
	await db
		.insert(changes)
		.values({
			id: "demo-ch-task-pricing",
			object: "task",
			objectId: ROOT_TASK_PRICING,
			kind: "created",
			actor: PM_ID,
			before: null,
			after: JSON.stringify({ id: ROOT_TASK_PRICING }),
			at: clock.daysAgo(21),
		})
		.onConflictDoNothing();

	await db
		.insert(changes)
		.values({
			id: "demo-ch-task-trial",
			object: "task",
			objectId: ROOT_TASK_TRIAL,
			kind: "created",
			actor: PM_ID,
			before: null,
			after: JSON.stringify({ id: ROOT_TASK_TRIAL }),
			at: clock.daysAgo(44),
		})
		.onConflictDoNothing();

	await db
		.insert(changes)
		.values({
			id: "demo-ch-task-pricing-page",
			object: "task",
			objectId: TASK_PRICING_PAGE,
			kind: "created",
			actor: PM_ID,
			before: null,
			after: JSON.stringify({ id: TASK_PRICING_PAGE }),
			at: clock.daysAgo(13),
		})
		.onConflictDoNothing();

	await db
		.insert(changes)
		.values({
			id: "demo-ch-task-trial-flow",
			object: "task",
			objectId: TASK_TRIAL_FLOW,
			kind: "created",
			actor: PM_ID,
			before: null,
			after: JSON.stringify({ id: TASK_TRIAL_FLOW }),
			at: clock.daysAgo(38),
		})
		.onConflictDoNothing();

	// ── thread "created" rows ──────────────────────────────────────────────────
	await db
		.insert(changes)
		.values({
			id: "demo-ch-thread-assistant",
			object: "thread",
			objectId: THREAD_ASSISTANT,
			kind: "created",
			actor: FOUNDER_ID,
			before: null,
			after: JSON.stringify({ id: THREAD_ASSISTANT }),
			at: clock.daysAgo(44),
		})
		.onConflictDoNothing();

	await db
		.insert(changes)
		.values({
			id: "demo-ch-thread-pricing-review",
			object: "thread",
			objectId: THREAD_PRICING_REVIEW,
			kind: "created",
			actor: PM_ID,
			before: null,
			after: JSON.stringify({ id: THREAD_PRICING_REVIEW }),
			at: clock.daysAgo(5),
		})
		.onConflictDoNothing();

	await db
		.insert(changes)
		.values({
			id: "demo-ch-thread-trial-review",
			object: "thread",
			objectId: THREAD_TRIAL_REVIEW,
			kind: "created",
			actor: PM_ID,
			before: null,
			after: JSON.stringify({ id: THREAD_TRIAL_REVIEW }),
			at: clock.daysAgo(29),
		})
		.onConflictDoNothing();

	// ── document "created" rows ────────────────────────────────────────────────
	await db
		.insert(changes)
		.values({
			id: "demo-ch-doc-pulse-brief",
			object: "document",
			objectId: "demo-doc-pulse-brief",
			kind: "created",
			actor: FOUNDER_ID,
			before: null,
			after: JSON.stringify({ id: "demo-doc-pulse-brief" }),
			at: clock.daysAgo(44),
		})
		.onConflictDoNothing();

	await db
		.insert(changes)
		.values({
			id: "demo-ch-doc-pricing-tiers",
			object: "document",
			objectId: "demo-doc-two-tier-pricing",
			kind: "created",
			actor: PM_ID,
			before: null,
			after: JSON.stringify({ id: "demo-doc-two-tier-pricing" }),
			at: clock.daysAgo(13),
		})
		.onConflictDoNothing();
}
