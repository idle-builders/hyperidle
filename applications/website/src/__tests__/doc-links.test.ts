import { describe, expect, test } from "vitest";

import { mapDocHref } from "../lib/doc-links.js";

describe("mapDocHref", () => {
	test("maps a bare sibling markdown link", () => {
		expect(mapDocHref("how-work-flows.md", "/", "docs/product")).toBe(
			"/docs/product/how-work-flows/",
		);
	});

	test("maps a dot-relative sibling markdown link", () => {
		expect(mapDocHref("./what-is-hyperidle.md", "/", "docs/product")).toBe(
			"/docs/product/what-is-hyperidle/",
		);
	});

	test("collapses index.md onto the directory URL, matching docEntryId", () => {
		expect(mapDocHref("index.md", "/", "docs/product")).toBe("/docs/product/");
	});

	test("honours a subpath base", () => {
		expect(mapDocHref("./index.md", "/hyperidle/", "docs/product")).toBe(
			"/hyperidle/docs/product/",
		);
	});

	test("leaves cross-directory markdown links untouched", () => {
		expect(
			mapDocHref("../knowledge-architecture/the-five-layers.md", "/", "docs/product"),
		).toBeNull();
	});

	test("leaves absolute hrefs untouched", () => {
		expect(mapDocHref("/docs/user/", "/", "docs/product")).toBeNull();
	});

	test("leaves external URLs untouched", () => {
		expect(mapDocHref("https://example.com/x.md", "/", "docs/product")).toBeNull();
	});

	test("leaves anchors untouched", () => {
		expect(mapDocHref("#section", "/", "docs/product")).toBeNull();
	});
});
