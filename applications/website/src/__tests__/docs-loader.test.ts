import { describe, expect, test } from "vitest";

import { docEntryId } from "../lib/docs-loader.js";

describe("docEntryId", () => {
	test("strips the docs/ prefix and .md suffix", () => {
		expect(docEntryId("docs/product/what-is-hyperidle.md")).toBe("product/what-is-hyperidle");
	});

	test("collapses a directory index.md onto the directory itself", () => {
		expect(docEntryId("docs/product/index.md")).toBe("product");
	});

	test("keeps nested guide paths intact", () => {
		expect(docEntryId("docs/guides/user/agents.md")).toBe("guides/user/agents");
	});
});
