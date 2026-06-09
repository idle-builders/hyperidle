// AE6 — HtmlRenderer stories.

import { HtmlRenderer } from "./html-renderer.js";

export default { title: "Kinds/HtmlRenderer" };

export function SimpleHtml() {
	return (
		<HtmlRenderer
			preview={{
				kind: "html",
				html: "<h1 style='font-family:system-ui'>Q4 Dashboard</h1><p>Revenue up 15% QoQ.</p>",
				title: "Q4 Dashboard",
			}}
			kind="html"
		/>
	);
}

export function NoTitle() {
	return (
		<HtmlRenderer
			preview={{
				kind: "html",
				html: "<p>Simple HTML without a title.</p>",
			}}
			kind="html"
		/>
	);
}

export function NoPreview() {
	return <HtmlRenderer preview={null} kind="html" />;
}
