import { NeedIcon } from "./NeedIcon";

/**
 * THE LOOP — how a piece of work can be judged afterwards: its goal (the task itself), the
 * decisions and assumptions that sent it one way rather than another, and how it closes. A line
 * of "done when" closes by itself when it can be checked without a person (a test, a number, a
 * page at two widths) and with a review when it needs a person's judgement. The same two lists
 * sit on a task's page and in a review, so a reviewer sees why the work went where it went and
 * what is already checked, and spends their attention on the rest.
 */
export interface Reason {
	kind: "Decision" | "Assumption";
	what: string;
	/** An assumption: held when checked and true, open while unchecked, broke when it was wrong. A decision: open while it waits for someone. */
	state: "held" | "open" | "broke" | "made";
	/** Who decided and where, or how the assumption was (or will be) checked. */
	why: string;
	/** Someone has to answer before it can be decided. */
	waits?: boolean;
}
export interface Close {
	what: string;
	/** "check" closes by itself; "review" needs a person. */
	by: "check" | "review";
	state: "met" | "open" | "failed";
	how: string;
}

const MARK: Record<Reason["state"], string> = { held: "✓", open: "○", broke: "✗", made: "◆" };
const WORD: Record<Reason["state"], string> = {
	held: "held",
	open: "not checked yet",
	broke: "did not hold",
	made: "",
};

export function Reasons({ items }: { items: Reason[] }): React.ReactElement {
	const n = (s: Reason["state"]) =>
		items.filter((x) => x.kind === "Assumption" && x.state === s).length;
	const tally = [
		n("held") && `${n("held")} held`,
		n("open") && `${n("open")} not checked yet`,
		n("broke") && `${n("broke")} did not hold`,
	]
		.filter(Boolean)
		.join(" · ");
	return (
		<>
			<h3>Decisions and assumptions {tally && <span>{tally}</span>}</h3>
			<div className="loop">
				{items.map((x) => (
					<div key={x.what} className="loop-row">
						<span className="loop-mark" aria-hidden="true">
							{x.waits ? (
								<NeedIcon kind="input" />
							) : x.kind === "Decision" ? (
								MARK.made
							) : (
								MARK[x.state]
							)}
						</span>
						<span className="loop-text">
							<span className="loop-what">{x.what}</span>
							<span className="loop-why">
								<b>{x.kind}</b>
								{x.waits
									? " · waits for an answer"
									: x.kind === "Assumption"
										? ` · ${WORD[x.state]}`
										: ""}{" "}
								· {x.why}
							</span>
						</span>
					</div>
				))}
			</div>
		</>
	);
}

export function Closes({
	items,
	title = "Done when",
}: {
	items: Close[];
	title?: string;
}): React.ReactElement {
	const checks = items.filter((x) => x.by === "check").length;
	const reviews = items.length - checks;
	const tally = [
		checks && `${checks} ${checks === 1 ? "checks itself" : "check themselves"}`,
		reviews && `${reviews} ${reviews === 1 ? "needs a review" : "need a review"}`,
	]
		.filter(Boolean)
		.join(" · ");
	return (
		<>
			<h3>
				{title} <span>{tally}</span>
			</h3>
			<div className="loop">
				{items.map((x) => (
					<div key={x.what} className="loop-row">
						<span className="loop-mark" aria-hidden="true">
							{x.by === "review" && x.state === "open" ? (
								<NeedIcon kind="review" />
							) : x.state === "met" ? (
								"✓"
							) : x.state === "failed" ? (
								"✗"
							) : (
								"○"
							)}
						</span>
						<span className="loop-text">
							<span className="loop-what">{x.what}</span>
							<span className="loop-why">
								<b>{x.by === "check" ? "Checks itself" : "A person reviews"}</b> · {x.how}
							</span>
						</span>
					</div>
				))}
			</div>
		</>
	);
}
