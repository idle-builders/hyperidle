import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const THEMES_DIR = resolve(__dirname, "../../html/themes");

const THEME_FILES = ["lucid-dark.css", "lucid-light.css"];

const REQUIRED_TOKENS = [
	"--surface-0",
	"--surface-1",
	"--surface-2",
	"--surface-3",
	"--surface-4",
	"--surface-5",
	"--surface-6",
	"--surface-ghost",
	"--primary",
	"--primary-dim",
	"--primary-hover",
	"--warn",
	"--ok",
	"--danger",
	"--text-hi",
	"--text-mid",
	"--text-lo",
	"--float",
	"--r0",
	"--r1",
	"--r2",
	"--r3",
	"--r-pill",
	"--border-subtle",
	"--border-default",
	"--border-emphasis",
	"--motion-fast",
	"--motion-medium",
	"--motion-slow",
	"--ui",
	"--mono",
];

function extractCustomProperties(css: string): string[] {
	const matches = css.match(/--[\w-]+(?=\s*:)/g);
	return [...new Set(matches ?? [])].sort();
}

describe("theme files", () => {
	it("both theme CSS files exist", () => {
		for (const file of THEME_FILES) {
			expect(existsSync(resolve(THEMES_DIR, file))).toBe(true);
		}
	});

	it("theme switcher JS exists", () => {
		expect(existsSync(resolve(THEMES_DIR, "_switcher.js"))).toBe(true);
	});

	for (const file of THEME_FILES) {
		describe(file, () => {
			const cssPath = resolve(THEMES_DIR, file);
			const css = existsSync(cssPath) ? readFileSync(cssPath, "utf-8") : "";
			const props = extractCustomProperties(css);

			it("defines all required tokens", () => {
				const missing = REQUIRED_TOKENS.filter((t) => !props.includes(t));
				expect(missing).toEqual([]);
			});

			it("uses a data-theme selector", () => {
				const themeName = file.replace(".css", "");
				expect(css).toContain(`[data-theme="${themeName}"]`);
			});

			it("declares color-scheme", () => {
				expect(css).toContain("color-scheme:");
			});

			it("has no hardcoded px values in surface tokens", () => {
				// Surface tokens should be hex or rgba, not px values
				const surfaceMatches = css.match(/--surface-\d\s*:\s*[^;]+/g) ?? [];
				for (const match of surfaceMatches) {
					expect(match).not.toContain("px");
				}
			});
		});
	}
});

describe("theme switcher (_switcher.js)", () => {
	const switcherPath = resolve(THEMES_DIR, "_switcher.js");
	const js = existsSync(switcherPath) ? readFileSync(switcherPath, "utf-8") : "";

	it("references both theme files", () => {
		for (const file of THEME_FILES) {
			expect(js).toContain(file);
		}
	});

	it("uses localStorage for persistence", () => {
		expect(js).toContain("localStorage");
	});

	it("sets data-theme attribute", () => {
		expect(js).toContain("data-theme");
	});
});

describe("theme token consistency", () => {
	const themes: Record<string, string[]> = {};
	for (const file of THEME_FILES) {
		const css = readFileSync(resolve(THEMES_DIR, file), "utf-8");
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
