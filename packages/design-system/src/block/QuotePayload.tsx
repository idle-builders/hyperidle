// design-lint-disable require-stories-sibling
import type { BlockPayload } from "@hyperidle/shared";
import type { JSX } from "react";

import { renderPayload } from "./render-payload.js";

export interface QuotePayloadProps {
	children: BlockPayload[];
}

export function QuotePayload({ children }: QuotePayloadProps): JSX.Element {
	return (
		<blockquote className="border-l-2 border-[var(--border-strong)] pl-[12px] text-[var(--text-secondary)] m-0 flex flex-col gap-[9px]">
			{children.map((c, i) => (
				<span key={i}>{renderPayload(c)}</span>
			))}
		</blockquote>
	);
}
