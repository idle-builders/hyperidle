import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const HTML_DIR = resolve(__dirname, "../../html");

const EXPECTED_COMPONENTS = [
	"StatusChip",
	"Tag",
	"KeyValue",
	"NavItem",
	"SearchField",
	"ThreadRow",
	"BetCard",
	"PitchCard",
	"TaskCard",
	"KnowledgeRow",
	"NotificationRow",
	"EmptyState",
	"ErrorState",
	"Skeleton",
];

describe("HTML component files", () => {
	it("all 14 component HTML files exist", () => {
		for (const name of EXPECTED_COMPONENTS) {
			const filePath = resolve(HTML_DIR, `${name}.html`);
			expect(existsSync(filePath), `${name}.html missing`).toBe(true);
		}
	});

	it("catalog HTML exists", () => {
		expect(existsSync(resolve(HTML_DIR, "_catalog.html"))).toBe(true);
	});

	for (const name of EXPECTED_COMPONENTS) {
		describe(`${name}.html`, () => {
			const filePath = resolve(HTML_DIR, `${name}.html`);
			const html = existsSync(filePath) ? readFileSync(filePath, "utf-8") : "";

			it("is valid HTML (has doctype and html tags)", () => {
				expect(html).toContain("<!doctype html>");
				expect(html).toContain("<html");
				expect(html).toContain("</html>");
			});

			it("links _tokens.css", () => {
				expect(html).toContain("_tokens.css");
			});

			it("loads React and Babel from CDN", () => {
				expect(html).toContain("react");
				expect(html).toContain("babel");
			});

			it("has data-component attribute matching filename", () => {
				expect(html).toContain(`data-component="${name}"`);
			});

			it("has data-tier attribute", () => {
				expect(html).toContain("data-tier=");
			});

			it("includes theme switcher script", () => {
				expect(html).toContain("themes/_switcher.js");
			});

			it("renders into #root", () => {
				expect(html).toContain('id="root"');
				expect(html).toContain("createRoot");
			});

			it("has a title tag with component name", () => {
				expect(html).toContain(`<title>${name}`);
			});

			it("does not use hardcoded hex colors in inline styles (uses CSS variables)", () => {
				// Check the <style> block for hardcoded hex — CSS custom property definitions are OK
				const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
				if (styleMatch) {
					const styleContent = styleMatch[1];
					// Remove CSS custom property definitions (--foo: #hex is fine)
					const withoutVarDefs = styleContent.replace(/--[\w-]+\s*:\s*[^;]+;/g, "");
					// Check remaining content for hardcoded hex colors
					const hardcodedHex = withoutVarDefs.match(/#[0-9a-fA-F]{3,8}(?![0-9a-fA-F])/g);
					expect(hardcodedHex ?? []).toEqual([]);
				}
			});
		});
	}
});

describe("catalog (_catalog.html)", () => {
	const catalogPath = resolve(HTML_DIR, "_catalog.html");
	const html = existsSync(catalogPath) ? readFileSync(catalogPath, "utf-8") : "";

	it("links to all 14 component files", () => {
		for (const name of EXPECTED_COMPONENTS) {
			expect(html).toContain(`${name}.html`);
		}
	});

	it("includes theme switcher", () => {
		expect(html).toContain("themes/_switcher.js");
	});
});
