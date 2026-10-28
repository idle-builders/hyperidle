/** What an app's card says about it, and that the box an app runs in keeps the app's text whole. */
import { describe, expect, test } from "vitest";
import { appDocument, appSrcdoc, appSummary } from "./app-frame";

describe("appSummary: the line an app's card shows, read without running the app", () => {
	test.each([
		[
			"its meta description",
			'<head><meta name="description" content="Seats and plan to a monthly price"></head>',
			"Seats and plan to a monthly price",
		],
		[
			"its meta description, attributes either way round",
			"<meta content='Days left in a trial' name='description'>",
			"Days left in a trial",
		],
		["its title when it has no description", "<title>Trial calculator</title>", "Trial calculator"],
		[
			"the description over the title",
			'<title>Calc</title><meta name="description" content="Prices &amp; seats">',
			"Prices & seats",
		],
		["nothing when it says nothing about itself", "<p>hi</p>", null],
	])("%s", (_, html, summary) => {
		expect(appSummary(html)).toBe(summary);
	});
});

test("an app whose text has quotes and ampersands reaches its inner document unchanged", () => {
	const html = `<p title="a &quot;b&quot;">Tom & "Jerry"</p><script>document.title = "x";</script>`;
	const shell = appSrcdoc(html);
	const attribute = /srcdoc="([^"]*)"/.exec(shell)?.[1] ?? "";
	const unescaped = attribute.replaceAll("&quot;", '"').replaceAll("&amp;", "&");
	expect(unescaped).toBe(appDocument(html));
	expect(unescaped).toContain(html);
});
