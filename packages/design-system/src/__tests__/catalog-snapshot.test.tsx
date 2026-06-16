/**
 * AJ1 REDO — Vitest DOM-snapshot regression net for the design-system catalog.
 *
 * Enumerates every catalogued `.stories.tsx` in `src/` (51) and `src/kinds/` (7) = 58 total.
 * Renders each story variant in jsdom via `createRoot` + `act()`.
 * Serializes to a deterministic text string (tag + class + style + data-ds-* + role/aria + text).
 * `toMatchSnapshot()` per variant — committed `.snap` files are the regression baseline.
 *
 * @lore AJ1: This replaces the Playwright `toHaveScreenshot` golden-PNG net that was
 *   reverted (#298) because Linux-canonical PNGs go permanently red on macOS via
 *   sub-pixel AA. This vitest+jsdom net serializes DOM TEXT — cross-platform stable,
 *   no browser, no Docker, no PNGs. Runs in `npm run test` → `npm run verify`.
 *   See plans/AJ1/architecture.md for design rationale and coverage statement.
 *
 * @lore AJ1 W-4: `pool: forks` isolates *files*, not *variants within this file*.
 *   All 58 modules × N variants mount in one process → React `useId` counter `_r_N_`
 *   advances per mount. The id-normalization regex (`/_r_[0-9a-z]+_/g` → `__id__`)
 *   is what makes snapshots cross-run stable — NOT forks. Forks prevent cross-FILE
 *   React-scheduler contamination only. The regex runs on EVERY serialized variant
 *   (no early-return path skips it).
 *
 * @lore AJ1 W-3: The viewer globs `src/*.stories.tsx` (49) + web shell/component stories.
 *   It does NOT glob `src/kinds/` (7). This net explicitly globs BOTH roots, so it covers
 *   MORE than the viewer. "Net and viewer enumerate identically" is false — the net covers
 *   the full DS catalog including kinds stories. Kinds stories were confirmed to render in
 *   jsdom without a live block-pipeline (they use static mock data or null-preview fallbacks).
 */

// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { discoverStories, type StoryModule } from "../../viewer/discovery.js";

// Silence React 19 act() warnings for sync render+assert pattern.
// biome-ignore lint/style/useNamingConvention: React's flag name is fixed.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ---------------------------------------------------------------------------
// Story enumeration — mirrors the two DS glob roots.
// NOT the viewer's web-shell/web-component globs (cross-package coupling avoided).
// ---------------------------------------------------------------------------

// @lore AJ1: `import.meta.glob` is a Vite compile-time transform. TypeScript knows
// about it via `"types": ["node"]` in the DS tsconfig (added when removing @playwright/test
// which previously provided @types/node transitively). The DS tsconfig does NOT include
// vite/client to avoid conflicting ImportMeta definitions in pre-existing test files.
// The `as never` cast below satisfies GlobSource's Record<string, Record<string, unknown>>
// constraint since Vite's eager glob returns modules with typed named exports.
const dsRootGlobs = import.meta.glob<Record<string, unknown>>("../*.stories.tsx", {
	eager: true,
});
const dsKindsGlobs = import.meta.glob<Record<string, unknown>>("../kinds/*.stories.tsx", {
	eager: true,
});

const modules: StoryModule[] = discoverStories(dsRootGlobs as never, dsKindsGlobs as never);

// ---------------------------------------------------------------------------
// W-2 guard: enumeration must not silently empty out.
// If a glob-root path is wrong, modules = [] → test suite is vacuously green.
// This fails loudly if the catalog disappears.
// ---------------------------------------------------------------------------
expect(
	modules.length,
	`DS story enumeration returned 0 modules — glob paths are wrong`,
).toBeGreaterThan(0);
expect(
	modules.length,
	`Expected ≥59 DS story modules (52 root + 7 kinds), got ${modules.length}. ` +
		`A glob-root path or story file may have been removed without updating this guard.`,
).toBeGreaterThanOrEqual(59);

// ---------------------------------------------------------------------------
// Serializer — custom DOM walk for deterministic, churn-proof snapshots.
//
// Emits: tag | class | style | data-ds-* | role | aria-* | type | for | id | text
//
// Attribute emission ORDER (fixed — N-2 from critique):
//   tag name, class, style, data-ds-* (sorted by attr name), role,
//   aria-* (sorted by attr name), type, for/htmlFor, id, then other
//   allowed attrs (title, placeholder, href, src, tabindex, name, value,
//   checked, disabled, readonly).
//
// Class TOKEN order: verbatim from component source (stable, intentional).
// Do NOT sort class tokens — sorting hides real reorderings.
//
// id normalization (W-4): runs on EVERY serialized string, no exceptions.
//   React 19 useId(): `_r_N_` → `__id__`
//   React legacy :rN:  → `__id__`
//   This covers id, htmlFor/for, aria-labelledby, aria-describedby,
//   aria-controls, aria-owns — all referencing the same volatile counter.
// ---------------------------------------------------------------------------

// Attributes to capture (in priority order within each group).
const DATA_DS_PREFIX = "data-ds-";
const ARIA_PREFIX = "aria-";

// Attrs outside of data-ds-* / aria-* that we capture.
const EXTRA_ALLOWED_ATTRS = new Set([
	"role",
	"type",
	"for",
	"id",
	"title",
	"placeholder",
	"href",
	"src",
	"tabindex",
	"name",
	"value",
	"checked",
	"disabled",
	"readonly",
]);

/**
 * Normalize nondeterministic tokens in a serialized string.
 * Applied AFTER the DOM walk, unconditionally on every variant.
 * W-4: no early-return path skips this.
 */
function normalizeIds(s: string): string {
	// React 19 useId format: _r_0_, _r_a_, _r_10_ etc.
	let out = s.replace(/_r_[0-9a-z]+_/g, "__id__");
	// React legacy :rN: format (safety net for minor version shifts)
	out = out.replace(/:r[0-9a-z]+:/g, "__id__");
	// Derived ids like __id__-hint / __id__-error already collapse naturally
	// because the _r_N_ prefix is what's replaced. No extra rule needed.

	// Timestamps: ISO 8601 datetime strings in attribute values (e.g. title="2026-06-15T10:22:30.654Z")
	// Some DS stories use Date.now() / new Date() for realistic mock data.
	// These values change between runs → normalize to a stable token.
	// @lore AJ1: The plan said "No dates/timestamps render in DS stories; add if needed" —
	//   they do render in ArtifactTimestamp, ArtifactEmbed, ArtifactPreview, ArtifactGalleryCard,
	//   ArtifactStackItem via title attributes. Added here per the plan's own escape hatch.
	out = out.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g, "__ts__");
	// Unix timestamps (13-digit ms epoch), also per plan's escape hatch.
	out = out.replace(/\b\d{13}\b/g, "__ts__");

	return out;
}

/** Collect element attributes in deterministic order for snapshot stability (N-2). */
function collectAttrs(el: Element): string[] {
	const attrs: string[] = [];

	// 1. class (verbatim token order — sorting hides real reorderings)
	const cls = el.getAttribute("class");
	if (cls) attrs.push(`class="${cls}"`);

	// 2. style
	const style = el.getAttribute("style");
	if (style) attrs.push(`style="${style}"`);

	// 3. data-ds-* (sorted for determinism)
	const dataDs = Array.from(el.attributes)
		.filter((a) => a.name.startsWith(DATA_DS_PREFIX))
		.map((a) => a.name)
		.sort();
	for (const name of dataDs) attrs.push(`${name}="${el.getAttribute(name) ?? ""}"`);

	// 4. role
	const role = el.getAttribute("role");
	if (role) attrs.push(`role="${role}"`);

	// 5. aria-* (sorted for determinism)
	const ariaAttrs = Array.from(el.attributes)
		.filter((a) => a.name.startsWith(ARIA_PREFIX))
		.map((a) => a.name)
		.sort();
	for (const name of ariaAttrs) attrs.push(`${name}="${el.getAttribute(name) ?? ""}"`);

	// 6. other allowed attrs (type, for, id, title, placeholder, href, src, ...)
	for (const name of EXTRA_ALLOWED_ATTRS) {
		if (name === "role") continue; // already added above
		const val = el.getAttribute(name);
		if (val !== null) attrs.push(`${name}="${val}"`);
	}

	return attrs;
}

function serializeNode(node: Node, depth: number): string {
	if (node.nodeType === Node.TEXT_NODE) {
		const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
		return text ? `${"  ".repeat(depth)}${JSON.stringify(text)}\n` : "";
	}
	if (node.nodeType !== Node.ELEMENT_NODE) return "";

	const el = node as Element;
	const tag = el.tagName.toLowerCase();
	const indent = "  ".repeat(depth);
	const attrStr = collectAttrs(el)
		.map((a) => ` ${a}`)
		.join("");
	const childNodes = Array.from(el.childNodes);

	if (childNodes.length === 0) {
		return `${indent}<${tag}${attrStr} />\n`;
	}
	const childLines = childNodes.map((c) => serializeNode(c, depth + 1)).join("");
	return `${indent}<${tag}${attrStr}>\n${childLines}${indent}</${tag}>\n`;
}

/**
 * Serialize the rendered DOM subtree of a story container to a deterministic string.
 * W-4: id normalization runs here, unconditionally, on every call.
 */
export function serializeStoryDom(container: Element): string {
	const childNodes = Array.from(container.childNodes);
	const raw = childNodes.map((n) => serializeNode(n, 0)).join("");
	// W-4: normalize ids ALWAYS — no early-return path skips this.
	return normalizeIds(raw);
}

// ---------------------------------------------------------------------------
// Test suite — one describe per module title, one test per variant.
// ---------------------------------------------------------------------------

describe("catalog-snapshot — DS story enumeration", () => {
	test(`enumerates ≥58 story modules (51 root + 7 kinds)`, () => {
		expect(modules.length).toBeGreaterThanOrEqual(58);
	});
});

for (const module of modules) {
	describe(module.title, () => {
		let container: HTMLDivElement;
		let root: Root;

		beforeEach(() => {
			container = document.createElement("div");
			document.body.appendChild(container);
			root = createRoot(container);
		});

		afterEach(() => {
			root.unmount();
			container.remove();
		});

		for (const variant of module.variants) {
			test(variant.name, async () => {
				await act(async () => {
					root.render(createElement(variant.render));
				});

				const serialized = serializeStoryDom(container);

				// W-2: non-empty guard — a serializer returning "" must FAIL, never snapshot empty.
				// This catches: portal-only trees, comment-only trees, future serializer regressions.
				expect(
					serialized.length,
					`"${module.title} > ${variant.name}": serialized DOM is empty. ` +
						`The component may render a portal or comment-only tree. ` +
						`Check the serializer or add explicit handling for this component.`,
				).toBeGreaterThan(0);

				// The regression baseline.
				expect(serialized).toMatchSnapshot();
			});
		}
	});
}
