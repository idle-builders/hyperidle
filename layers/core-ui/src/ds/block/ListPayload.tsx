// design-lint-disable require-stories-sibling

import { createElement, type JSX } from "react";
import type { BlockPayload, ListItem } from "../../block/types.js";

import { renderPayload } from "./render-payload.js";

export interface ListPayloadProps {
	ordered: boolean;
	start: number | null;
	items: ListItem[];
}

// @lore AZ6: the CSS reset sets `list-style: none` on every `ul`/`ol`, so a list
// painted as unmarked lines — a document with its bullets silently removed. Every
// host that renders a body shares this component, so documents and comments
// lost their bullets too.
//
// @lore AZ6: the marker is an inline style and NOT a `list-disc` / `list-decimal`
// Tailwind class ON PURPOSE. `layers/core-ui/src/index.css` declares
// `@source "../../design-system/src/**/*.{ts,tsx}"`, which resolves to
// `layers/design-system/` — a directory that does not exist; the design system is
// under `framework/`. So no class used ONLY in this package is ever generated. The
// class version of this fix produced `list-style-type: none` in the running app
// while looking perfectly correct in review and passing a class-name assertion.
// Do not "tidy" this into a utility class until that glob is fixed — measure the
// painted result if you do.
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
