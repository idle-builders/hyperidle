import { describe, expect, test } from "vitest";

import { githubDocUrl, mapDocHref, resolveRepoPath } from "../lib/doc-links.js";

const github = { owner: "ambrovia", repo: "hyperidle", ref: "main" } as const;
const renderedSections = [
	"docs/product",
	"docs/guides/user",
	"docs/guides/developer",
	"docs/deployment",
] as const;
const options = { base: "/", renderedSections, github };

describe("resolveRepoPath", () => {
	test("resolves a bare sibling against the source file's directory", () => {
		expect(resolveRepoPath("docs/product/index.md", "how-work-flows.md")).toBe(
			"docs/product/how-work-flows.md",
		);
	});

	test("resolves dot-relative and parent segments", () => {
		expect(resolveRepoPath("docs/guides/user/agents.md", "../../deployment/laptop.md")).toBe(
			"docs/deployment/laptop.md",
		);
	});

	test("returns null when the href escapes the repo root", () => {
		expect(resolveRepoPath("docs/product/index.md", "../../../../x.md")).toBeNull();
	});
});

describe("githubDocUrl", () => {
	test("renders a blob URL for a file path", () => {
		expect(githubDocUrl(github, "docs/agent-layer/agent-model.md")).toBe(
			"https://github.com/ambrovia/hyperidle/blob/main/docs/agent-layer/agent-model.md",
		);
	});

	test("renders a tree URL for a directory path", () => {
		expect(githubDocUrl(github, "docs/knowledge-architecture/")).toBe(
			"https://github.com/ambrovia/hyperidle/tree/main/docs/knowledge-architecture",
		);
	});
});

describe("mapDocHref", () => {
	test("maps a bare sibling markdown link", () => {
		expect(mapDocHref("how-work-flows.md", "docs/product/index.md", options)).toBe(
			"/docs/product/how-work-flows/",
		);
	});

	test("maps a dot-relative sibling markdown link", () => {
		expect(mapDocHref("./what-is-hyperidle.md", "docs/product/index.md", options)).toBe(
			"/docs/product/what-is-hyperidle/",
		);
	});

	test("collapses index.md onto the directory URL, matching docEntryId", () => {
		expect(mapDocHref("index.md", "docs/product/what-is-hyperidle.md", options)).toBe(
			"/docs/product/",
		);
	});

	test("honours a subpath base", () => {
		expect(
			mapDocHref("./index.md", "docs/product/index.md", { ...options, base: "/hyperidle/" }),
		).toBe("/hyperidle/docs/product/");
	});

	test("maps cross-directory links that stay inside the rendered set", () => {
		expect(
			mapDocHref("../../deployment/laptop.md", "docs/guides/user/deployment.md", options),
		).toBe("/docs/deployment/laptop/");
	});

	test("maps a cross-directory index.md onto its directory URL", () => {
		expect(mapDocHref("../../deployment/index.md", "docs/guides/user/deployment.md", options)).toBe(
			"/docs/deployment/",
		);
	});

	test("maps the developer guide's getting-started from the deployment docs", () => {
		expect(
			mapDocHref("../guides/developer/getting-started.md", "docs/deployment/index.md", options),
		).toBe("/docs/guides/developer/getting-started/");
	});

	test("preserves anchors on rendered links", () => {
		expect(mapDocHref("./settings.md#agent-backends", "docs/guides/user/agents.md", options)).toBe(
			"/docs/guides/user/settings/#agent-backends",
		);
	});

	test("rewrites docs outside the rendered set to their GitHub blob URL", () => {
		expect(
			mapDocHref("../../agent-layer/agent-model.md", "docs/guides/user/agents.md", options),
		).toBe("https://github.com/ambrovia/hyperidle/blob/main/docs/agent-layer/agent-model.md");
	});

	test("rewrites repo-root files to their GitHub blob URL, anchors intact", () => {
		expect(
			mapDocHref(
				"../../../CLAUDE.md#production-and-development-files",
				"docs/guides/developer/testing.md",
				options,
			),
		).toBe(
			"https://github.com/ambrovia/hyperidle/blob/main/CLAUDE.md#production-and-development-files",
		);
	});

	test("rewrites directory links outside the rendered set to GitHub tree URLs", () => {
		expect(
			mapDocHref("../knowledge-architecture/", "docs/product/how-knowledge-compounds.md", options),
		).toBe("https://github.com/ambrovia/hyperidle/tree/main/docs/knowledge-architecture");
	});

	test("leaves absolute hrefs untouched", () => {
		expect(mapDocHref("/docs/user/", "docs/product/index.md", options)).toBeNull();
	});

	test("leaves external URLs untouched", () => {
		expect(mapDocHref("https://example.com/x.md", "docs/product/index.md", options)).toBeNull();
		expect(
			mapDocHref("http://localhost:5173", "docs/guides/user/getting-started.md", options),
		).toBeNull();
	});

	test("leaves anchors untouched", () => {
		expect(mapDocHref("#section", "docs/product/index.md", options)).toBeNull();
	});

	test("leaves hrefs that escape the repo root untouched", () => {
		expect(mapDocHref("../../../../outside.md", "docs/product/index.md", options)).toBeNull();
	});
});
