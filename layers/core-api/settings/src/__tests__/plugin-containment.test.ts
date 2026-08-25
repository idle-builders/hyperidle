/**
 * Unit tests for the package containment utility (BA9a AC4).
 */

import { describe, expect, it } from "vitest";
import { isPathContained, isPluginRelativePath } from "../plugin-containment.js";

describe("isPathContained", () => {
	const root = "/srv/plugins/my-plugin";

	it("allows a path exactly at the root", () => {
		expect(isPathContained(root, ".")).toBe(true);
	});

	it("allows a direct child path", () => {
		expect(isPathContained(root, "./skills/my-skill")).toBe(true);
	});

	it("allows a deeply nested path", () => {
		expect(isPathContained(root, "./a/b/c/d.txt")).toBe(true);
	});

	it("rejects a path that escapes the root with ../..", () => {
		expect(isPathContained(root, "../../etc/passwd")).toBe(false);
	});

	it("rejects a path with .. that escapes after traversal", () => {
		expect(isPathContained(root, "./skills/../../../etc/passwd")).toBe(false);
	});

	it("allows a path with .. that stays inside the root", () => {
		expect(isPathContained(root, "./skills/../mcp.json")).toBe(true);
	});

	it("rejects an absolute path outside the root", () => {
		expect(isPathContained(root, "/etc/passwd")).toBe(false);
	});

	it("rejects a sibling directory path", () => {
		expect(isPathContained(root, "../other-plugin/plugin.json")).toBe(false);
	});

	it("does not allow a path that merely starts with the root string but is a sibling", () => {
		// /srv/plugins/my-plugin-evil would match a naive startsWith check
		expect(isPathContained("/srv/plugins/my-plugin", "../my-plugin-evil/plugin.json")).toBe(false);
	});
});

describe("isPluginRelativePath", () => {
	it("accepts paths starting with ./", () => {
		expect(isPluginRelativePath("./skills/my-skill")).toBe(true);
	});

	it("accepts just ./", () => {
		expect(isPluginRelativePath("./")).toBe(true);
	});

	it("rejects bare names", () => {
		expect(isPluginRelativePath("skills/my-skill")).toBe(false);
	});

	it("rejects paths starting with ../", () => {
		expect(isPluginRelativePath("../escape")).toBe(false);
	});

	it("rejects absolute paths", () => {
		expect(isPluginRelativePath("/absolute/path")).toBe(false);
	});
});
