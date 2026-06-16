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
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { GROUPS, type StoryModule } from "../discovery.js";

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

const THROWING_MODULES: StoryModule[] = [
	// Foundation tier — renders fine
	{
		title: "Button",
		group: { kind: "tier", name: "Foundation" },
		uses: [],
		variants: [{ name: "Default", render: FakeVariant }],
	},
	// Work domain — throws; should be caught by error boundary
	{
		title: "BrokenPage",
		group: { kind: "domain", name: "Work" },
		uses: [],
		variants: [{ name: "Default", render: ThrowingVariant }],
	},
	// Knowledge domain — should still mount (sibling isolation)
	{
		title: "KnowledgeRow",
		group: { kind: "domain", name: "Knowledge" },
		uses: [],
		variants: [{ name: "Default", render: FakeVariant }],
	},
];

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

// Dynamic import to defer module evaluation until test body runs.
async function importCatalog(): Promise<{
	Catalog: React.ComponentType<{
		modules: StoryModule[];
		onNavigate: (name: string) => void;
	}>;
}> {
	// eslint-disable-next-line @typescript-eslint/consistent-type-imports
	return import("../main.js") as Promise<{
		Catalog: React.ComponentType<{
			modules: StoryModule[];
			onNavigate: (name: string) => void;
		}>;
	}>;
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
		const { Catalog } = await importCatalog();

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
		const { Catalog } = await importCatalog();

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
					el.textContent?.includes("Reuse vocabulary") &&
					el.textContent?.includes("Product areas"),
			);
		expect(divider, "Axis divider not found in rendered catalog").toBeTruthy();
	});

	test("empty groups omitted — Primitives not in headings when no Primitives modules", async () => {
		const { Catalog } = await importCatalog();

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
		const { Catalog } = await importCatalog();

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
			container.querySelector("[data-axis-divider]") ??
			container.querySelector(".axis-divider");
		// no domain modules → no divider
		expect(divider).toBeNull();
	});
});

describe("AC6 — Error boundary: throwing story is isolated", () => {
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

	test("a throwing story shows error fallback instead of blinking the catalog", async () => {
		const { Catalog } = await importCatalog();

		// Suppress React error boundary console.error for test output cleanliness
		const origError = console.error;
		// biome-ignore lint/suspicious/noConsole: test-only suppression of React error boundary noise
		console.error = (...args: unknown[]) => {
			const msg = String(args[0] ?? "");
			if (msg.includes("story render error") || msg.includes("The above error")) return;
			origError(...args);
		};

		try {
			await act(async () => {
				root.render(
					createElement(Catalog, {
						modules: THROWING_MODULES,
						onNavigate: () => {},
					}),
				);
			});
		} finally {
			// biome-ignore lint/suspicious/noConsole: restoring original console.error
			console.error = origError;
		}

		// Foundation group (Button) must still render
		const headings = Array.from(container.querySelectorAll("h2"));
		const headingTexts = headings.map((h) => h.textContent?.trim() ?? "");
		expect(headingTexts).toContain("Foundation");

		// Knowledge group (KnowledgeRow sibling) must still render
		expect(headingTexts).toContain("Knowledge");

		// An error fallback must be present somewhere in the Work group area
		// (implementation: a data-story-error or .story-error class, or aria-label)
		const errorEl =
			container.querySelector("[data-story-error]") ??
			container.querySelector("[aria-label*='error']") ??
			container.querySelector(".story-error-boundary");
		expect(
			errorEl,
			"No error boundary fallback found — BrokenPage must be caught and show a fallback tile",
		).toBeTruthy();
	});

	test("sibling group (Knowledge) renders after the throwing Work group", async () => {
		const { Catalog } = await importCatalog();

		const origError = console.error;
		// biome-ignore lint/suspicious/noConsole: test-only suppression
		console.error = (...args: unknown[]) => {
			const msg = String(args[0] ?? "");
			if (msg.includes("story render error") || msg.includes("The above error")) return;
			origError(...args);
		};

		try {
			await act(async () => {
				root.render(
					createElement(Catalog, {
						modules: THROWING_MODULES,
						onNavigate: () => {},
					}),
				);
			});
		} finally {
			// biome-ignore lint/suspicious/noConsole: restoring
			console.error = origError;
		}

		// Knowledge group must be present even though Work's story threw
		const knowledgeHeading = Array.from(container.querySelectorAll("h2")).find(
			(h) => h.textContent?.trim() === "Knowledge",
		);
		expect(knowledgeHeading, "Knowledge heading missing — sibling group isolation failed").toBeTruthy();
	});
});
