// design-lint-disable require-stories-sibling
import type { JSX } from "react";

export interface UnknownPayloadProps {
	raw: string;
	reason: "parser-unrecognised" | "body-too-large" | "sanitiser-stripped";
}

/**
 * @lore C8: the warn-stripe shell uses a plain UNKNOWN pill — `StatusChip`
 * has a closed status enum that doesn't include "unknown" and is Tier-1
 * protected. A bespoke pill keeps the Block primitive Tier-2 (composing
 * tokens directly, not extending Tier-1).
 */
export function UnknownPayload({ raw, reason }: UnknownPayloadProps): JSX.Element {
	return (
		<div className="border-l-2 border-[var(--warn)] pl-[12px] flex flex-col gap-[8px]">
			<div className="flex items-center gap-[8px]">
				<span
					className="inline-flex items-center px-[8px] py-[2px] rounded-[var(--r-pill)] uppercase tracking-[0.02em] text-[11px] font-semibold bg-[color-mix(in_oklab,var(--warn)_15%,var(--surface-1))] text-[var(--warn)] border border-[var(--warn)]"
					data-block-unknown-pill
				>
					UNKNOWN
				</span>
				<span className="text-[12px] text-[var(--text-mid)]">unsupported block — {reason}</span>
			</div>
			<pre className="font-mono text-[12px] leading-[1.5] bg-[var(--surface-2)] text-[var(--text-mid)] p-[12px] rounded-[var(--r2)] overflow-x-auto m-0 whitespace-pre-wrap">
				<code>{raw}</code>
			</pre>
		</div>
	);
}
