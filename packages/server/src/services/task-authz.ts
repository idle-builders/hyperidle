/**
 * L15 §2.6 — task-scoped authorization helper.
 *
 * @lore L15 §2.6 CRITICAL-3: `senderId` is opaque (verified
 * `threads.ts:50–56`). Founder bypass is the literal string `u-founder`;
 * non-founder senders must resolve to an `agents.id` whose `team_id`
 * matches `task.team_id`. 404 (not 403) on cross-team attempts to avoid
 * leaking task existence — § 10 row 10.
 */

import { agents, type HyperIdleDb } from "@hyperidle/db";
import { API_ERROR_CODES } from "@hyperidle/shared";
import { eq } from "drizzle-orm";

const FOUNDER_IDENTITY = "u-founder";

export type TaskAuthzResult =
	| { ok: true }
	| { ok: false; status: 404; code: string; message: string };

interface TaskShape {
	readonly id: string;
	readonly teamId: string;
}

// @lore L15 security MUST-FIX-1: cross-team and not-exist branches MUST return
// byte-identical 404 bodies (status, error, code). Anything else is a 1-bit
// existence oracle. Use uppercase API_ERROR_CODES.NOT_FOUND to match the rest
// of the routes' constant-cased codes (tasks.ts:268,309,342,388).
export function assertTaskParticipantAuthz(
	db: HyperIdleDb,
	senderId: string,
	task: TaskShape,
): TaskAuthzResult {
	if (senderId === FOUNDER_IDENTITY) {
		return { ok: true };
	}
	const agent = db.select().from(agents).where(eq(agents.id, senderId)).get();
	if (!agent) {
		return {
			ok: false,
			status: 404,
			code: API_ERROR_CODES.NOT_FOUND,
			message: "Task not found",
		};
	}
	if (agent.role === "founder") {
		return { ok: true };
	}
	if (agent.teamId && agent.teamId === task.teamId) {
		return { ok: true };
	}
	return {
		ok: false,
		status: 404,
		code: API_ERROR_CODES.NOT_FOUND,
		message: "Task not found",
	};
}
