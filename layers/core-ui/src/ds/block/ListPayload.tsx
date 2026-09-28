// design-lint-disable require-stories-sibling

import { createElement, type JSX } from "react";
import type { BlockPayload, ListItem } from "../../block/types.js";

import { renderPayload } from "./render-payload.js";

export interface ListPayloadProps {
	ordered: boolean;
	start: number | null;
	items: ListItem[];
}

// @lore: CSS reset forces list-style:none on ul/ol — bullets disappear without an inline style override

// @lore: listStyleType inline not Tailwind — @source glob failure: class passes assertions but renders list-style:none; measure painted result before changing
export function ListPayload({ ordered, start, items }: ListPayloadProps): JSX.Element {
	const tag = ordered ? "ol" : "ul";
	return createElement(
		tag,
		{
			start: ordered && start !== null ? start : undefined,
			className: "pl-[20px] m-0 flex flex-col gap-[3px]",
			style: { listStyleType: ordered ? "decimal" : "disc" },
		},
		items.map((it, i) => (
			<li
				// biome-ignore lint/suspicious/noArrayIndexKey: a parsed markdown list is immutable content re-rendered from scratch each time, never reordered.
				key={i}
				className="type-small text-[var(--text-primary)] "
			>
				{it.children.map((c: BlockPayload, j: number) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: a parsed markdown list is immutable content re-rendered from scratch each time, never reordered.
					<span key={j}>{renderPayload(c)}</span>
				))}
			</li>
		)),
	);
}
