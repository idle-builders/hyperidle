// design-lint-disable require-stories-sibling

import type { InlineNode } from "../../block/types.js";
import { createElement, type JSX } from "react";
import { EMPTY_SLUG_SENTINEL, slug } from "../../block/index.js";

import { renderInline } from "./inline.js";

export interface HeadingPayloadProps {
	level: 1 | 2 | 3 | 4 | 5 | 6;
	inline: InlineNode[];
	text?: string;
	outline?: AuthoredOutlineContext;
}

export interface AuthoredOutlineContext {
	readonly documentTitle: string;
	readonly blockIndex: number;
	readonly levelOffset: 1;
}

export function headingIdentityMatches(left: string, right: string): boolean {
	const leftSlug = slug(left);
	const rightSlug = slug(right);
	if (leftSlug !== rightSlug) return false;
	if (leftSlug !== EMPTY_SLUG_SENTINEL) return true;
	const normalizeEmpty = (value: string): string =>
		value.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
	return normalizeEmpty(left) === normalizeEmpty(right);
}

// @lore U8: heading level sizes use type-scale tokens for h1/h2 per Hearth AC
// advisory; h3-h6 use fixed pixel values from the Hearth type scale spec.
// font-heading removed: Hearth uses system-ui everywhere via --font-sans.
const HEADING_PROFILE: Record<1 | 2 | 3 | 4 | 5 | 6, string> = {
	1: "type-display",
	2: "type-title",
	3: "type-lead",
	4: "type-subheading",
	5: "type-subheading",
	6: "type-subheading",
};

export function HeadingPayload({
	level,
	inline,
	text = "",
	outline,
}: HeadingPayloadProps): JSX.Element | null {
	if (outline?.blockIndex === 0 && headingIdentityMatches(text, outline.documentTitle)) {
		return null;
	}
	const effectiveLevel = outline ? Math.min(6, level + outline.levelOffset) : level;
	return createElement(
		`h${effectiveLevel}`,
		{
			"data-az16-profile": HEADING_PROFILE[level].slice(5),
			className: `${HEADING_PROFILE[level]} text-[var(--text-primary)] m-0`,
		},
		renderInline(inline),
	);
}
