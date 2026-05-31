// design-lint-disable require-stories-sibling
import type { JSX } from "react";

import { UnknownPayload } from "./UnknownPayload.js";

export interface HtmlPayloadProps {
	raw: string;
	sanitizeHtml: (raw: string) => string;
}

/**
 * Renders sanitised HTML through the host-injected sanitizer.
 *
 * @lore L2 AC-49a: when the sanitiser strips the entire payload (returns
 * empty string), fall through to UnknownPayload with reason
 * "sanitiser-stripped" so the user always sees evidence the source was
 * filtered. The DS package never imports DOMPurify directly to keep
 * design-system framework-host-agnostic.
 */
export function HtmlPayload({ raw, sanitizeHtml }: HtmlPayloadProps): JSX.Element {
	const safe = sanitizeHtml(raw);
	if (!safe || safe.trim().length === 0) {
		return <UnknownPayload raw={raw} reason="sanitiser-stripped" />;
	}
	return (
		<div
			className="bg-[var(--surface-container)] p-[12px] rounded-[var(--r-default)]"
			// biome-ignore lint/security/noDangerouslySetInnerHtml: caller provides a sanitiser; AC-49 contract.
			dangerouslySetInnerHTML={{ __html: safe }}
		/>
	);
}
