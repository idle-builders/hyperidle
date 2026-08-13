// design-lint-disable require-stories-sibling
import { EMPTY_SLUG_SENTINEL, slug } from "@hyperidle/block-derivation";
import type { InlineNode } from "@hyperidle/domain-model";
import { createElement, type JSX } from "react";

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
const HEADING_SIZE: Record<1 | 2 | 3 | 4 | 5 | 6, string> = {
	1: "text-[24px]",
	2: "text-[20px]",
	3: "text-[18px]",
	4: "text-[16px]",
	5: "text-[15px]",
	6: "text-[13px]",
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
			className: `${HEADING_SIZE[level]} text-[var(--text-primary)] leading-[1.2] tracking-[-0.005em] m-0 font-semibold`,
		},
		renderInline(inline),
	);
}
