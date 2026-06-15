/**
 * AJ1 — Vitest catalog smoke test (replaces the deleted Playwright workbench.spec.ts).
 *
 * AC3: Viewer renders only TSX; every catalogued component is reachable + renders.
 *
 * This test:
 *   - Asserts the catalog enumerates ≥29 story modules (56 total with kinds).
 *   - Asserts every module has ≥1 variant.
 *   - Asserts each variant renders ≥1 DOM element in jsdom (no throw, non-empty).
 *
 * No HTML-toggle assertion needed — the toggle was removed in AJ1 (viewer is TSX-only).
 * See plans/AJ1/architecture.md AC3.
 */

// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, test } from "vitest";
import { discoverStories } from "../../viewer/discovery.js";

// biome-ignore lint/style/useNamingConvention: React's flag name is fixed.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const dsRootGlobs = import.meta.glob<Record<string, unknown>>("../*.stories.tsx", {
	eager: true,
});
const dsKindsGlobs = import.meta.glob<Record<string, unknown>>("../kinds/*.stories.tsx", {
	eager: true,
});

const modules = discoverStories(dsRootGlobs as never, dsKindsGlobs as never);

describe("catalog smoke (AC3)", () => {
	test("enumerates ≥29 story modules", () => {
		expect(modules.length).toBeGreaterThanOrEqual(29);
	});

	test("every module has ≥1 variant", () => {
		for (const mod of modules) {
			expect(
				mod.variants.length,
				`"${mod.title}" has 0 variants — check its story file`,
			).toBeGreaterThanOrEqual(1);
		}
	});

	for (const mod of modules) {
		for (const variant of mod.variants) {
			test(`${mod.title} > ${variant.name} renders ≥1 DOM element`, async () => {
				const container = document.createElement("div");
				document.body.appendChild(container);
				const root = createRoot(container);

				try {
					await act(async () => {
						root.render(createElement(variant.render));
					});
					expect(
						container.children.length + container.childNodes.length,
						`"${mod.title} > ${variant.name}": rendered empty container`,
					).toBeGreaterThan(0);
				} finally {
					root.unmount();
					container.remove();
				}
			});
		}
	}
});
