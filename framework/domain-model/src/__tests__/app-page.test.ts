/** What an app says about itself, read from its page without running it. */
import { describe, expect, test } from "vitest";
import { appSummary, appTitle } from "../app-page.js";

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

test("an app's title is its <title>, or nothing when it has none or an empty one", () => {
	expect(appTitle("<title>Trial &amp; price</title>")).toBe("Trial & price");
	expect(appTitle("<title>  </title>")).toBeNull();
	expect(appTitle("<p>hi</p>")).toBeNull();
});
