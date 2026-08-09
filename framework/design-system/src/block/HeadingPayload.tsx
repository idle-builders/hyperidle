// design-lint-disable require-stories-sibling
import type { InlineNode } from "@hyperidle/domain-model";
import { createElement, type JSX } from "react";

import { renderInline } from "./inline.js";

export interface HeadingPayloadProps {
	level: 1 | 2 | 3 | 4 | 5 | 6;
	inline: InlineNode[];
}

// @lore U8: heading level sizes use type-scale tokens for h1/h2 per Hearth AC
// advisory; h3-h6 use fixed pixel values from the Hearth type scale spec.
// font-heading removed: Hearth uses system-ui everywhere via --font-sans.
const HEADING_SIZE: Record<1 | 2 | 3 | 4 | 5 | 6, string> = {
	1: "text-[24px]",
	2: "text-[20px]",
	3: "text-[18px]",
	4: "text-[16px]",
	5: "text-[15px]",
	6: "text-[13px]",
};

export function HeadingPayload({ level, inline }: HeadingPayloadProps): JSX.Element {
	return createElement(
		`h${level}`,
		{
			className: `${HEADING_SIZE[level]} text-[var(--text-primary)] leading-[1.2] tracking-[-0.005em] m-0 font-semibold`,
		},
		renderInline(inline),
	);
}
