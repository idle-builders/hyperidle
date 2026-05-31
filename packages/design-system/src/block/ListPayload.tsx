// design-lint-disable require-stories-sibling
import type { BlockPayload, ListItem } from "@hyperidle/shared";
import { createElement, type JSX } from "react";

import { renderPayload } from "./render-payload.js";

export interface ListPayloadProps {
	ordered: boolean;
	start: number | null;
	items: ListItem[];
}

export function ListPayload({ ordered, start, items }: ListPayloadProps): JSX.Element {
	const tag = ordered ? "ol" : "ul";
	return createElement(
		tag,
		{
			start: ordered && start !== null ? start : undefined,
			className: "pl-[20px] m-0 flex flex-col gap-[2px]",
		},
		items.map((it, i) => (
			<li key={i} className="text-[var(--text-primary)] leading-[1.6]">
				{it.children.map((c: BlockPayload, j: number) => (
					<span key={j}>{renderPayload(c)}</span>
				))}
			</li>
		)),
	);
}
