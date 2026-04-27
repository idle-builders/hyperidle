/**
 * Stories for VerdictGrammarCoach (L10).
 *
 * Renders the coach in its open state. The component wires its own
 * `localStorage.hyperidle.coach.seen` key — these stories deliberately
 * leave that key clear so the dialog renders.
 */
import type { JSX } from "react";
import { VerdictGrammarCoach } from "./VerdictGrammarCoach";

export function VerdictGrammarCoachAutoOpen(): JSX.Element {
	try {
		window.localStorage.removeItem("hyperidle.coach.seen");
	} catch {
		// localStorage unavailable in this preview; coach stays closed.
	}
	return <VerdictGrammarCoach autoOpen={true} serverSeen={false} />;
}

export function VerdictGrammarCoachInert(): JSX.Element {
	// Closed state — hover ? key to re-open in the live preview.
	return (
		<div className="p-4 text-sm text-[var(--text-mid)]">
			Coach is closed. Press <kbd>?</kbd> to open.
			<VerdictGrammarCoach autoOpen={false} serverSeen={false} />
		</div>
	);
}

export function VerdictGrammarCoachServerSeen(): JSX.Element {
	// C3: when the server flag is true, the coach must NOT auto-open
	// even with autoOpen=true.
	return (
		<div className="p-4 text-sm text-[var(--text-mid)]">
			Coach already dismissed (server flag). Press <kbd>?</kbd> to re-open.
			<VerdictGrammarCoach autoOpen={true} serverSeen={true} />
		</div>
	);
}

export default {
	component: VerdictGrammarCoach,
	title: "L10/VerdictGrammarCoach",
};
