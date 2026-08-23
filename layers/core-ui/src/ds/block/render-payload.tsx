import type { JSX } from "react";
import type { BlockPayload } from "../../block/types.js";

import { CodePayload } from "./CodePayload.js";
import { DividerPayload } from "./DividerPayload.js";
import type { AuthoredOutlineContext } from "./HeadingPayload.js";
import { HeadingPayload } from "./HeadingPayload.js";
import { HtmlPayload } from "./HtmlPayload.js";
import { ImagePayload } from "./ImagePayload.js";
import { ListPayload } from "./ListPayload.js";
import { ParagraphPayload } from "./ParagraphPayload.js";
import { QuotePayload } from "./QuotePayload.js";
import { TablePayload } from "./TablePayload.js";
import { UnknownPayload } from "./UnknownPayload.js";

/**
 * Internal dispatch — discriminates on payload.kind to render the matching
 * per-kind payload component. Used by Block.tsx and recursively by ListPayload
 * / QuotePayload.
 */
export function renderPayload(
	payload: BlockPayload,
	sanitizeHtml?: (raw: string) => string,
	outline?: AuthoredOutlineContext,
): JSX.Element | null {
	switch (payload.kind) {
		case "heading":
			return (
				<HeadingPayload
					level={payload.level}
					inline={payload.inline}
					text={payload.text}
					outline={outline}
				/>
			);
		case "paragraph":
			return <ParagraphPayload inline={payload.inline} />;
		case "list":
			return <ListPayload ordered={payload.ordered} start={payload.start} items={payload.items} />;
		case "quote":
			// biome-ignore lint/correctness/noChildrenProp: Internal payload contract — payload.children is the BlockPayload[] field name from the closed BlockPayload union.
			return <QuotePayload children={payload.children} />;
		case "code":
			return <CodePayload lang={payload.lang} text={payload.text} />;
		case "table":
			return <TablePayload align={payload.align} header={payload.header} rows={payload.rows} />;
		case "divider":
			return <DividerPayload />;
		case "image":
			return <ImagePayload alt={payload.alt} url={payload.url} title={payload.title} />;
		case "html":
			if (!sanitizeHtml) {
				return <UnknownPayload raw={payload.raw} reason="parser-unrecognised" />;
			}
			return <HtmlPayload raw={payload.raw} sanitizeHtml={sanitizeHtml} />;
		case "unknown":
			return <UnknownPayload raw={payload.raw} reason={payload.reason} />;
	}
	// @lore Z8-166: TypeScript does not treat switch-on-discriminant as exhaustive
	// even when all union members are covered; the unreachable throw satisfies
	// the "function lacks ending return" TS2366.
	throw new Error(`Unhandled payload kind: ${(payload as { kind: string }).kind}`);
}
