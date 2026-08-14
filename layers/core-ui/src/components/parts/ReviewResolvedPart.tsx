/**
 * AM1 — ReviewResolvedPart: the verdict ONCE TAKEN, echoed into the
 * conversation. The decision label comes from the merged verdictDecisionLabel
 * vocabulary (carried on `part.label`); no buttons, no code. Quiet "View
 * review" → onOpen(reviewTarget).
 */

import type { OpenHandler, Part } from "@hyperidle/conversation-parts";
import type { JSX } from "react";

type ResolvedPartValue = Extract<Part, { kind: "resolved" }>;

const ICON_CHECK = "M6.5 11.5L3 8l1.2-1.2 2.3 2.3L11.8 4 13 5.2l-6.5 6.3z";
const ICON_ARROW = "M3 8h8.2L8 4.8 9.2 3.6 14.4 8l-5.2 4.4L8 11.2 11.2 8H3V8z";

/** "APPROVED" → "Approved" for the inline echo sentence. */
function titleCase(label: string): string {
	return label.charAt(0) + label.slice(1).toLowerCase();
}

export function ReviewResolvedPart({
	part,
	onOpen,
}: {
	part: ResolvedPartValue;
	onOpen: OpenHandler;
}): JSX.Element {
	return (
		<div
			data-ds-component="ReviewResolvedPart"
			className="border-[var(--bw-thin)] flex items-center gap-[9px] rounded-[var(--r-default)]  border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-[18px] py-[12px] shadow-[var(--shadow-subtle)]"
		>
			<span className="flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[var(--r-pill)] text-[var(--status-success)]">
				<svg
					viewBox="0 0 16 16"
					fill="currentColor"
					style={{ width: 14, height: 14 }}
					aria-hidden="true"
				>
					<path d={ICON_CHECK} />
				</svg>
			</span>
			<div className="type-small min-w-0 flex-1 ">
				<span className="type-small  text-[var(--text-secondary)]">
					<span className="type-small  text-[var(--text-primary)]">{titleCase(part.label)}</span> by{" "}
					{part.resolvedBy} · {part.summary}
				</span>
			</div>
			<button
				type="button"
				onClick={() => onOpen({ route: "review", ...part.reviewTarget, intent: "inspect" })}
				className="type-control inline-flex shrink-0 items-center gap-[3px]   text-[var(--text-tertiary)]   hover:text-[var(--accent-deep)]"
			>
				Inspect review
				<svg
					viewBox="0 0 16 16"
					fill="currentColor"
					style={{ width: 11, height: 11 }}
					aria-hidden="true"
				>
					<path d={ICON_ARROW} />
				</svg>
			</button>
		</div>
	);
}
