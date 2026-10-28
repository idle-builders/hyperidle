import type { Reason } from "./task.js";

/** Derived UI status for a task — computed, never stored. */
export type TaskNeed = "stuck" | "input" | "review" | null;

/**
 * Derive the one status word shown wherever a task appears.
 * A finished task needs nothing — a conversation it came from may still ask about other work.
 * Precedence: stuck > input > review > null.
 * `messages` are the questions and reviews in the task's thread, answered ones included:
 * once every question is answered and every review decided, the agent has the task back and
 * nothing waits on you, even before it records the decision or leaves the review state.
 */
export function computeTaskNeed(
	state: string,
	messages: ReadonlyArray<{ readonly type: string; readonly resolvedAt: string | null }>,
	reasons: readonly Reason[],
): TaskNeed {
	if (state === "done" || state === "killed") return null;
	if (state === "blocked") return "stuck";
	const questions = messages.filter((m) => m.type === "questionnaire");
	const reviews = messages.filter((m) => m.type === "review");
	const open = (m: { readonly resolvedAt: string | null }) => m.resolvedAt === null;
	const answered = questions.length > 0 && !questions.some(open);
	const hasWaitingDecision = reasons.some((r) => r.kind === "decision" && r.state === "waiting");
	if (questions.some(open) || (hasWaitingDecision && !answered)) return "input";
	if (reviews.some(open) || (state === "review" && reviews.length === 0)) return "review";
	return null;
}
