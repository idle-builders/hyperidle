/**
 * Stable ids for the demo world, in one place. Every row the demo world inserts
 * itself carries a `demo-*` id; the plugin's agent carries the id the installer
 * gives it. Fixed ids + `onConflictDoNothing` = idempotent reseeding.
 */

import { fileURLToPath } from "node:url";
import { pluginAgentId } from "@hyperidle/core-api";

// ── Teams and people ────────────────────────────────────────────────────────
// One organisation, two teams. Finn is in both, Maya in Support; each owned
// agent is in one of its owner's teams; the plugin's agent works for everyone.
export const PRODUCT_TEAM_ID = "demo-team-product";
export const SUPPORT_TEAM_ID = "demo-team-support";
export const FOUNDER_ID = "demo-founder";
export const MAYA_ID = "demo-human-maya";
export const BUILDER_ID = "demo-agent-builder";
export const GROWTH_ID = "demo-agent-growth";
export const DESIGNER_ID = "demo-agent-designer";

/** The Team habits plugin is installed from this folder, for everyone. */
export const TEAM_HABITS_DIR = fileURLToPath(new URL("./team-habits", import.meta.url));
export const FACILITATION_ID = pluginAgentId("team-habits", "facilitation", {
	kind: "factory",
	teamId: null,
});

// ── Work ────────────────────────────────────────────────────────────────────
export const TASK_TRIALS = "demo-task-trials";
// Its parts, and their parts.
export const TASK_UNDERSTAND = "demo-task-trials-understand";
export const TASK_NUMBERS = "demo-task-trials-numbers";
export const TASK_DROPOFF = "demo-task-trials-dropoff";
export const TASK_BUILD = "demo-task-trials-build";
export const TASK_EMAIL = "demo-task-trials-email";
export const TASK_CHECKOUT = "demo-task-trials-checkout";
export const TASK_PAGE = "demo-task-trials-page";
export const TASK_PICKER = "demo-task-trials-picker";
export const TASK_PAYFORM = "demo-task-trials-payform";
export const TASK_RECEIPT = "demo-task-trials-receipt";
export const TASK_CARD = "demo-task-trials-card";
export const TASK_WIRE = "demo-task-trials-wire";
export const TASK_LAYOUT = "demo-task-trials-layout";
export const TASK_REMINDER = "demo-task-trials-reminder";
export const TASK_TEST = "demo-task-trials-test";
export const TASK_WRITEUP = "demo-task-trials-writeup";
export const TASK_UTC = "demo-task-utc";
export const TASK_WEEKLY = "demo-task-weekly-themes";
/** One part per Monday run, oldest first. */
export const weeklyRunId = (i: number): string => `demo-task-weekly-run-${i}`;
export const TASK_EXPLAIN = "demo-task-explain-trial-end";
export const TASK_PRORATION = "demo-task-proration";
export const TASK_METERING = "demo-task-metering";
export const TASK_REFUNDS = "demo-task-refund-wording";

/** A task's own conversation. */
export const taskThreadId = (taskId: string): string => `thr-${taskId}`;

// ── Conversations ───────────────────────────────────────────────────────────
export const THREAD_TRIAL_END = "demo-thread-trial-end";
export const THREAD_TEN_DAYS = "demo-thread-ten-days";
export const MSG_LAYOUT_REVIEW = "demo-msg-layout-review";
export const MSG_EXPLAINER_REVIEW = "demo-msg-explainer-review-2";

// ── Knowledge ───────────────────────────────────────────────────────────────
export const DOC_HOW_WE_PRICE = "demo-doc-how-we-price";
export const DOC_TEN_DAYS = "demo-doc-ten-days";
export const DOC_DEPLOY_RULE = "demo-doc-deploy-rule";
export const DOC_JULY_THEMES = "demo-doc-july-themes";
export const DOC_PLAN = "demo-doc-plan-trials";
