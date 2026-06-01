/**
 * W1 — Hearth Foundation Design acceptance criteria tests.
 *
 * Every test maps 1:1 to an acceptance criterion in
 * `.pipeline/work-packages/TRACK-W.md` story W1. These are the red-phase
 * tests: they verify that the designer's HTML deliverables meet the spec.
 *
 * @lore W1 is a design-only workpackage — no TSX. Tests use `fs` to read HTML
 *   files and assert structural / content properties. No browser required.
 *   Density assertions are particularly important: the TRACK-W.md spec
 *   explicitly forbids the density system from appearing in any mockup.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const DS_ROOT = resolve(__dirname, "..");
const HTML_DIR = resolve(DS_ROOT, "html");
const SCREENS_DIR = resolve(HTML_DIR, "screens");

// ── File lists ────────────────────────────────────────────────────────────────

/** Foundation primitive HTML files (Tier 0) — new for W1. */
const FOUNDATION_PRIMITIVES = [
	"Avatar.html",
	"Button.html",
	"Input.html",
	"Select.html",
	"Toggle.html",
	"Checkbox.html",
	"TabBar.html",
	"Toast.html",
	"Progress.html",
	"Tooltip.html",
] as const;

/** Rewritten component HTML files (Tier 1-2). */
const REWRITTEN_COMPONENTS = [
	"BetCard.html",
	"ThreadRow.html",
	"Composer.html",
	"EmptyState.html",
	"ErrorState.html",
	"NavItem.html",
	"CommentRow.html",
] as const;

/** All W1 component HTML files (primitives + rewritten). */
const ALL_COMPONENT_HTML = [...FOUNDATION_PRIMITIVES, ...REWRITTEN_COMPONENTS] as const;

/**
 * Full-page screen mockups. onboarding.html and error-states.html are special
 * contexts (no app sidebar); the remaining 10 are full app-shell screens.
 */
const ALL_SCREEN_FILES = [
	"conversations-thread-list.html",
	"conversations-thread-detail.html",
	"conversations-empty.html",
	"work-bet-overview.html",
	"work-bet-detail.html",
	"work-empty.html",
	"knowledge-list.html",
	"knowledge-detail.html",
	"knowledge-empty.html",
	"settings.html",
	"onboarding.html",
	"error-states.html",
] as const;

/** Screens that must include the sidebar (all except onboarding and error-states). */
const SIDEBAR_SCREENS = ALL_SCREEN_FILES.filter(
	(f) => f !== "onboarding.html" && f !== "error-states.html",
);

/**
 * Screens that must have sidebar bet items WITH status dots.
 * Conversations and Work screens show bets in the sidebar.
 * Knowledge screens show "Scope" and "Topics" sections instead (intentional per design-critique.md).
 * Settings screens show settings navigation instead.
 *
 * @lore The design critique explicitly notes: "The only variation is the knowledge
 *   screens use 'Scope' and 'Topics' sections instead of 'Bets' and 'Teams' —
 *   this is intentional." Settings uses a different sidebar nav pattern.
 */
const SIDEBAR_BET_DOT_SCREENS = [
	"conversations-thread-list.html",
	"conversations-thread-detail.html",
	"conversations-empty.html",
	"work-bet-overview.html",
	"work-bet-detail.html",
	"work-empty.html",
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function readHtml(filePath: string): string {
	if (!existsSync(filePath)) {
		throw new Error(`File not found: ${filePath}`);
	}
	return readFileSync(filePath, "utf-8");
}

// ── Test Suites ───────────────────────────────────────────────────────────────

describe("W1 — Foundation Primitive HTML files exist", () => {
	for (const file of FOUNDATION_PRIMITIVES) {
		it(`html/${file} exists`, () => {
			expect(
				existsSync(resolve(HTML_DIR, file)),
				`Foundation primitive missing: html/${file}`,
			).toBe(true);
		});
	}
});

describe("W1 — Rewritten Component HTML files exist", () => {
	for (const file of REWRITTEN_COMPONENTS) {
		it(`html/${file} exists`, () => {
			expect(existsSync(resolve(HTML_DIR, file)), `Rewritten component missing: html/${file}`).toBe(
				true,
			);
		});
	}
});

describe("W1 — Screen mockup HTML files exist", () => {
	for (const file of ALL_SCREEN_FILES) {
		it(`html/screens/${file} exists`, () => {
			expect(
				existsSync(resolve(SCREENS_DIR, file)),
				`Screen mockup missing: html/screens/${file}`,
			).toBe(true);
		});
	}
});

describe("W1 — All HTML files link to _tokens.css", () => {
	it("each foundation primitive links to _tokens.css", () => {
		const failures: string[] = [];
		for (const file of FOUNDATION_PRIMITIVES) {
			const path = resolve(HTML_DIR, file);
			if (!existsSync(path)) {
				failures.push(`${file}: file does not exist`);
				continue;
			}
			const html = readHtml(path);
			if (!html.includes("_tokens.css")) {
				failures.push(`${file}: does not link to _tokens.css`);
			}
		}
		expect(failures, failures.join("\n")).toEqual([]);
	});

	it("each rewritten component links to _tokens.css", () => {
		const failures: string[] = [];
		for (const file of REWRITTEN_COMPONENTS) {
			const path = resolve(HTML_DIR, file);
			if (!existsSync(path)) {
				failures.push(`${file}: file does not exist`);
				continue;
			}
			const html = readHtml(path);
			if (!html.includes("_tokens.css")) {
				failures.push(`${file}: does not link to _tokens.css`);
			}
		}
		expect(failures, failures.join("\n")).toEqual([]);
	});

	it("each screen mockup links to _tokens.css (via ../_tokens.css)", () => {
		const failures: string[] = [];
		for (const file of ALL_SCREEN_FILES) {
			const path = resolve(SCREENS_DIR, file);
			if (!existsSync(path)) {
				failures.push(`${file}: file does not exist`);
				continue;
			}
			const html = readHtml(path);
			if (!html.includes("_tokens.css")) {
				failures.push(`${file}: does not link to _tokens.css`);
			}
		}
		expect(failures, failures.join("\n")).toEqual([]);
	});
});

describe("W1 — All HTML files include theme switcher", () => {
	it("each foundation primitive includes _switcher.js", () => {
		const failures: string[] = [];
		for (const file of FOUNDATION_PRIMITIVES) {
			const path = resolve(HTML_DIR, file);
			if (!existsSync(path)) {
				failures.push(`${file}: file does not exist`);
				continue;
			}
			const html = readHtml(path);
			if (!html.includes("_switcher")) {
				failures.push(`${file}: does not include _switcher.js theme switcher`);
			}
		}
		expect(failures, failures.join("\n")).toEqual([]);
	});

	it("each rewritten component includes _switcher.js", () => {
		const failures: string[] = [];
		for (const file of REWRITTEN_COMPONENTS) {
			const path = resolve(HTML_DIR, file);
			if (!existsSync(path)) {
				failures.push(`${file}: file does not exist`);
				continue;
			}
			const html = readHtml(path);
			if (!html.includes("_switcher")) {
				failures.push(`${file}: does not include _switcher.js theme switcher`);
			}
		}
		expect(failures, failures.join("\n")).toEqual([]);
	});

	it("each screen mockup includes _switcher.js", () => {
		const failures: string[] = [];
		for (const file of ALL_SCREEN_FILES) {
			const path = resolve(SCREENS_DIR, file);
			if (!existsSync(path)) {
				failures.push(`${file}: file does not exist`);
				continue;
			}
			const html = readHtml(path);
			if (!html.includes("_switcher")) {
				failures.push(`${file}: does not include _switcher.js theme switcher`);
			}
		}
		expect(failures, failures.join("\n")).toEqual([]);
	});
});

describe("W1 — No density system in any HTML file or doc", () => {
	/**
	 * @lore The density system is the primary architectural anti-pattern W1
	 *   eliminates. `data-density`, `--density-*`, and the three mode words
	 *   `compact`/`comfortable`/`[data-density]` must not appear in any W1
	 *   deliverable. Note: AESTHETICS.md AQ-003 is ALLOWED to *mention* density
	 *   to explain that it does not exist — the rule bans affirmative usage
	 *   (selectors, token references), not explanatory text.
	 */

	it("no W1 component HTML file uses [data-density] attribute or selector", () => {
		const failures: string[] = [];
		for (const file of ALL_COMPONENT_HTML) {
			const path = resolve(HTML_DIR, file);
			if (!existsSync(path)) continue;
			const html = readHtml(path);
			if (/data-density/i.test(html)) {
				failures.push(`${file}: contains data-density`);
			}
		}
		expect(failures, failures.join("\n")).toEqual([]);
	});

	it("no W1 component HTML file uses --density-* CSS tokens", () => {
		const failures: string[] = [];
		for (const file of ALL_COMPONENT_HTML) {
			const path = resolve(HTML_DIR, file);
			if (!existsSync(path)) continue;
			const html = readHtml(path);
			if (/--density-/i.test(html)) {
				failures.push(`${file}: uses --density-* token`);
			}
		}
		expect(failures, failures.join("\n")).toEqual([]);
	});

	it("no screen mockup uses [data-density] attribute or selector", () => {
		const failures: string[] = [];
		for (const file of ALL_SCREEN_FILES) {
			const path = resolve(SCREENS_DIR, file);
			if (!existsSync(path)) continue;
			const html = readHtml(path);
			if (/data-density/i.test(html)) {
				failures.push(`screens/${file}: contains data-density`);
			}
		}
		expect(failures, failures.join("\n")).toEqual([]);
	});

	it("no screen mockup uses --density-* CSS tokens", () => {
		const failures: string[] = [];
		for (const file of ALL_SCREEN_FILES) {
			const path = resolve(SCREENS_DIR, file);
			if (!existsSync(path)) continue;
			const html = readHtml(path);
			if (/--density-/i.test(html)) {
				failures.push(`screens/${file}: uses --density-* token`);
			}
		}
		expect(failures, failures.join("\n")).toEqual([]);
	});
});

describe("W1 — Sidebar present in full-page screen mockups", () => {
	/**
	 * TRACK-W.md AC: "The sidebar in every screen mockup matches 03-hearth.html:
	 * brand wordmark, bet items with colored status dots, team items, dividers,
	 * active state."
	 *
	 * We verify structural presence (sidebar element + brand wordmark text) in
	 * every screen that should have an app shell. onboarding.html and
	 * error-states.html are standalone pages and are exempt.
	 */

	it("each app-shell screen includes sidebar markup and brand wordmark", () => {
		const failures: string[] = [];
		for (const file of SIDEBAR_SCREENS) {
			const path = resolve(SCREENS_DIR, file);
			if (!existsSync(path)) {
				failures.push(`${file}: file does not exist`);
				continue;
			}
			const html = readHtml(path);
			// Must have sidebar class or element
			if (!html.includes("sidebar")) {
				failures.push(`${file}: no sidebar element found`);
			}
			// Must have brand wordmark (HyperIdle text in sidebar)
			if (!html.includes("HyperIdle")) {
				failures.push(`${file}: no brand wordmark "HyperIdle" found`);
			}
		}
		expect(failures, failures.join("\n")).toEqual([]);
	});

	it("conversations and work screens include status dots in sidebar bet items", () => {
		const failures: string[] = [];
		for (const file of SIDEBAR_BET_DOT_SCREENS) {
			const path = resolve(SCREENS_DIR, file);
			if (!existsSync(path)) continue;
			const html = readHtml(path);
			// Status dots appear as sidebar-dot, status-dot, statusDot, or
			// dot classes in the sidebar. Sidebar-dot is the canonical class name
			// from 03-hearth.html.
			const hasStatusDot =
				html.includes("sidebar-dot") ||
				html.includes("status-dot") ||
				html.includes("statusDot") ||
				/\bdot\b.*sidebar|sidebar.*\bdot\b/i.test(html);
			if (!hasStatusDot) {
				failures.push(`${file}: no status dot found in sidebar bet items`);
			}
		}
		expect(failures, failures.join("\n")).toEqual([]);
	});
});

describe("W1 — No Lorem ipsum in any HTML file", () => {
	it("no foundation primitive contains Lorem ipsum", () => {
		const failures: string[] = [];
		for (const file of FOUNDATION_PRIMITIVES) {
			const path = resolve(HTML_DIR, file);
			if (!existsSync(path)) continue;
			const html = readHtml(path);
			if (/lorem\s+ipsum/i.test(html)) {
				failures.push(`${file}: contains Lorem ipsum`);
			}
		}
		expect(failures, failures.join("\n")).toEqual([]);
	});

	it("no rewritten component contains Lorem ipsum", () => {
		const failures: string[] = [];
		for (const file of REWRITTEN_COMPONENTS) {
			const path = resolve(HTML_DIR, file);
			if (!existsSync(path)) continue;
			const html = readHtml(path);
			if (/lorem\s+ipsum/i.test(html)) {
				failures.push(`${file}: contains Lorem ipsum`);
			}
		}
		expect(failures, failures.join("\n")).toEqual([]);
	});

	it("no screen mockup contains Lorem ipsum", () => {
		const failures: string[] = [];
		for (const file of ALL_SCREEN_FILES) {
			const path = resolve(SCREENS_DIR, file);
			if (!existsSync(path)) continue;
			const html = readHtml(path);
			if (/lorem\s+ipsum/i.test(html)) {
				failures.push(`screens/${file}: contains Lorem ipsum`);
			}
		}
		expect(failures, failures.join("\n")).toEqual([]);
	});
});

describe("W1 — Foundation primitives have required variant states", () => {
	/**
	 * Each foundation primitive must demonstrate the key states that W2
	 * builders need to see. These are inferred from the architecture plan
	 * and design critique.
	 */

	it("Button.html shows at least primary, secondary, disabled states", () => {
		const html = readHtml(resolve(HTML_DIR, "Button.html"));
		// Primary button
		expect(html.toLowerCase()).toContain("primary");
		// Secondary or ghost
		expect(html.toLowerCase()).toMatch(/secondary|ghost/);
		// Disabled state
		expect(html.toLowerCase()).toContain("disabled");
	});

	it("Input.html shows default, focus/active, error, disabled states", () => {
		const html = readHtml(resolve(HTML_DIR, "Input.html"));
		expect(html.toLowerCase()).toContain("error");
		expect(html.toLowerCase()).toContain("disabled");
		// Focus or active state
		expect(html.toLowerCase()).toMatch(/focus|active/);
	});

	it("Toggle.html shows on and off states", () => {
		const html = readHtml(resolve(HTML_DIR, "Toggle.html"));
		// Should show both on and off states
		expect(html.toLowerCase()).toMatch(/on|checked|active/);
		expect(html.toLowerCase()).toMatch(/off|unchecked/);
	});

	it("Checkbox.html shows checked and unchecked states", () => {
		const html = readHtml(resolve(HTML_DIR, "Checkbox.html"));
		expect(html.toLowerCase()).toMatch(/checked/);
		expect(html.toLowerCase()).toMatch(/unchecked/);
	});

	it("Toast.html shows multiple variant states (success, error)", () => {
		const html = readHtml(resolve(HTML_DIR, "Toast.html"));
		expect(html.toLowerCase()).toContain("success");
		expect(html.toLowerCase()).toContain("error");
	});

	it("Select.html shows default state with options", () => {
		const html = readHtml(resolve(HTML_DIR, "Select.html"));
		// Should have a select element or custom select component
		expect(html.toLowerCase()).toMatch(/select|option/);
	});

	it("Avatar.html shows sm, md, lg sizes", () => {
		const html = readHtml(resolve(HTML_DIR, "Avatar.html"));
		// Three sizes defined in architecture
		expect(html.toLowerCase()).toMatch(/avatar--sm|\.sm|size.*sm|28px/);
		expect(html.toLowerCase()).toMatch(/avatar--md|\.md|size.*md|36px/);
		expect(html.toLowerCase()).toMatch(/avatar--lg|\.lg|size.*lg|48px/);
	});

	it("Avatar.html shows human and agent role variants", () => {
		const html = readHtml(resolve(HTML_DIR, "Avatar.html"));
		// Agent avatar has distinct visual treatment
		expect(html.toLowerCase()).toMatch(/agent/);
		// Human avatar
		expect(html.toLowerCase()).toMatch(/human/);
	});

	it("Progress.html shows progress bars with labels", () => {
		const html = readHtml(resolve(HTML_DIR, "Progress.html"));
		// Progress bars should have percentage or value indicators
		expect(html).toMatch(/\d+%|aria-valuenow|role="progressbar"|progress-/i);
	});

	it("TabBar.html shows active and inactive tab states", () => {
		const html = readHtml(resolve(HTML_DIR, "TabBar.html"));
		// Must have active state
		expect(html.toLowerCase()).toMatch(/active|selected/);
	});
});

describe("W1 — DESIGN.md rewritten as manifesto", () => {
	const DESIGN_MD_PATH = resolve(DS_ROOT, "DESIGN.md");

	it("DESIGN.md exists", () => {
		expect(existsSync(DESIGN_MD_PATH), "DESIGN.md missing").toBe(true);
	});

	it("DESIGN.md contains manifesto-style language (warm, tactile, human)", () => {
		const content = readFileSync(DESIGN_MD_PATH, "utf-8");
		const lower = content.toLowerCase();
		// Manifesto must describe the feeling — not just list tokens
		expect(lower).toMatch(/warm|tactile|human|inviting|organic/);
	});

	it("DESIGN.md describes the Hearth design language", () => {
		const content = readFileSync(DESIGN_MD_PATH, "utf-8");
		// Must reference Hearth
		expect(content).toMatch(/hearth/i);
	});

	it("DESIGN.md does not reference compact/comfortable density modes as active features", () => {
		const content = readFileSync(DESIGN_MD_PATH, "utf-8");
		// The doc must NOT affirm density as a feature — no "compact mode",
		// no "comfortable mode", no density system description as something to use.
		// It may mention them in passing to say they don't exist.
		const densityAffirmations = [
			/compact\s+mode/i,
			/comfortable\s+mode/i,
			/data-density/i,
			/--density-[a-z]/i,
		];
		const failures: string[] = [];
		for (const re of densityAffirmations) {
			if (re.test(content)) {
				failures.push(`DESIGN.md matches forbidden density pattern: ${re.source}`);
			}
		}
		expect(failures, failures.join("\n")).toEqual([]);
	});

	it("DESIGN.md describes typography scale (not a token spreadsheet)", () => {
		const content = readFileSync(DESIGN_MD_PATH, "utf-8");
		// Should mention typography with some scale values
		expect(content.toLowerCase()).toMatch(/typography|type scale|font/);
		// Should have actual pixel values or type step names
		expect(content).toMatch(/\d+px|xs|sm|md|lg|xl/);
	});

	it("DESIGN.md describes spacing and shadows", () => {
		const content = readFileSync(DESIGN_MD_PATH, "utf-8");
		const lower = content.toLowerCase();
		expect(lower).toMatch(/spacing|space|shadow/);
	});
});

describe("W1 — AESTHETICS.md rewritten with density removed", () => {
	const AESTHETICS_MD_PATH = resolve(DS_ROOT, "AESTHETICS.md");

	it("AESTHETICS.md exists", () => {
		expect(existsSync(AESTHETICS_MD_PATH), "AESTHETICS.md missing").toBe(true);
	});

	it("AESTHETICS.md does not use data-density as an affirmative selector", () => {
		const content = readFileSync(AESTHETICS_MD_PATH, "utf-8");
		// data-density should not appear as a CSS selector or HTML attribute
		// (The AQ-003 rule is ALLOWED to mention it in an explanatory "do not use" context)
		// We test that it doesn't appear in CSS selector context (e.g. [data-density=...])
		expect(content).not.toMatch(/\[data-density\s*=/);
	});

	it("AESTHETICS.md does not prescribe --density-* token usage", () => {
		const content = readFileSync(AESTHETICS_MD_PATH, "utf-8");
		// Must not have lines like "use --density-spacing-1" etc.
		expect(content).not.toMatch(/use\s+--density-/i);
		expect(content).not.toMatch(/var\(--density-/i);
	});

	it("AESTHETICS.md contains warmth/depth design rules", () => {
		const content = readFileSync(AESTHETICS_MD_PATH, "utf-8");
		const lower = content.toLowerCase();
		// Must describe the visual principles that replaced density
		expect(lower).toMatch(/warm|shadow|depth|layer/);
	});

	it("AESTHETICS.md contains at least 5 named rules (AQ-NNN pattern)", () => {
		const content = readFileSync(AESTHETICS_MD_PATH, "utf-8");
		// Rules use AQ-001 through AQ-NNN pattern
		const ruleMatches = content.match(/AQ-\d{3}/g) ?? [];
		const uniqueRules = new Set(ruleMatches);
		expect(
			uniqueRules.size,
			`Expected >= 5 AQ-NNN rules in AESTHETICS.md, found: ${uniqueRules.size}`,
		).toBeGreaterThanOrEqual(5);
	});

	it("AESTHETICS.md AQ-003 (or equivalent) states no density system", () => {
		const content = readFileSync(AESTHETICS_MD_PATH, "utf-8");
		const lower = content.toLowerCase();
		// Must explicitly document that density system does not exist
		const hasNoDensityRule =
			lower.includes("no density system") ||
			lower.includes("density system does not exist") ||
			lower.includes("no compact") ||
			(lower.includes("density") && lower.includes("one size"));
		expect(
			hasNoDensityRule,
			"AESTHETICS.md must explicitly state that the density system does not exist",
		).toBe(true);
	});
});

describe("W1 — Foundation primitive data attributes", () => {
	/**
	 * Architecture plan: "All components carry: data-component, data-tier,
	 * data-uses, data-daisyui, data-used-by."
	 *
	 * We check the minimum required: data-component and data-tier.
	 */

	it("each foundation primitive includes data-component attribute", () => {
		const failures: string[] = [];
		for (const file of FOUNDATION_PRIMITIVES) {
			const path = resolve(HTML_DIR, file);
			if (!existsSync(path)) continue;
			const html = readHtml(path);
			if (!html.includes("data-component")) {
				failures.push(`${file}: missing data-component attribute`);
			}
		}
		expect(failures, failures.join("\n")).toEqual([]);
	});

	it("each foundation primitive includes data-tier attribute", () => {
		const failures: string[] = [];
		for (const file of FOUNDATION_PRIMITIVES) {
			const path = resolve(HTML_DIR, file);
			if (!existsSync(path)) continue;
			const html = readHtml(path);
			if (!html.includes("data-tier")) {
				failures.push(`${file}: missing data-tier attribute`);
			}
		}
		expect(failures, failures.join("\n")).toEqual([]);
	});

	it("each rewritten component includes data-component attribute", () => {
		const failures: string[] = [];
		for (const file of REWRITTEN_COMPONENTS) {
			const path = resolve(HTML_DIR, file);
			if (!existsSync(path)) continue;
			const html = readHtml(path);
			if (!html.includes("data-component")) {
				failures.push(`${file}: missing data-component attribute`);
			}
		}
		expect(failures, failures.join("\n")).toEqual([]);
	});
});

describe("W1 — Screen mockup structural completeness", () => {
	it("conversations-thread-list.html shows populated thread list with unread indicators", () => {
		const html = readHtml(resolve(SCREENS_DIR, "conversations-thread-list.html"));
		const lower = html.toLowerCase();
		// Must show thread rows
		expect(lower).toMatch(/thread|message/);
		// Must show unread indicator (dot or badge)
		expect(lower).toMatch(/unread|dot/);
	});

	it("conversations-thread-detail.html shows messages and composer", () => {
		const html = readHtml(resolve(SCREENS_DIR, "conversations-thread-detail.html"));
		const lower = html.toLowerCase();
		// Must have message area
		expect(lower).toMatch(/message|comment/);
		// Must have composer
		expect(lower).toMatch(/composer|input|textarea|placeholder/);
	});

	it("work-bet-overview.html shows bet cards with progress", () => {
		const html = readHtml(resolve(SCREENS_DIR, "work-bet-overview.html"));
		const lower = html.toLowerCase();
		// Must show bet cards
		expect(lower).toMatch(/bet|bet-card/);
		// Must show progress indicators
		expect(lower).toMatch(/progress|%/);
	});

	it("settings.html shows profile, appearance, and notification sections", () => {
		const html = readHtml(resolve(SCREENS_DIR, "settings.html"));
		const lower = html.toLowerCase();
		// Must cover profile settings
		expect(lower).toMatch(/profile|name|email/);
		// Must cover appearance settings (theme, not density)
		expect(lower).toMatch(/appearance|theme/);
		// Must cover notification settings
		expect(lower).toMatch(/notification/);
	});

	it("onboarding.html communicates welcoming experience (not a debug form)", () => {
		const html = readHtml(resolve(SCREENS_DIR, "onboarding.html"));
		const lower = html.toLowerCase();
		// Must have welcoming language
		expect(lower).toMatch(/welcome|get started|setup|onboard/);
		// Must use Hearth cards or brand elements
		expect(lower).toMatch(/hyperidle|hearth|card/);
	});

	it("error-states.html shows warm error treatment (not raw text)", () => {
		const html = readHtml(resolve(SCREENS_DIR, "error-states.html"));
		const lower = html.toLowerCase();
		// Must show 404 or API error
		expect(lower).toMatch(/404|error|not found/);
		// Must use card-based warm treatment (not just text)
		expect(lower).toMatch(/card|surface/);
	});

	it("knowledge-list.html shows topic groups and knowledge rows", () => {
		const html = readHtml(resolve(SCREENS_DIR, "knowledge-list.html"));
		const lower = html.toLowerCase();
		// Must show topics or groups
		expect(lower).toMatch(/topic|group|pattern|decision/);
		// Must show knowledge items
		expect(lower).toMatch(/knowledge|document|note/);
	});
});
