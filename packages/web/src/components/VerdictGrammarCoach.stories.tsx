/**
 * Stories for VerdictGrammarCoach (L10).
 *
 * Renders the coach in its open state. The component wires its own
 * `localStorage.hyperidle.coach.seen` key — these stories deliberately
 * leave that key clear so the dialog renders.
 */
import type { JSX } from "react";
import { _resetCoachSeenForTest, VerdictGrammarCoach } from "./VerdictGrammarCoach";

export function VerdictGrammarCoachAutoOpen(): JSX.Element {
	_resetCoachSeenForTest();
	return <VerdictGrammarCoach autoOpen={true} />;
}

export function VerdictGrammarCoachInert(): JSX.Element {
	// Closed state — hover ? key to re-open in the live preview.
	return (
		<div className="p-4 text-sm text-[var(--text-mid)]">
			Coach is closed. Press <kbd>?</kbd> to open.
			<VerdictGrammarCoach autoOpen={false} />
		</div>
	);
}

export default {
	component: VerdictGrammarCoach,
	title: "L10/VerdictGrammarCoach",
};
