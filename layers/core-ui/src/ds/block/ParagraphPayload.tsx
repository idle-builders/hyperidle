// design-lint-disable require-stories-sibling

import type { JSX } from "react";
import type { InlineNode } from "../../block/types.js";

import { renderInline } from "./inline.js";

export interface ParagraphPayloadProps {
	inline: InlineNode[];
}

export function ParagraphPayload({ inline }: ParagraphPayloadProps): JSX.Element {
	return <p className="type-small text-[var(--text-primary)]  m-0">{renderInline(inline)}</p>;
}
