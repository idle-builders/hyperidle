// design-lint-disable require-stories-sibling
import type { JSX } from "react";

import { UnknownPayload } from "./UnknownPayload.js";

export interface HtmlPayloadProps {
	raw: string;
	sanitizeHtml: (raw: string) => string;
}

export function HtmlPayload({ raw, sanitizeHtml }: HtmlPayloadProps): JSX.Element {
	const safe = sanitizeHtml(raw);
	if (!safe || safe.trim().length === 0) {
		return <UnknownPayload raw={raw} reason="sanitiser-stripped" />;
	}
	return (
		<div
			className="bg-[var(--surface-container)] p-[12px] rounded-[var(--r-default)]"
			// biome-ignore lint/security/noDangerouslySetInnerHtml: caller provides a sanitiser.
			dangerouslySetInnerHTML={{ __html: safe }}
		/>
	);
}
