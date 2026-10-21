import { describe, expect, it } from "vitest";
import {
	checkCoreUiTokens,
	extractDefinedTokens,
	extractVarReferences,
	findRawColours,
} from "../design-css-gate.js";

describe("extractDefinedTokens", () => {
	it("parses simple token definitions", () => {
		const tokens = extractDefinedTokens("--canvas: red;\n--ink: blue;");
		expect(tokens.has("--canvas")).toBe(true);
		expect(tokens.has("--ink")).toBe(true);
	});

	it("handles tokens with spaces before colon", () => {
		const tokens = extractDefinedTokens("--sp-1  :  4px;");
		expect(tokens.has("--sp-1")).toBe(true);
	});

	it("returns empty set for no tokens", () => {
		expect(extractDefinedTokens("body { color: red; }").size).toBe(0);
	});
});

describe("extractVarReferences", () => {
	it("finds var(--name) on correct line", () => {
		const refs = extractVarReferences("a {\n  color: var(--canvas);\n}");
		expect(refs).toEqual([{ name: "--canvas", line: 2 }]);
	});

	it("finds multiple references on one line", () => {
		const refs = extractVarReferences("border: 1px solid var(--line); color: var(--ink);");
		expect(refs.map((r) => r.name)).toEqual(["--line", "--ink"]);
	});

	it("returns empty for no vars", () => {
		expect(extractVarReferences("color: red;")).toHaveLength(0);
	});
});

describe("findRawColours", () => {
	it("flags hex colours", () => {
		const found = findRawColours("color: #ff0000;");
		expect(found).toHaveLength(1);
		expect(found.at(0)?.snippet).toBe("#ff0000");
	});

	it("flags rgb()", () => {
		const found = findRawColours("background: rgb(255, 0, 0);");
		expect(found).toHaveLength(1);
		expect(found.at(0)?.snippet).toBe("rgb(");
	});

	it("flags rgba()", () => {
		const found = findRawColours("box-shadow: 0 1px 2px rgba(0,0,0,0.2);");
		expect(found).toHaveLength(1);
		expect(found.at(0)?.snippet).toBe("rgba(");
	});

	it("flags hsl() and hsla()", () => {
		const a = findRawColours("color: hsl(120, 50%, 50%);");
		const b = findRawColours("color: hsla(120, 50%, 50%, 0.5);");
		expect(a).toHaveLength(1);
		expect(b).toHaveLength(1);
	});

	it("allows tokens.css — caller is responsible for skipping it", () => {
		// The gate skips tokens.css before calling findRawColours.
		// Here we just confirm raw literal detection fires on the content.
		const found = findRawColours("--canvas: #faf8f4;");
		expect(found).toHaveLength(1);
	});

	it("returns empty for clean file", () => {
		expect(findRawColours("color: var(--ink);")).toHaveLength(0);
	});
});

describe("checkCoreUiTokens", () => {
	const tokensCss = "--canvas: #fff; --ink: #000; --sp-1: 4px;";

	it("passes when all vars are in tokens.css", () => {
		const files = [
			{ path: "app.css", content: "body { color: var(--ink); background: var(--canvas); }" },
		];
		expect(checkCoreUiTokens(tokensCss, files)).toHaveLength(0);
	});

	it("flags an undefined var", () => {
		const files = [{ path: "app.css", content: "color: var(--missing);" }];
		const findings = checkCoreUiTokens(tokensCss, files);
		expect(findings).toHaveLength(1);
		expect(findings.at(0)?.message).toContain("--missing");
	});

	it("allows locally-defined vars in CSS files", () => {
		const files = [
			{ path: "app.css", content: ".x { --w: 320px; width: var(--w); color: var(--ink); }" },
		];
		expect(checkCoreUiTokens(tokensCss, files)).toHaveLength(0);
	});

	it("does NOT allow locally-defined vars in TSX files (non-CSS)", () => {
		// TSX can't define CSS custom properties in a way the gate can parse,
		// so only tokens.css definitions count for .tsx files.
		const files = [{ path: "App.tsx", content: "style={{ color: 'var(--missing)' }}" }];
		const findings = checkCoreUiTokens(tokensCss, files);
		expect(findings.some((f) => f.message.includes("--missing"))).toBe(true);
	});

	it("flags raw colours in non-tokens CSS", () => {
		const files = [{ path: "app.css", content: "color: #ff0000;" }];
		const findings = checkCoreUiTokens(tokensCss, files);
		expect(findings.some((f) => f.message.includes("raw colour"))).toBe(true);
	});

	it("reports correct line numbers", () => {
		const files = [{ path: "app.css", content: "a {\n  color: var(--nope);\n}" }];
		const findings = checkCoreUiTokens(tokensCss, files);
		expect(findings.at(0)?.line).toBe(2);
	});

	it("returns empty for completely clean file", () => {
		const files = [{ path: "app.css", content: "body { padding: var(--sp-1); }" }];
		expect(checkCoreUiTokens(tokensCss, files)).toHaveLength(0);
	});
});
