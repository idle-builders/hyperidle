// design-lint-disable require-stories-sibling
import type { InlineNode } from "@hyperidle/shared";
import { createElement, type JSX } from "react";

import { renderInline } from "./inline.js";

export interface HeadingPayloadProps {
	level: 1 | 2 | 3 | 4 | 5 | 6;
	inline: InlineNode[];
}

export function HeadingPayload({ level, inline }: HeadingPayloadProps): JSX.Element {
	return createElement(
		`h${level}`,
		{
			className: "font-heading text-[var(--text-strong)] leading-[1.2] tracking-[-0.005em] m-0",
		},
		renderInline(inline),
	);
}
