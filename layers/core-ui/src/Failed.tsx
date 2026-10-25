import { useState } from "react";

/**
 * A page that did not load says so in one quiet line, with why in the server's words, and offers
 * to try again. Every detail page uses it, so a failure always reads the same.
 */
export function Failed({
	what,
	why,
	onRetry,
}: {
	/** "This task", "This thread"… */
	what: string;
	why: string | undefined;
	onRetry: () => void;
}) {
	const [tried, setTried] = useState(false);
	const reason = why ?? "The server did not answer.";
	return (
		<div className="failed" role="alert">
			<span>
				{what} did not load.
				<span className="failed-why">{tried ? `Tried again just now. ${reason}` : reason}</span>
			</span>
			<button
				type="button"
				className="tbox-more"
				onClick={() => {
					setTried(true);
					onRetry();
				}}
			>
				Try again
			</button>
		</div>
	);
}
