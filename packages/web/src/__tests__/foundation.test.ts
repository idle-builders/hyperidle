import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import tailwindConfig from "../../tailwind.config";

// ---------- a. Theme token verification ----------

describe("tailwind.config lucid-dark theme", () => {
	const themes = tailwindConfig.daisyui?.themes;
	if (!themes) throw new Error("daisyui.themes not found in config");

	const lucidDarkEntry = themes.find(
		(t): t is Record<string, Record<string, string>> =>
			typeof t === "object" && t !== null && "lucid-dark" in t,
	);

	if (!lucidDarkEntry) throw new Error("lucid-dark theme not found");
	const theme = lucidDarkEntry["lucid-dark"] as Record<string, string>;

	it("lucid-dark theme exists", () => {
		expect(lucidDarkEntry).toBeDefined();
		expect(theme).toBeDefined();
	});

	it("primary is #e0e7ff", () => {
		expect(theme.primary).toBe("#e0e7ff");
	});

	it("secondary is #a8a8b0", () => {
		expect(theme.secondary).toBe("#a8a8b0");
	});

	it("accent is #c8c8d0", () => {
		expect(theme.accent).toBe("#c8c8d0");
	});

	it("error is #f87171", () => {
		expect(theme.error).toBe("#f87171");
	});

	it("base-100 is #111113", () => {
		expect(theme["base-100"]).toBe("#111113");
	});

	it("base-200 is #19191c", () => {
		expect(theme["base-200"]).toBe("#19191c");
	});

	it("base-300 is #1e1e22", () => {
		expect(theme["base-300"]).toBe("#1e1e22");
	});

	it("--rounded-box is 8px", () => {
		expect(theme["--rounded-box"]).toBe("8px");
	});

	it("--rounded-btn is 4px", () => {
		expect(theme["--rounded-btn"]).toBe("4px");
	});

	it("--rounded-badge is 4px", () => {
		expect(theme["--rounded-badge"]).toBe("4px");
	});
});

describe("tailwind.config lucid-light theme", () => {
	const themes = tailwindConfig.daisyui?.themes;
	if (!themes) throw new Error("daisyui.themes not found in config");

	const lucidLightEntry = themes.find(
		(t): t is Record<string, Record<string, string>> =>
			typeof t === "object" && t !== null && "lucid-light" in t,
	);

	if (!lucidLightEntry) throw new Error("lucid-light theme not found");
	const theme = lucidLightEntry["lucid-light"] as Record<string, string>;

	it("lucid-light theme exists", () => {
		expect(lucidLightEntry).toBeDefined();
		expect(theme).toBeDefined();
	});

	it("primary is #4f46e5", () => {
		expect(theme.primary).toBe("#4f46e5");
	});

	it("secondary is #444448", () => {
		// @lore K8 — darkened from #78787e (4.38:1 vs #ffffff, fails WCAG
		// 2.1 AA). #444448 clears the 4.5:1 floor on the entire light-
		// surface ladder, including the worst-case tint-over-surface.
		expect(theme.secondary).toBe("#444448");
	});

	it("accent is #4d4d52", () => {
		// @lore K8 — darkened from #8e8e94 (3.25:1 vs #ffffff, fails WCAG
		// 2.1 AA). #4d4d52 clears the 4.5:1 floor on the entire light-
		// surface ladder, including the worst-case tint-over-surface.
		expect(theme.accent).toBe("#4d4d52");
	});

	it("error is #a91515", () => {
		// @lore K8 — darkened from #dc2626 (3.66:1 on the 14% danger tint
		// over white, fails WCAG 2.1 AA at 12px). #a91515 measures 5.50:1
		// on the same tint and 7.50:1 on bare white.
		expect(theme.error).toBe("#a91515");
	});

	it("base-100 is #fafaf9", () => {
		expect(theme["base-100"]).toBe("#fafaf9");
	});

	it("base-200 is #f4f4f2", () => {
		expect(theme["base-200"]).toBe("#f4f4f2");
	});

	it("base-300 is #eaeae8", () => {
		expect(theme["base-300"]).toBe("#eaeae8");
	});

	it("--rounded-box is 8px", () => {
		expect(theme["--rounded-box"]).toBe("8px");
	});

	it("--rounded-btn is 4px", () => {
		expect(theme["--rounded-btn"]).toBe("4px");
	});

	it("--rounded-badge is 4px", () => {
		expect(theme["--rounded-badge"]).toBe("4px");
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

	it("has no class definitions outside of @layer components (no ad-hoc custom CSS)", () => {
		// Strip @tailwind directives, @import statements, comments, and any
		// @layer base/components blocks (the only places we permit declarations).
		// J1 review: @layer components is permitted exclusively for the three
		// `.tag-tint-*` rules that hold color-mix tints (Tailwind arbitrary-value
		// parsing of `color-mix(...)` is brittle across plugin orderings, so we
		// keep them as named component classes here). New ad-hoc class rules
		// outside an @layer would still trip this check.
		const stripBalancedAtLayer = (input: string, layerName: string): string => {
			const opener = new RegExp(`@layer\\s+${layerName}\\s*\\{`);
			let out = input;
			while (true) {
				const match = opener.exec(out);
				if (!match) return out;
				const start = match.index;
				let depth = 0;
				let i = match.index + match[0].length;
				depth = 1;
				while (i < out.length && depth > 0) {
					const ch = out[i];
					if (ch === "{") depth++;
					else if (ch === "}") depth--;
					i++;
				}
				out = out.slice(0, start) + out.slice(i);
			}
		};

		let stripped = cssContent
			.replace(/@tailwind\s+\w+;/g, "")
			.replace(/@import\s+[^;]+;/g, "")
			.replace(/\/\*[\s\S]*?\*\//g, "");
		stripped = stripBalancedAtLayer(stripped, "base");
		stripped = stripBalancedAtLayer(stripped, "components");
		stripped = stripped.trim();

		const classDefinitions = stripped.match(/\.[a-zA-Z][\w-]*\s*\{/g);
		expect(classDefinitions).toBeNull();
	});
});

// ---------- c. Density CSS variables (J1) ----------

describe("index.css density tokens", () => {
	const cssPath = resolve(__dirname, "../../../design-system/src/tokens.css");
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

	it.each([
		"compact",
		"default",
		"comfortable",
	])('the [data-density="%s"] block declares all five density variables', (name) => {
		// Pull out the body of the block for this density value.
		const blockRe = new RegExp(`\\[data-density="${name}"\\]\\s*\\{([^}]*)\\}`, "s");
		const match = cssContent.match(blockRe);
		expect(match, `expected block for [data-density="${name}"]`).not.toBeNull();
		const body = match?.[1] ?? "";
		for (const v of REQUIRED_VARS) {
			expect(body).toContain(v);
		}
	});

	it("the default density block also targets :root so vars resolve before AppShell mounts", () => {
		// J1 review: anything rendered before the AppShell sets [data-density]
		// on the shell root (e.g. error fallbacks, the loading splash) still
		// needs the density vars to resolve. Verify the default block selector
		// list contains :root.
		const defaultBlockRe = /(:root[^{]*|[^{};]*)\[data-density="default"\][^{]*\{/;
		const match = cssContent.match(defaultBlockRe);
		expect(match, "default density block should be reachable").not.toBeNull();
		expect(match?.[0]).toContain(":root");
	});
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

	it("Geist is configured as sans font", () => {
		expect(fontFamily).toBeDefined();
		expect(fontFamily?.sans).toBeDefined();
		expect(fontFamily?.sans?.some((f) => f.includes("Geist"))).toBe(true);
	});

	it("Geist Mono is configured as heading font", () => {
		expect(fontFamily).toBeDefined();
		const hasGeistMono =
			fontFamily?.heading?.some((f) => f.includes("Geist Mono")) ??
			fontFamily?.display?.some((f) => f.includes("Geist Mono")) ??
			false;
		expect(hasGeistMono).toBe(true);
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
