// @vitest-environment jsdom
/**
 * AG6 red phase — ItemList component tests.
 *
 * AC-1: ItemList primitive exists, handles empty/loading/error/populated.
 * AC-5: Empty+loading handled consistently via the primitive/companions.
 *
 * Tests FAIL until framework/design-system/src/ItemList.tsx is created (T3).
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ItemList } from "../ItemList.js";
import { Row } from "../Row.js";

// biome-ignore lint/style/useNamingConvention: React flag
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Minimal Row stand-in for testing ItemList state rendering */
function FakeRow({ label }: { label: string }) {
	return createElement("div", { "data-testid": "fake-row" }, label);
}

describe("ItemList (AG6 T3)", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	// ── State precedence: error → loading → empty → children ────────────────

	describe("state precedence (error → loading → empty → children)", () => {
		it("error prop renders ErrorState (highest priority)", () => {
			act(() => {
				root.render(
					createElement(
						ItemList,
						{
							isEmpty: false,
							error: { description: "Could not load data" },
							loading: true, // error takes precedence over loading
						},
						createElement(FakeRow, { label: "Row A" }),
					),
				);
			});
			// ErrorState should be visible, not rows
			expect(container.textContent).toContain("Could not load data");
			expect(container.querySelector("[data-testid='fake-row']")).toBeNull();
		});

		it("loading=true (no error) renders SkeletonList", () => {
			act(() => {
				root.render(
					createElement(
						ItemList,
						{
							isEmpty: false,
							loading: true,
							loadingLabel: "Loading agents",
						},
						createElement(FakeRow, { label: "Row A" }),
					),
				);
			});
			// SkeletonList renders role=status
			const status = container.querySelector("[role='status']");
			expect(status).not.toBeNull();
			// Rows should NOT be rendered
			expect(container.querySelector("[data-testid='fake-row']")).toBeNull();
		});

		it("isEmpty=true (no error, no loading) renders EmptyState", () => {
			act(() => {
				root.render(
					createElement(
						ItemList,
						{
							isEmpty: true,
							empty: {
								title: "No agents",
								description: "No agents are assigned to this team.",
							},
						},
						// No children — but even if there were, isEmpty=true triggers empty state
					),
				);
			});
			expect(container.textContent).toContain("No agents");
			expect(container.textContent).toContain("No agents are assigned to this team.");
		});

		it("isEmpty=false with no error/loading renders children", () => {
			act(() => {
				root.render(
					createElement(
						ItemList,
						{
							isEmpty: false,
							empty: {
								title: "No agents",
								description: "No agents assigned.",
							},
						},
						createElement(FakeRow, { label: "Row A" }),
						createElement(FakeRow, { label: "Row B" }),
					),
				);
			});
			const rows = container.querySelectorAll("[data-testid='fake-row']");
			expect(rows.length).toBe(2);
			// Empty state must NOT appear
			expect(container.textContent).not.toContain("No agents");
		});

		it("error renders even when isEmpty=true (error highest priority)", () => {
			act(() => {
				root.render(
					createElement(ItemList, {
						isEmpty: true,
						error: { description: "Network error" },
						empty: { title: "No items", description: "Empty" },
					}),
				);
			});
			expect(container.textContent).toContain("Network error");
			expect(container.textContent).not.toContain("No items");
		});

		it("loading renders when isEmpty=true and no error (loading beats empty)", () => {
			act(() => {
				root.render(
					createElement(ItemList, {
						isEmpty: true,
						loading: true,
						loadingLabel: "Loading items",
						empty: { title: "No items", description: "Empty" },
					}),
				);
			});
			const status = container.querySelector("[role='status']");
			expect(status).not.toBeNull();
			// Empty state must NOT appear
			expect(container.textContent).not.toContain("No items");
		});
	});

	// ── Required isEmpty prop (explicit flag) ────────────────────────────────

	describe("isEmpty is the single empty signal", () => {
		it("isEmpty=false with no children → children area is empty (no implicit detection)", () => {
			act(() => {
				root.render(
					createElement(ItemList, {
						isEmpty: false,
						empty: { title: "No items", description: "Nothing here" },
					}),
				);
			});
			// isEmpty=false → no EmptyState, even though there are no children
			expect(container.textContent).not.toContain("No items");
		});

		it("isEmpty=true renders EmptyState regardless of children presence", () => {
			act(() => {
				root.render(
					createElement(
						ItemList,
						{
							isEmpty: true,
							empty: { title: "Still empty", description: "Overrides children" },
						},
						createElement(FakeRow, { label: "Hidden row" }),
					),
				);
			});
			expect(container.textContent).toContain("Still empty");
		});
	});

	// ── variant prop ─────────────────────────────────────────────────────────

	describe("variant prop", () => {
		it("variant=contained (default) renders surface-container wrapper", () => {
			act(() => {
				root.render(
					createElement(ItemList, { isEmpty: false }, createElement(FakeRow, { label: "Row" })),
				);
			});
			const el = container.firstElementChild as HTMLElement;
			expect(el?.className ?? "").toContain("surface-container");
		});

		it("variant=flush renders without surface-container background", () => {
			act(() => {
				root.render(
					createElement(
						ItemList,
						{ isEmpty: false, variant: "flush" },
						createElement(FakeRow, { label: "Row" }),
					),
				);
			});
			const el = container.firstElementChild as HTMLElement;
			// Flush variant must not add the contained surface wrapper background
			expect(el?.className ?? "").not.toContain("surface-container");
		});

		it("keeps populated rows contiguous and separates them with dividers", () => {
			act(() => {
				root.render(
					createElement(
						ItemList,
						{ isEmpty: false, "data-testid": "rows" },
						createElement(Row, { title: "First", "data-testid": "row-first" }),
						createElement(Row, { title: "Second", "data-testid": "row-second" }),
					),
				);
			});
			const list = container.querySelector("[data-testid='rows']") as HTMLElement;
			const rows = list.querySelectorAll("[data-ds-component='Row']");
			expect(list.className).not.toMatch(/\bgap-/);
			expect(rows.length).toBe(2);
			for (const row of rows) {
				expect(row.className).toContain("border-b");
				expect(row.className).toContain("last:border-none");
			}
		});
	});

	// ── as prop ──────────────────────────────────────────────────────────────

	describe("as prop", () => {
		it("as=ul renders a <ul> element", () => {
			act(() => {
				root.render(
					createElement(ItemList, { isEmpty: false, as: "ul" }, createElement("li", {}, "item")),
				);
			});
			expect(container.querySelector("ul")).not.toBeNull();
		});

		it("as=div (default) renders a <div> element", () => {
			act(() => {
				root.render(
					createElement(ItemList, { isEmpty: false }, createElement(FakeRow, { label: "Row" })),
				);
			});
			expect(container.querySelector("div")).not.toBeNull();
		});
	});

	// ── loadingRows / loadingLabel ────────────────────────────────────────────

	describe("loading companions", () => {
		it("loadingLabel is passed as aria-label to SkeletonList", () => {
			act(() => {
				root.render(
					createElement(ItemList, {
						isEmpty: false,
						loading: true,
						loadingLabel: "Loading routines",
					}),
				);
			});
			const status = container.querySelector("[role='status']") as HTMLElement | null;
			expect(status).not.toBeNull();
			expect(status?.getAttribute("aria-label")).toBe("Loading routines");
		});
	});

	// ── error companion ───────────────────────────────────────────────────────

	describe("error companion", () => {
		it("error.description renders in ErrorState", () => {
			act(() => {
				root.render(
					createElement(ItemList, {
						isEmpty: false,
						error: { description: "Failed to load agents" },
					}),
				);
			});
			expect(container.textContent).toContain("Failed to load agents");
		});

		it("error=null renders children (no error state)", () => {
			act(() => {
				root.render(
					createElement(
						ItemList,
						{
							isEmpty: false,
							error: null,
						},
						createElement(FakeRow, { label: "Row C" }),
					),
				);
			});
			expect(container.querySelector("[data-testid='fake-row']")).not.toBeNull();
		});
	});

	// ── empty companion: dataTestId passthrough ───────────────────────────────

	describe("empty companion — dataTestId passthrough", () => {
		it("empty.dataTestId appears on EmptyState root element", () => {
			act(() => {
				root.render(
					createElement(ItemList, {
						isEmpty: true,
						empty: {
							title: "No routines",
							description: "This team has no recurring work configured.",
							dataTestId: "team-routines-empty",
						},
					}),
				);
			});
			expect(container.querySelector("[data-testid='team-routines-empty']")).not.toBeNull();
		});
	});

	// ── data-testid passthrough ───────────────────────────────────────────────

	describe("data-testid passthrough on ItemList", () => {
		it("data-testid on ItemList reaches root DOM element", () => {
			act(() => {
				root.render(
					createElement(
						ItemList,
						{ isEmpty: false, "data-testid": "team-agents" },
						createElement(FakeRow, { label: "Row" }),
					),
				);
			});
			expect(container.querySelector("[data-testid='team-agents']")).not.toBeNull();
		});
	});
});
