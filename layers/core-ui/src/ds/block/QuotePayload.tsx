// design-lint-disable require-stories-sibling

import type { JSX } from "react";
import type { BlockPayload } from "../../block/types.js";

import { renderPayload } from "./render-payload.js";

export interface QuotePayloadProps {
	children: BlockPayload[];
}

export function QuotePayload({ children }: QuotePayloadProps): JSX.Element {
	return (
		<blockquote className="border-width-strong-l  border-[var(--border-strong)] pl-[12px] text-[var(--text-secondary)] m-0 flex flex-col gap-[9px]">
			{children.map((c, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: a parsed markdown quote is immutable content re-rendered from scratch each time, never reordered.
				<span key={i}>{renderPayload(c)}</span>
			))}
		</blockquote>
	);
}
