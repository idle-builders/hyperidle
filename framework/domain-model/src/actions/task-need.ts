import type { Reason } from "./task.js";

/** Derived UI status for a task — computed, never stored. */
export type TaskNeed = "stuck" | "input" | "review" | null;

/**
 * Derive the one status word shown wherever a task appears.
 * Precedence: stuck > input > review > null.
 * "Unresolved" means `resolvedAt === null`.
 */
export function computeTaskNeed(
	state: string,
	messages: ReadonlyArray<{ readonly type: string; readonly resolvedAt: string | null }>,
	reasons: readonly Reason[],
): TaskNeed {
	if (state === "blocked") return "stuck";
	const hasUnresolvedQuestionnaire = messages.some(
		(m) => m.type === "questionnaire" && m.resolvedAt === null,
	);
	const hasWaitingDecision = reasons.some((r) => r.kind === "decision" && r.state === "waiting");
	if (hasUnresolvedQuestionnaire || hasWaitingDecision) return "input";
	const hasUnresolvedReview = messages.some((m) => m.type === "review" && m.resolvedAt === null);
	if (state === "review" || hasUnresolvedReview) return "review";
	return null;
}
