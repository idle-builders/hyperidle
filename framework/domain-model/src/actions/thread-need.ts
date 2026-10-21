/** What a conversation waits on from the one reading it — computed, never stored. */
export type ThreadNeed = "stuck" | "input" | "review" | null;

/**
 * Derive the status word a conversation shows its reader, from its unresolved
 * questions and reviews. An agent asking means it cannot go on (stuck); a
 * person asking needs input. What the reader raised waits on others, not them, and
 * so does a review that names someone else as its reviewer.
 * Precedence: stuck > input > review, the same as a task's.
 */
export function computeThreadNeed(
	viewer: string,
	open: ReadonlyArray<{
		readonly type: string;
		readonly senderId: string;
		readonly senderIsAgent: boolean;
		/** A review's named reviewer; absent ⇒ anyone in the thread but its sender. */
		readonly reviewer?: string;
	}>,
): ThreadNeed {
	const theirs = open.filter((m) => m.senderId !== viewer);
	const questions = theirs.filter((m) => m.type === "questionnaire");
	if (questions.some((m) => m.senderIsAgent)) return "stuck";
	if (questions.length > 0) return "input";
	const reviews = theirs.filter((m) => m.type === "review");
	if (reviews.some((m) => m.reviewer === undefined || m.reviewer === viewer)) return "review";
	return null;
}
