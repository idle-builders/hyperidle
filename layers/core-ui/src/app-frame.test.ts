/** The box an app runs in keeps the app's text whole. */
import { expect, test } from "vitest";
import { appDocument, appSrcdoc } from "./app-frame";

test("an app whose text has quotes and ampersands reaches its inner document unchanged", () => {
	const html = `<p title="a &quot;b&quot;">Tom & "Jerry"</p><script>document.title = "x";</script>`;
	const shell = appSrcdoc(html);
	const attribute = /srcdoc="([^"]*)"/.exec(shell)?.[1] ?? "";
	const unescaped = attribute.replaceAll("&quot;", '"').replaceAll("&amp;", "&");
	expect(unescaped).toBe(appDocument(html));
	expect(unescaped).toContain(html);
});
