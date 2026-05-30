import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const THEMES_DIR = resolve(__dirname, "../../html/themes");

// U4: Renamed from lucid-* to hearth-*
const THEME_FILES = ["hearth-dark.css", "hearth-light.css"];

// U4: Updated from Lucid token names to Hearth token names
const REQUIRED_TOKENS = [
	"--surface-page",
	"--surface-container",
	"--surface-elevated",
	"--surface-overlay",
	"--text-primary",
	"--text-secondary",
	"--text-tertiary",
	"--text-placeholder",
	"--text-on-accent",
	"--accent-primary",
	"--accent-primary-dim",
	"--accent-primary-hover",
	"--accent-secondary",
	"--status-success",
	"--status-warning",
	"--status-error",
	"--status-info",
	"--border-subtle",
	"--border-default",
	"--border-strong",
	"--shadow-subtle",
	"--shadow-default",
	"--shadow-elevated",
	"--r-none",
	"--r-subtle",
	"--r-default",
	"--r-pill",
	"--motion-fast",
	"--motion-default",
	"--motion-slow",
	"--font-sans",
	"--font-mono",
];

function extractCustomProperties(css: string): string[] {
	const matches = css.match(/--[\w-]+(?=\s*:)/g);
	return [...new Set(matches ?? [])].sort();
}

describe("theme files", () => {
	it("both theme CSS files exist (hearth-dark.css and hearth-light.css)", () => {
		for (const file of THEME_FILES) {
			expect(existsSync(resolve(THEMES_DIR, file))).toBe(true);
		}
	});

	it("lucid-dark.css and lucid-light.css do NOT exist (U4: renamed to hearth-*)", () => {
		expect(existsSync(resolve(THEMES_DIR, "lucid-dark.css"))).toBe(false);
		expect(existsSync(resolve(THEMES_DIR, "lucid-light.css"))).toBe(false);
	});

	it("theme switcher JS exists", () => {
		expect(existsSync(resolve(THEMES_DIR, "_switcher.js"))).toBe(true);
	});

	for (const file of THEME_FILES) {
		describe(file, () => {
			const cssPath = resolve(THEMES_DIR, file);
			const css = existsSync(cssPath) ? readFileSync(cssPath, "utf-8") : "";
			const props = extractCustomProperties(css);

			it("defines all required Hearth tokens", () => {
				const missing = REQUIRED_TOKENS.filter((t) => !props.includes(t));
				expect(missing).toEqual([]);
			});

			it("uses a data-theme selector with hearth- prefix", () => {
				const themeName = file.replace(".css", "");
				expect(css).toContain(`[data-theme="${themeName}"]`);
			});

			it("declares color-scheme", () => {
				expect(css).toContain("color-scheme:");
			});

			it("has no hardcoded px values in surface tokens", () => {
				// Surface tokens should be hex or rgba, not px values
				const surfaceMatches = css.match(/--surface-[\w]+\s*:\s*[^;]+/g) ?? [];
				for (const match of surfaceMatches) {
					expect(match).not.toContain("px");
				}
			});

			it("does NOT use Lucid token names (--surface-0 through surface-6, --text-hi, etc.)", () => {
				expect(css).not.toContain("--surface-0");
				expect(css).not.toContain("--text-hi");
				expect(css).not.toContain("--text-mid");
				expect(css).not.toContain("--text-lo");
				expect(css).not.toContain("--border-emphasis");
			});
		});
	}
});

describe("theme switcher (_switcher.js)", () => {
	const switcherPath = resolve(THEMES_DIR, "_switcher.js");
	const js = existsSync(switcherPath) ? readFileSync(switcherPath, "utf-8") : "";

	it("references hearth theme files (not lucid)", () => {
		expect(js).toContain("hearth-dark.css");
		expect(js).toContain("hearth-light.css");
		expect(js).not.toContain("lucid-dark");
		expect(js).not.toContain("lucid-light");
	});

	it("uses localStorage for persistence", () => {
		expect(js).toContain("localStorage");
	});

	it("sets data-theme attribute", () => {
		expect(js).toContain("data-theme");
	});

	it("defaults to hearth-light (Hearth is light-first)", () => {
		expect(js).toContain("hearth-light");
	});
});

describe("theme token consistency", () => {
	const themes: Record<string, string[]> = {};
	for (const file of THEME_FILES) {
		const cssPath = resolve(THEMES_DIR, file);
		const css = existsSync(cssPath) ? readFileSync(cssPath, "utf-8") : "";
		themes[file] = extractCustomProperties(css);
	}

	it("all themes define the same set of tokens", () => {
		const referenceTokens = themes[THEME_FILES[0]];
		for (const file of THEME_FILES.slice(1)) {
			const missing = referenceTokens.filter((t) => !themes[file].includes(t));
			const extra = themes[file].filter((t) => !referenceTokens.includes(t));
			expect(missing).toEqual([]);
			expect(extra).toEqual([]);
		}
	});
});
