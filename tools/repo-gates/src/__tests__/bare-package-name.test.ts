/**
 * The import-specifier normalization used by the import-vs-manifest gate
 * (tools/repo-gates/src/dep-manifest-lint.ts).
 */

import { describe, expect, it } from "vitest";

import { barePackageName } from "../lib/bare-package-name.js";

describe("barePackageName", () => {
	it("strips the colon-namespaced virtual-module suffix", () => {
		expect(barePackageName("astro:content")).toBe("astro");
		expect(barePackageName("astro:assets")).toBe("astro");
	});

	it("keeps plain, scoped, and subpath specifiers intact", () => {
		expect(barePackageName("hono")).toBe("hono");
		expect(barePackageName("@astrojs/markdown-remark")).toBe("@astrojs/markdown-remark");
		expect(barePackageName("astro/components")).toBe("astro");
		expect(barePackageName("@scope/name/sub/path")).toBe("@scope/name");
	});

	it("does not colon-split a URL — the // guard", () => {
		expect(barePackageName("https://example.com/mod.ts")).not.toBe("https");
	});

	it("returns null for relative, absolute, hash, node:, and builtin specifiers", () => {
		expect(barePackageName("./local.js")).toBeNull();
		expect(barePackageName("/abs/path.js")).toBeNull();
		expect(barePackageName("#imports")).toBeNull();
		expect(barePackageName("node:fs")).toBeNull();
		expect(barePackageName("fs")).toBeNull();
		expect(barePackageName("")).toBeNull();
	});
});
