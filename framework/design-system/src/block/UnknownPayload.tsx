// design-lint-disable require-stories-sibling
import type { JSX } from "react";

export interface UnknownPayloadProps {
	raw: string;
	reason: "parser-unrecognised" | "body-too-large" | "sanitiser-stripped";
}

/**
 * @lore C8: the warn-stripe shell uses a plain pill — `StatusChip` has a closed
 * status enum that doesn't include "unknown" and is Tier-1 protected. A bespoke
 * pill keeps the Block primitive Tier-2 (composing tokens directly, not
 * extending Tier-1).
 *
 * @lore AZ6: `reason` is the internal discriminant and must never reach the
 * screen — "unsupported block — parser-unrecognised" is a sentence written for
 * whoever wrote the parser, not for whoever opened the page. It maps to plain
 * words here. This component appears inside artifacts, knowledge items and
 * comments, so the wording lands in all three. Layout is unchanged.
 */
const REASON_TEXT: Record<UnknownPayloadProps["reason"], string> = {
	"parser-unrecognised": "HyperIdle couldn't read this part.",
	"body-too-large": "This part is too long to show in full.",
	"sanitiser-stripped": "Part of this was removed because it wasn't safe to show.",
};

export function UnknownPayload({ raw, reason }: UnknownPayloadProps): JSX.Element {
	return (
		<div className=" border-[var(--status-warning)] pl-[12px] flex flex-col gap-[9px]">
			<div className="flex items-center gap-[9px]">
				<span
					className="type-label border-[var(--bw-thin)] inline-flex items-center px-[9px] py-[3px] rounded-[var(--r-pill)] uppercase    bg-[color-mix(in_oklab,var(--status-warning)_15%,var(--surface-container))] text-[var(--status-warning)]  border-[var(--status-warning)]"
					data-block-unknown-pill
				>
					Not shown
				</span>
				<span className="type-metadata  text-[var(--text-secondary)]">{REASON_TEXT[reason]}</span>
			</div>
			<pre className="type-data    bg-[var(--surface-container)] text-[var(--text-secondary)] p-[12px] rounded-[var(--r-default)] overflow-x-auto m-0 whitespace-pre-wrap">
				<code>{raw}</code>
			</pre>
		</div>
	);
}
