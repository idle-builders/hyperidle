import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import tailwindConfig from "../../tailwind.config";

// ---------- a. Theme token verification ----------

describe("tailwind.config hearth-dark theme (U4)", () => {
	const themes = tailwindConfig.daisyui?.themes;
	if (!themes) throw new Error("daisyui.themes not found in config");

	it("hearth-dark theme exists and lucid-dark does NOT", () => {
		const hasHearthDark = themes.some(
			(t) => typeof t === "object" && t !== null && "hearth-dark" in t,
		);
		const hasLucidDark = themes.some(
			(t) => typeof t === "object" && t !== null && "lucid-dark" in t,
		);
		expect(hasHearthDark).toBe(true);
		expect(hasLucidDark).toBe(false);
	});

	const hearthDarkEntry = themes.find(
		(t): t is Record<string, Record<string, string>> =>
			typeof t === "object" && t !== null && "hearth-dark" in t,
	);
	const theme = hearthDarkEntry?.["hearth-dark"] as Record<string, string> | undefined;

	it("primary is #2eaa7a (accent-primary dark)", () => {
		expect(theme?.primary).toBe("#2eaa7a");
	});

	it("primary-content is #ffffff", () => {
		expect(theme?.["primary-content"]).toBe("#ffffff");
	});

	it("secondary is #d97706 (accent-secondary)", () => {
		expect(theme?.secondary).toBe("#d97706");
	});

	it("base-100 is #1a1510 (surface-page dark)", () => {
		expect(theme?.["base-100"]).toBe("#1a1510");
	});

	it("base-200 is #231e16 (surface-container dark)", () => {
		expect(theme?.["base-200"]).toBe("#231e16");
	});

	it("base-300 is #3d342a (border-subtle dark)", () => {
		expect(theme?.["base-300"]).toBe("#3d342a");
	});

	it("base-content is #ede5d8 (text-primary dark)", () => {
		expect(theme?.["base-content"]).toBe("#ede5d8");
	});

	it("error is #ee6a5a (status-error dark)", () => {
		expect(theme?.error).toBe("#ee6a5a");
	});

	it("error-content is #ffffff", () => {
		expect(theme?.["error-content"]).toBe("#ffffff");
	});

	it("success is #2eaa7a (status-success dark)", () => {
		expect(theme?.success).toBe("#2eaa7a");
	});

	it("success-content is #ffffff", () => {
		expect(theme?.["success-content"]).toBe("#ffffff");
	});

	it("warning is #d97706 (status-warning)", () => {
		expect(theme?.warning).toBe("#d97706");
	});

	it("info is #4498d4 (status-info dark)", () => {
		expect(theme?.info).toBe("#4498d4");
	});

	it("--rounded-box is 16px (r-default, Hearth pill-heavy)", () => {
		expect(theme?.["--rounded-box"]).toBe("16px");
	});

	it("--rounded-btn is 9999px (r-pill)", () => {
		expect(theme?.["--rounded-btn"]).toBe("9999px");
	});

	it("--rounded-badge is 9999px (r-pill)", () => {
		expect(theme?.["--rounded-badge"]).toBe("9999px");
	});
});

describe("tailwind.config hearth-light theme (U4)", () => {
	const themes = tailwindConfig.daisyui?.themes;
	if (!themes) throw new Error("daisyui.themes not found in config");

	it("hearth-light theme exists and lucid-light does NOT", () => {
		const hasHearthLight = themes.some(
			(t) => typeof t === "object" && t !== null && "hearth-light" in t,
		);
		const hasLucidLight = themes.some(
			(t) => typeof t === "object" && t !== null && "lucid-light" in t,
		);
		expect(hasHearthLight).toBe(true);
		expect(hasLucidLight).toBe(false);
	});

	const hearthLightEntry = themes.find(
		(t): t is Record<string, Record<string, string>> =>
			typeof t === "object" && t !== null && "hearth-light" in t,
	);
	const theme = hearthLightEntry?.["hearth-light"] as Record<string, string> | undefined;

	it("primary is #16764f (accent-primary light)", () => {
		expect(theme?.primary).toBe("#16764f");
	});

	it("primary-content is #ffffff", () => {
		expect(theme?.["primary-content"]).toBe("#ffffff");
	});

	it("secondary is #d97706 (accent-secondary)", () => {
		expect(theme?.secondary).toBe("#d97706");
	});

	it("base-100 is #f5f0e6 (surface-page light)", () => {
		expect(theme?.["base-100"]).toBe("#f5f0e6");
	});

	it("base-200 is #ede7db (surface-container light)", () => {
		expect(theme?.["base-200"]).toBe("#ede7db");
	});

	it("base-300 is #e8e0d0 (border-subtle light)", () => {
		expect(theme?.["base-300"]).toBe("#e8e0d0");
	});

	it("base-content is #2c241a (text-primary light)", () => {
		expect(theme?.["base-content"]).toBe("#2c241a");
	});

	it("error is #dc4a3a (status-error light)", () => {
		expect(theme?.error).toBe("#dc4a3a");
	});

	it("error-content is #ffffff", () => {
		expect(theme?.["error-content"]).toBe("#ffffff");
	});

	it("success is #16764f (status-success light)", () => {
		expect(theme?.success).toBe("#16764f");
	});

	it("success-content is #ffffff", () => {
		expect(theme?.["success-content"]).toBe("#ffffff");
	});

	it("warning is #d97706 (status-warning)", () => {
		expect(theme?.warning).toBe("#d97706");
	});

	it("info is #2e7dba (status-info light)", () => {
		expect(theme?.info).toBe("#2e7dba");
	});

	it("--rounded-box is 16px (r-default, Hearth)", () => {
		expect(theme?.["--rounded-box"]).toBe("16px");
	});

	it("--rounded-btn is 9999px (r-pill)", () => {
		expect(theme?.["--rounded-btn"]).toBe("9999px");
	});

	it("--rounded-badge is 9999px (r-pill)", () => {
		expect(theme?.["--rounded-badge"]).toBe("9999px");
	});
});

// ---------- b. index.css — no Geist, no Google Fonts ----------

describe("index.css has no custom CSS", () => {
	const cssPath = resolve(__dirname, "../index.css");
	const cssContent = readFileSync(cssPath, "utf-8");

	it("contains @tailwind directives", () => {
		expect(cssContent).toContain("@tailwind base");
		expect(cssContent).toContain("@tailwind components");
		expect(cssContent).toContain("@tailwind utilities");
	});

	it("does NOT contain Google Fonts import (U4: Geist removed)", () => {
		expect(cssContent).not.toContain("fonts.googleapis.com");
	});

	it("does NOT contain Geist font reference (U4: system-ui replaces Geist)", () => {
		expect(cssContent).not.toContain("Geist");
	});

	it("still imports design-system tokens (tokens.css must remain)", () => {
		expect(cssContent).toContain("@hyperidle/design-system/tokens.css");
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

// ---------- c. (W2 REMOVED) Density CSS variables (J1) ----------
// @lore W2: The density system was completely stripped. [data-density] blocks removed
// from tokens.css. These tests were removed in W2 — see plans/W2/architecture.md.

// ---------- d. Focus ring configuration ----------

describe("focus ring configuration", () => {
	it("DaisyUI plugin is included (provides default focus styles)", () => {
		const plugins = tailwindConfig.plugins;
		expect(plugins).toBeDefined();
		expect(plugins?.length).toBeGreaterThan(0);
	});
});

// ---------- e. Font families configured (U4: Hearth system-ui, no Geist) ----------

describe("font families (U4)", () => {
	const fontFamily = tailwindConfig.theme?.extend?.fontFamily as
		| Record<string, string[]>
		| undefined;

	it("system-ui is the first sans font (Geist replaced)", () => {
		expect(fontFamily).toBeDefined();
		expect(fontFamily?.sans).toBeDefined();
		expect(fontFamily?.sans?.[0]).toBe("system-ui");
	});

	it("sans fonts do NOT include Geist (U4: Geist removed)", () => {
		expect(fontFamily?.sans?.some((f) => f.includes("Geist"))).toBe(false);
	});

	it("mono font family exists (replaced heading)", () => {
		expect(fontFamily?.mono).toBeDefined();
		expect(Array.isArray(fontFamily?.mono)).toBe(true);
	});

	it("mono fonts do NOT include Geist Mono (U4: ui-monospace replaces Geist Mono)", () => {
		expect(fontFamily?.mono?.some((f) => f.includes("Geist"))).toBe(false);
	});

	it("heading font family no longer exists (renamed to mono)", () => {
		expect(fontFamily?.heading).toBeUndefined();
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

// ---------- g. extend.colors (U4: Hearth surface/text tokens) ----------

describe("extend.colors (U4: Hearth surface and text tokens)", () => {
	const colors = tailwindConfig.theme?.extend?.colors as Record<string, string> | undefined;

	it("has surface-page (replaces surface-0)", () => {
		expect(colors?.["surface-page"]).toBe("var(--surface-page)");
	});

	it("has surface-container (replaces surface-1/surface-2)", () => {
		expect(colors?.["surface-container"]).toBe("var(--surface-container)");
	});

	it("has surface-elevated (replaces surface-3/surface-4)", () => {
		expect(colors?.["surface-elevated"]).toBe("var(--surface-elevated)");
	});

	it("has surface-overlay (replaces surface-5/surface-6)", () => {
		expect(colors?.["surface-overlay"]).toBe("var(--surface-overlay)");
	});

	it("has text-primary (replaces text-hi)", () => {
		expect(colors?.["text-primary"]).toBe("var(--text-primary)");
	});

	it("has text-secondary (replaces text-mid)", () => {
		expect(colors?.["text-secondary"]).toBe("var(--text-secondary)");
	});

	it("has text-tertiary (replaces text-lo)", () => {
		expect(colors?.["text-tertiary"]).toBe("var(--text-tertiary)");
	});

	it("does NOT have surface-0 (Lucid legacy, removed in U4)", () => {
		expect(colors?.["surface-0"]).toBeUndefined();
	});

	it("does NOT have surface-1 through surface-6 (Lucid legacy, removed in U4)", () => {
		for (let i = 1; i <= 6; i++) {
			expect(colors?.[`surface-${i}`]).toBeUndefined();
		}
	});

	it("does NOT have surface-ghost (Lucid legacy, removed in U4)", () => {
		expect(colors?.["surface-ghost"]).toBeUndefined();
	});

	it("does NOT have text-hi (Lucid legacy, removed in U4)", () => {
		expect(colors?.["text-hi"]).toBeUndefined();
	});

	it("does NOT have text-mid (Lucid legacy, removed in U4)", () => {
		expect(colors?.["text-mid"]).toBeUndefined();
	});

	it("does NOT have text-lo (Lucid legacy, removed in U4)", () => {
		expect(colors?.["text-lo"]).toBeUndefined();
	});
});

// ---------- h. extend.borderColor (U4: Hearth border-strong replaces border-emphasis) ----------

describe("extend.borderColor (U4: Hearth border tokens)", () => {
	const borderColor = tailwindConfig.theme?.extend?.borderColor as
		| Record<string, string>
		| undefined;

	it("has border-subtle", () => {
		expect(borderColor?.["border-subtle"]).toBe("var(--border-subtle)");
	});

	it("has border-default", () => {
		expect(borderColor?.["border-default"]).toBe("var(--border-default)");
	});

	it("has border-strong (replaces border-emphasis)", () => {
		expect(borderColor?.["border-strong"]).toBe("var(--border-strong)");
	});

	it("does NOT have border-emphasis (Lucid legacy, removed in U4)", () => {
		expect(borderColor?.["border-emphasis"]).toBeUndefined();
	});
});
