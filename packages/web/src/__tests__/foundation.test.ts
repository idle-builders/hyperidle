import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import tailwindConfig from "../../tailwind.config";

// ---------- a. Theme token verification ----------

describe("tailwind.config factory-dark theme", () => {
	const themes = tailwindConfig.daisyui?.themes;
	if (!themes) throw new Error("daisyui.themes not found in config");

	// Find the factory-dark theme object
	const factoryDarkEntry = themes.find(
		(t): t is Record<string, Record<string, string>> =>
			typeof t === "object" && t !== null && "factory-dark" in t,
	);

	if (!factoryDarkEntry) throw new Error("factory-dark theme not found");
	const theme = factoryDarkEntry["factory-dark"] as Record<string, string>;

	it("factory-dark theme exists", () => {
		expect(factoryDarkEntry).toBeDefined();
		expect(theme).toBeDefined();
	});

	it("primary maps to accent --primary #adc6ff", () => {
		expect(theme.primary).toBe("#adc6ff");
	});

	it("secondary maps to warn #d58f24", () => {
		expect(theme.secondary).toBe("#d58f24");
	});

	it("accent maps to ok #bbffb3", () => {
		expect(theme.accent).toBe("#bbffb3");
	});

	it("error maps to danger #ee7d77", () => {
		expect(theme.error).toBe("#ee7d77");
	});

	it("base-100 maps to surface-0 #000000", () => {
		expect(theme["base-100"]).toBe("#000000");
	});

	it("base-200 maps to surface-1 #0e0e0e", () => {
		expect(theme["base-200"]).toBe("#0e0e0e");
	});

	it("base-300 maps to surface-2 #131313", () => {
		expect(theme["base-300"]).toBe("#131313");
	});

	it("--rounded-box is 4px", () => {
		expect(theme["--rounded-box"]).toBe("4px");
	});

	it("--rounded-btn is 2px", () => {
		expect(theme["--rounded-btn"]).toBe("2px");
	});

	it("--rounded-badge is 2px", () => {
		expect(theme["--rounded-badge"]).toBe("2px");
	});
});

// ---------- b. index.css has NO custom CSS ----------

describe("index.css has no custom CSS", () => {
	const cssPath = resolve(__dirname, "../index.css");
	const cssContent = readFileSync(cssPath, "utf-8");

	it("contains @tailwind directives", () => {
		expect(cssContent).toContain("@tailwind base");
		expect(cssContent).toContain("@tailwind components");
		expect(cssContent).toContain("@tailwind utilities");
	});

	it("has no class definitions (no custom CSS rules)", () => {
		// Strip @tailwind directives, @import statements, CSS custom property blocks,
		// @layer blocks that only set custom properties, and comments
		const stripped = cssContent
			.replace(/@tailwind\s+\w+;/g, "")
			.replace(/@import\s+[^;]+;/g, "")
			.replace(/@layer\s+base\s*\{[^}]*\{[^}]*--[^}]*\}[^}]*\}/gs, "")
			.replace(/\/\*[\s\S]*?\*\//g, "")
			.trim();

		// After stripping allowed content, nothing should remain that defines a class
		const classDefinitions = stripped.match(/\.[a-zA-Z][\w-]*\s*\{/g);
		expect(classDefinitions).toBeNull();
	});
});

// ---------- c. Density CSS variables (J1) ----------

describe("index.css density tokens", () => {
	const cssPath = resolve(__dirname, "../index.css");
	const cssContent = readFileSync(cssPath, "utf-8");

	const REQUIRED_VARS = [
		"--density-pad-x",
		"--density-pad-y",
		"--density-gap",
		"--density-row-h",
		"--density-text",
	];

	it.each(["compact", "default", "comfortable"])('defines a [data-density="%s"] block', (name) => {
		// Selector must literally appear so the cascade can apply when
		// AppShell sets data-density on the root.
		const selector = `[data-density="${name}"]`;
		expect(cssContent).toContain(selector);
	});

	it.each(["compact", "default", "comfortable"])(
		'the [data-density="%s"] block declares all five density variables',
		(name) => {
			// Pull out the body of the block for this density value.
			const blockRe = new RegExp(`\\[data-density="${name}"\\]\\s*\\{([^}]*)\\}`, "s");
			const match = cssContent.match(blockRe);
			expect(match, `expected block for [data-density="${name}"]`).not.toBeNull();
			const body = match?.[1] ?? "";
			for (const v of REQUIRED_VARS) {
				expect(body).toContain(v);
			}
		},
	);
});

// ---------- d. Focus ring configuration ----------

describe("focus ring configuration", () => {
	it("DaisyUI plugin is included (provides default focus styles)", () => {
		const plugins = tailwindConfig.plugins;
		expect(plugins).toBeDefined();
		expect(plugins?.length).toBeGreaterThan(0);
	});
});

// ---------- e. Font families configured ----------

describe("font families", () => {
	const fontFamily = tailwindConfig.theme?.extend?.fontFamily as
		| Record<string, string[]>
		| undefined;

	it("Inter is configured as sans font", () => {
		expect(fontFamily).toBeDefined();
		expect(fontFamily?.sans).toBeDefined();
		expect(fontFamily?.sans?.some((f) => f.includes("Inter"))).toBe(true);
	});

	it("Space Grotesk is configured as heading font", () => {
		expect(fontFamily).toBeDefined();
		const hasSpaceGrotesk =
			fontFamily?.heading?.some((f) => f.includes("Space Grotesk")) ??
			fontFamily?.display?.some((f) => f.includes("Space Grotesk")) ??
			false;
		expect(hasSpaceGrotesk).toBe(true);
	});
});

// ---------- f. 4px grid base ----------

describe("4px grid base", () => {
	it("Tailwind default 4px spacing base is preserved (no override)", () => {
		// Tailwind's default spacing scale uses 4px increments (1 = 0.25rem = 4px)
		// We verify the config does NOT override the spacing base
		const spacing = tailwindConfig.theme?.spacing;
		// If spacing is defined at top level (not extend), it would override defaults
		// It should either be undefined or only in extend
		expect(spacing).toBeUndefined();
	});
});
