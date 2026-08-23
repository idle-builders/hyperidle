// AM5 — base-primitive foundation story: Html (pure content).
// Thin wrapper over block/HtmlPayload. The payload is host-sanitiser-agnostic: it
// takes a `sanitizeHtml` fn (production injects DOMPurify). For the story we pass
// a trivial allow-through over already-safe fixture markup — the story shows the
// rendered output, not the sanitiser (the sanitiser is a host concern, AC-49).
import type { JSX } from "react";
import { HtmlPayload } from "./block/HtmlPayload.js";

export default { title: "Html", group: "Blocks" as const };

// Story-only passthrough over pre-safe fixture markup (no host DOMPurify in DS).
const passthrough = (raw: string): string => raw;

export const Rendered = (): JSX.Element => (
	<div className="w-[480px]">
		<HtmlPayload
			raw='<p>Embedded HTML rendered through the host sanitiser. Supports <strong>emphasis</strong> and <a href="/docs">links</a>.</p>'
			sanitizeHtml={passthrough}
		/>
	</div>
);

export const ListMarkup = (): JSX.Element => (
	<div className="w-[480px]">
		<HtmlPayload
			raw="<ul><li>First import</li><li>Second import</li><li>Third import</li></ul>"
			sanitizeHtml={passthrough}
		/>
	</div>
);
