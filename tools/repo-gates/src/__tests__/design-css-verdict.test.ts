import { describe, expect, test } from "vitest";
import { evaluateDesignCss } from "../lib/design-css-verdict.js";

describe("AZ16 CSS design verdict", () => {
	test("accepts semantic profiles and the exact global reduced-motion contract", () => {
		const findings = evaluateDesignCss([
			{
				path: "framework/design-system/src/tokens.css",
				css: `.copy { @apply type-copy; }\n@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; } }`,
			},
		]);
		expect(findings).toEqual([]);
	});

	test("rejects raw profile fields and raw palette values", () => {
		const findings = evaluateDesignCss([
			{
				path: "framework/example/src/styles.css",
				css: ".copy { font-size: 15px; transition: all 200ms; border-width: 2px; color: #fff; }",
			},
		]);
		expect(findings.map((finding) => finding.family)).toEqual([
			"font-size",
			"duration",
			"border-width",
			"color",
		]);
	});
});
