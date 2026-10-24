import { describe, expect, test } from "vitest";

import { DOCS_NAV, findNavSection, navItemUrl } from "../lib/docs-nav.js";

describe("navItemUrl", () => {
	test("derives the docs URL from an entry id", () => {
		expect(navItemUrl("guides/user/getting-started", "/")).toBe(
			"/docs/guides/user/getting-started/",
		);
	});

	test("honours a subpath base", () => {
		expect(navItemUrl("deployment/laptop", "/hyperidle/")).toBe(
			"/hyperidle/docs/deployment/laptop/",
		);
	});
});

describe("DOCS_NAV", () => {
	test("orders the sections Installation → User Guide → Developer Guide → Concepts", () => {
		expect(DOCS_NAV.map((s) => s.id)).toEqual([
			"installation",
			"user-guide",
			"developer-guide",
			"concepts",
		]);
	});

	test("assembles Installation from the user-guide start plus the deployment docs", () => {
		const installation = DOCS_NAV.find((s) => s.id === "installation");
		expect(installation?.items.map((i) => i.id)).toEqual([
			"guides/user/getting-started",
			"deployment",
			"deployment/laptop",
			"deployment/self-hosting",
			"deployment/shared-backend",
			"deployment/releases",
		]);
	});

	test("mirrors the user guide's own index order", () => {
		const guide = DOCS_NAV.find((s) => s.id === "user-guide");
		expect(guide?.items.map((i) => i.id)).toEqual([
			"guides/user",
			"guides/user/getting-started",
			"guides/user/the-interface",
			"guides/user/conversations",
			"guides/user/work",
			"guides/user/knowledge",
			"guides/user/agents",
			"guides/user/your-page",
			"guides/user/connections",
			"guides/user/running-your-team",
		]);
	});

	test("mirrors the developer guide's own index order", () => {
		const guide = DOCS_NAV.find((s) => s.id === "developer-guide");
		expect(guide?.items.map((i) => i.id)).toEqual([
			"guides/developer",
			"guides/developer/getting-started",
			"guides/developer/commands",
			"guides/developer/testing",
			"guides/developer/mock-data-policy",
			"guides/developer/linting-and-formatting",
		]);
	});

	test("mirrors the product story's own index order as Concepts", () => {
		const concepts = DOCS_NAV.find((s) => s.id === "concepts");
		expect(concepts?.items.map((i) => i.id)).toEqual([
			"product",
			"product/what-is-hyperidle",
			"product/how-work-flows",
			"product/how-knowledge-compounds",
		]);
	});
});

describe("findNavSection", () => {
	test("finds the section an entry id belongs to", () => {
		expect(findNavSection("deployment/laptop")?.id).toBe("installation");
		expect(findNavSection("guides/user/agents")?.id).toBe("user-guide");
		expect(findNavSection("product")?.id).toBe("concepts");
	});

	test("returns undefined for ids outside the nav", () => {
		expect(findNavSection("nope/nothing")).toBeUndefined();
	});
});
