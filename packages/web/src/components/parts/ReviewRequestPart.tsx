// hearth-internal-padding
/**
 * AM1 — ReviewRequestPart: a COMPACT reference into the review experience.
 *
 * It does NOT take a decision inline (no Approve/Request-changes/Reject) and
 * shows NO code/diff. The change-set is an artifact ReferenceChip; the only
 * action is "Open review" → onOpen(reviewTarget) → the review page.
 */

import type { OpenHandler, Part } from "@hyperidle/shared";
import type { JSX } from "react";
import { renderEmbed } from "./embeds.js";

type ReviewPartValue = Extract<Part, { kind: "review" }>;

const ICON_CHECK = "M6.5 11.5L3 8l1.2-1.2 2.3 2.3L11.8 4 13 5.2l-6.5 6.3z";
const ICON_ARROW = "M3 8h8.2L8 4.8 9.2 3.6 14.4 8l-5.2 4.4L8 11.2 11.2 8H3V8z";

export function ReviewRequestPart({
	part,
	onOpen,
}: {
	part: ReviewPartValue;
	onOpen: OpenHandler;
}): JSX.Element {
	return (
		<div
			data-ds-component="ReviewRequestPart"
			className="flex flex-col gap-[12px] rounded-[var(--r-default)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-[18px] shadow-[var(--shadow-default)]"
		>
			<div className="flex items-start gap-[9px]">
				<span
					role="img"
					aria-label="Review request"
					title="Review request"
					className="mt-[3px] flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[var(--r-pill)] bg-[var(--accent-primary-dim)] text-[var(--accent-primary)]"
				>
					<svg
						viewBox="0 0 16 16"
						fill="currentColor"
						style={{ width: 12, height: 12 }}
						aria-hidden="true"
					>
						<path d={ICON_CHECK} />
					</svg>
				</span>
				<div className="min-w-0">
					<div className="text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
						Review requested
					</div>
					<p className="m-0 mt-[3px] text-[15px] font-[600] leading-[1.4] text-[var(--text-primary)]">
						{part.title}
					</p>
				</div>
			</div>
			{part.changeSet !== null && (
				<div className="pl-[24px]">{renderEmbed(part.changeSet, "changeset", onOpen)}</div>
			)}
			<div className="pl-[24px]">
				<button
					type="button"
					onClick={() => onOpen({ route: "review", ...part.reviewTarget })}
					className="inline-flex w-fit items-center gap-[6px] rounded-[var(--r-subtle)] bg-[var(--accent-primary)] px-[12px] py-[7px] text-[13px] font-[600] text-[var(--text-on-accent)] transition-colors duration-[var(--motion-fast)] hover:bg-[var(--accent-primary-hover)]"
				>
					Open review
					<svg
						viewBox="0 0 16 16"
						fill="currentColor"
						style={{ width: 12, height: 12 }}
						aria-hidden="true"
					>
						<path d={ICON_ARROW} />
					</svg>
				</button>
			</div>
		</div>
	);
}
