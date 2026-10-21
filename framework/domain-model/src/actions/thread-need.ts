/** What a conversation waits on from the one reading it — computed, never stored. */
export type ThreadNeed = "stuck" | "input" | "review" | null;

/**
 * Derive the status word a conversation shows its reader, from its unresolved
 * questions and reviews. An agent asking means it cannot go on (stuck); a
 * person asking needs input. What the reader raised waits on others, not them.
 * Precedence: stuck > input > review, the same as a task's.
 */
export function computeThreadNeed(
	viewer: string,
	open: ReadonlyArray<{
		readonly type: string;
		readonly senderId: string;
		readonly senderIsAgent: boolean;
	}>,
): ThreadNeed {
	const theirs = open.filter((m) => m.senderId !== viewer);
	const questions = theirs.filter((m) => m.type === "questionnaire");
	if (questions.some((m) => m.senderIsAgent)) return "stuck";
	if (questions.length > 0) return "input";
	if (theirs.some((m) => m.type === "review")) return "review";
	return null;
}
