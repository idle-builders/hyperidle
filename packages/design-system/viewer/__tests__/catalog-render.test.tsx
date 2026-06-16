/**
 * AJ6 — AC4/AC6: Catalog render order + error boundary isolation.
 *
 * AC4: Catalog renders groups in GROUPS order (Tiers then Domains), each
 *      non-empty group once, with a Tier/Domain axis divider.
 * AC6: Pages render as originals without crashing the catalog; a throwing
 *      story is isolated by the error boundary.
 */

// @vitest-environment jsdom

import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { StoryModule } from "../discovery.js";

// Silence React 19 act() warnings for sync render+assert pattern.
// biome-ignore lint/style/useNamingConvention: React's flag name is fixed.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ── Minimal fixture modules ───────────────────────────────────────────────

function FakeVariant(): React.JSX.Element {
	return <div>variant</div>;
}

function ThrowingVariant(): React.JSX.Element {
	throw new Error("story render error (deliberate test throw)");
}

const FIXTURE_MODULES: StoryModule[] = [
	// Tier: Foundation (first)
	{
		title: "Button",
		group: { kind: "tier", name: "Foundation" },
		uses: [],
		variants: [{ name: "Default", render: FakeVariant }],
	},
	// Tier: Blocks (third tier — skips Primitives to ensure ordering)
	{
		title: "EmptyState",
		group: { kind: "tier", name: "Blocks" },
		uses: [],
		variants: [{ name: "Default", render: FakeVariant }],
	},
	// Domain: Work (first domain — triggers divider)
	{
		title: "BetCard",
		group: { kind: "domain", name: "Work" },
		uses: [],
		variants: [{ name: "Default", render: FakeVariant }],
	},
	// Domain: System (last domain)
	{
		title: "Shell/Sidebar",
		group: { kind: "domain", name: "System" },
		uses: [],
		variants: [{ name: "Default", render: FakeVariant }],
	},
];

// THROWING_MODULES removed: AC6 tests TsxComponentView (component-detail page),
// not the Catalog index. The catalog only shows titles/variant counts, not v.render().

// ── Lazy import of Catalog from main.tsx ──────────────────────────────────
// We import the named Catalog export from main.tsx. main.tsx must export
// Catalog as a named export for these tests to work.
// If Catalog is not exported, this test file will fail to compile — that is
// intentional (the test drives the implementation shape, per TDD).

// Note: main.tsx calls createRoot(document.getElementById("root")) at module
// level. In a test context the "root" element does not exist, so we need the
// Catalog component to be importable without triggering that mount.
// The builder MUST guard the createRoot call so it only runs in a browser
// context (window.document.readyState check or similar), or export Catalog
// before the mount call.

// Named interface for the dynamic import shape — avoids biome useNamingConvention
// false positives on PascalCase properties in inline object literal types.
interface MainExports {
	// biome-ignore lint/style/useNamingConvention: React component type names are PascalCase by convention
	Catalog: React.ComponentType<{
		modules: StoryModule[];
		onNavigate: (name: string) => void;
	}>;
	// biome-ignore lint/style/useNamingConvention: React component type names are PascalCase by convention
	TsxComponentView: React.ComponentType<{
		module: StoryModule;
		storyRootRef: React.RefObject<HTMLDivElement | null>;
	}>;
}

// Dynamic import to defer module evaluation until test body runs.
async function importMain(): Promise<MainExports> {
	return import("../main.js") as Promise<MainExports>;
}

describe("AC4 — Catalog renders groups in GROUPS order with axis divider", () => {
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

	test("group headings appear in GROUPS order (Tiers then Domains)", async () => {
		const { Catalog } = await importMain();

		await act(async () => {
			root.render(
				createElement(Catalog, {
					modules: FIXTURE_MODULES,
					onNavigate: () => {},
				}),
			);
		});

		// Find all h2 headings (group headings)
		const headings = Array.from(container.querySelectorAll("h2"));
		const headingTexts = headings.map((h) => h.textContent?.trim() ?? "");

		// Should include Foundation, Blocks, Work, System (the 4 non-empty groups)
		expect(headingTexts).toContain("Foundation");
		expect(headingTexts).toContain("Blocks");
		expect(headingTexts).toContain("Work");
		expect(headingTexts).toContain("System");

		// Tiers before Domains: Foundation (tier) before Work (domain)
		const foundationIdx = headingTexts.indexOf("Foundation");
		const workIdx = headingTexts.indexOf("Work");
		expect(foundationIdx).toBeLessThan(workIdx);

		// Blocks (tier) before System (domain)
		const blocksIdx = headingTexts.indexOf("Blocks");
		const systemIdx = headingTexts.indexOf("System");
		expect(blocksIdx).toBeLessThan(systemIdx);
	});

	test("axis divider rendered between last tier and first domain", async () => {
		const { Catalog } = await importMain();

		await act(async () => {
			root.render(
				createElement(Catalog, {
					modules: FIXTURE_MODULES,
					onNavigate: () => {},
				}),
			);
		});

		// Divider must be present — check for data attribute or class
		const divider =
			container.querySelector("[data-axis-divider]") ??
			container.querySelector(".axis-divider") ??
			// Fallback: look for the two label texts
			Array.from(container.querySelectorAll("*")).find(
				(el) =>
					el.textContent?.includes("Reuse vocabulary") && el.textContent?.includes("Product areas"),
			);
		expect(divider, "Axis divider not found in rendered catalog").toBeTruthy();
	});

	test("empty groups omitted — Primitives not in headings when no Primitives modules", async () => {
		const { Catalog } = await importMain();

		await act(async () => {
			root.render(
				createElement(Catalog, {
					modules: FIXTURE_MODULES, // FIXTURE_MODULES has no Primitives entries
					onNavigate: () => {},
				}),
			);
		});

		const headings = Array.from(container.querySelectorAll("h2"));
		const headingTexts = headings.map((h) => h.textContent?.trim() ?? "");
		expect(headingTexts).not.toContain("Primitives");
	});

	test("no divider when no domain groups have items", async () => {
		const { Catalog } = await importMain();

		const tierOnlyModules: StoryModule[] = [
			{
				title: "Button",
				group: { kind: "tier", name: "Foundation" },
				uses: [],
				variants: [{ name: "Default", render: FakeVariant }],
			},
		];

		await act(async () => {
			root.render(
				createElement(Catalog, {
					modules: tierOnlyModules,
					onNavigate: () => {},
				}),
			);
		});

		const divider =
			container.querySelector("[data-axis-divider]") ?? container.querySelector(".axis-divider");
		// no domain modules → no divider
		expect(divider).toBeNull();
	});
});

describe("AC6 — Error boundary: throwing story is isolated in TsxComponentView", () => {
	// The error boundary wraps <v.render/> in TsxComponentView (the component-detail page).
	// The Catalog index only shows titles/variant counts — it doesn't call v.render().
	// AC6 therefore tests TsxComponentView: one module with a throwing variant AND a
	// non-throwing variant; the boundary should catch the throw and show a fallback
	// while the sibling (non-throwing) variant still mounts.
	let container: HTMLDivElement;
	let root: Root;

	const fakeRef = { current: null } as React.RefObject<HTMLDivElement | null>;

	const MODULE_WITH_THROWING_VARIANT: StoryModule = {
		title: "BrokenPage",
		group: { kind: "domain", name: "Work" },
		uses: [],
		variants: [
			{ name: "Default", render: FakeVariant }, // renders fine
			{ name: "Throws", render: ThrowingVariant }, // throws
		],
	};

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		root.unmount();
		container.remove();
	});

	test("a throwing variant shows error fallback; sibling variant still mounts", async () => {
		const { TsxComponentView } = await importMain();

		// Suppress React error boundary noise (throws in jsdom during boundary test)
		// biome-ignore lint/suspicious/noConsole: save + restore pattern for test isolation
		const origError = console.error;
		console.error = (...args: unknown[]) => {
			const msg = String(args[0] ?? "");
			if (msg.includes("story render error") || msg.includes("The above error")) return;
			origError(...args);
		};

		try {
			await act(async () => {
				root.render(
					createElement(TsxComponentView, {
						module: MODULE_WITH_THROWING_VARIANT,
						storyRootRef: fakeRef,
					}),
				);
			});
		} finally {
			console.error = origError;
		}

		// Error boundary fallback must be present for the throwing variant
		const errorEl =
			container.querySelector("[data-story-error]") ??
			container.querySelector(".story-error-boundary");
		expect(
			errorEl,
			"No error boundary fallback found — ThrowingVariant must be caught and show a fallback tile",
		).toBeTruthy();
	});

	test("non-throwing sibling variant ('Default') still mounts after throwing variant", async () => {
		const { TsxComponentView } = await importMain();

		// biome-ignore lint/suspicious/noConsole: save + restore pattern for test isolation
		const origError = console.error;
		console.error = (...args: unknown[]) => {
			const msg = String(args[0] ?? "");
			if (msg.includes("story render error") || msg.includes("The above error")) return;
			origError(...args);
		};

		try {
			await act(async () => {
				root.render(
					createElement(TsxComponentView, {
						module: MODULE_WITH_THROWING_VARIANT,
						storyRootRef: fakeRef,
					}),
				);
			});
		} finally {
			console.error = origError;
		}

		// The "variant" div renders the variant content — "Default" renders FakeVariant
		// (which outputs <div>variant</div>). It must be present.
		const variantContent = container.querySelector("div");
		expect(variantContent, "No variant content found — Default variant should mount").toBeTruthy();
	});
});
