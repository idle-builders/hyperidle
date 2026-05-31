// design-lint-disable require-stories-sibling
import type { InlineNode } from "@hyperidle/shared";
import type { JSX } from "react";

import { renderInline } from "./inline.js";

export interface ParagraphPayloadProps {
	inline: InlineNode[];
}

export function ParagraphPayload({ inline }: ParagraphPayloadProps): JSX.Element {
	return <p className="text-[var(--text-primary)] leading-[1.6] m-0">{renderInline(inline)}</p>;
}
