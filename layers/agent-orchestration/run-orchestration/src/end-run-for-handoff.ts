// @lore: handoff run-end — no CAS on active, no session_ended, no outcome; CAS no-op silences live run; event creates spurious review; outcome re-enters loop
// @lore: handoff run-end — no safety net; no stale-session sweep; failed call leaves session active; must share caller's tx: run terminal at same commit as claim

import { sessions, type WriteExecutor } from "@hyperidle/db";
import { eq } from "drizzle-orm";

export async function endRunForHandoff(
	exec: WriteExecutor,
	sessionId: string,
	endedAt: string,
): Promise<void> {
	await exec.update(sessions).set({ state: "done", endedAt }).where(eq(sessions.id, sessionId));
}
