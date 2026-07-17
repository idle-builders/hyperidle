// @vitest-environment jsdom
/**
 * AG6 red phase — Row component tests.
 *
 * AC-1: Row primitive exists with correct slots.
 * AC-3: Rows share one alignment/separator/hover/focus + 44px touch target.
 *
 * Tests FAIL until packages/design-system/src/Row.tsx is created (T2).
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Row } from "../Row.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("Row (AG6 T2)", () => {
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

	// ── Wrapper element heuristic ────────────────────────────────────────────

	describe("wrapper element heuristic (nested-button rule)", () => {
		it("onClick set, no actions → renders <button>", () => {
			act(() => {
				root.render(createElement(Row, { title: "Hello", onClick: () => {} }));
			});
			const btn = container.querySelector("button");
			expect(btn).not.toBeNull();
		});

		it("<button> has type=button (prevents form submission)", () => {
			act(() => {
				root.render(createElement(Row, { title: "Hello", onClick: () => {} }));
			});
			const btn = container.querySelector("button");
			expect(btn?.getAttribute("type")).toBe("button");
		});

		it("onClick set AND actions present → renders div[role=button] (nested-button rule)", () => {
			act(() => {
				root.render(
					createElement(Row, {
						title: "Hello",
						onClick: () => {},
						actions: createElement("button", { type: "button" }, "Action"),
					}),
				);
			});
			// Must NOT be a <button> at the row level
			// The row-level element should be div[role=button]
			const divRoleButton = container.querySelector("div[role='button']");
			expect(divRoleButton).not.toBeNull();
		});

		it("div[role=button] has tabIndex=0 for keyboard access", () => {
			act(() => {
				root.render(
					createElement(Row, {
						title: "Hello",
						onClick: () => {},
						actions: createElement("button", { type: "button" }, "Action"),
					}),
				);
			});
			const divRoleButton = container.querySelector("div[role='button']");
			expect(divRoleButton?.getAttribute("tabindex")).toBe("0");
		});

		it("onClick absent → renders plain div (no role=button)", () => {
			act(() => {
				root.render(createElement(Row, { title: "Hello" }));
			});
			expect(container.querySelector("div[role='button']")).toBeNull();
			expect(container.querySelector("button")).toBeNull();
		});

		it("as='li' override forces <li> wrapper", () => {
			act(() => {
				root.render(createElement(Row, { title: "Hello", as: "li" }));
			});
			expect(container.querySelector("li")).not.toBeNull();
		});

		it("as='div' override forces <div> even with onClick and no actions", () => {
			act(() => {
				root.render(createElement(Row, { title: "Hello", as: "div", onClick: () => {} }));
			});
			expect(container.querySelector("button")).toBeNull();
			// div is present
			expect(container.querySelector("div")).not.toBeNull();
		});
	});

	// ── Keyboard activation ──────────────────────────────────────────────────

	describe("keyboard activation (Enter/Space on div[role=button])", () => {
		it("Enter key fires onClick when wrapper is div[role=button]", () => {
			let clicked = false;
			act(() => {
				root.render(
					createElement(Row, {
						title: "Hello",
						onClick: () => {
							clicked = true;
						},
						actions: createElement("button", { type: "button" }, "Action"),
					}),
				);
			});
			const divRoleButton = container.querySelector("div[role='button']") as HTMLElement;
			expect(divRoleButton).not.toBeNull();
			act(() => {
				divRoleButton.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
			});
			expect(clicked).toBe(true);
		});

		it("Space key fires onClick when wrapper is div[role=button]", () => {
			let clicked = false;
			act(() => {
				root.render(
					createElement(Row, {
						title: "Hello",
						onClick: () => {
							clicked = true;
						},
						actions: createElement("button", { type: "button" }, "Action"),
					}),
				);
			});
			const divRoleButton = container.querySelector("div[role='button']") as HTMLElement;
			expect(divRoleButton).not.toBeNull();
			act(() => {
				divRoleButton.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
			});
			expect(clicked).toBe(true);
		});
	});

	// ── Touch target ─────────────────────────────────────────────────────────

	describe("44px touch target (AC-3, AQ-015)", () => {
		it("row always has min-h-[44px] class (AC-3 primitive-owned touch target)", () => {
			act(() => {
				root.render(createElement(Row, { title: "Hello" }));
			});
			// The outermost element or its container must include min-h-[44px]
			const el = container.firstElementChild as HTMLElement;
			expect(el?.className ?? "").toContain("min-h-[44px]");
		});

		it("clickable row also has min-h-[44px]", () => {
			act(() => {
				root.render(createElement(Row, { title: "Hello", onClick: () => {} }));
			});
			const el = container.firstElementChild as HTMLElement;
			expect(el?.className ?? "").toContain("min-h-[44px]");
		});
	});

	// ── Title slot ───────────────────────────────────────────────────────────

	describe("title slot (required)", () => {
		it("renders title text", () => {
			act(() => {
				root.render(createElement(Row, { title: "Test Title" }));
			});
			expect(container.textContent).toContain("Test Title");
		});

		it("title element has flex-1 (takes remaining space)", () => {
			act(() => {
				root.render(createElement(Row, { title: "Test Title" }));
			});
			// Find the element containing the title text
			const all = Array.from(container.querySelectorAll("*")) as HTMLElement[];
			const titleEl = all.find(
				(el) => el.textContent?.trim() === "Test Title" && el.className?.includes("flex-1"),
			);
			expect(titleEl).toBeDefined();
		});
	});

	// ── Subtitle slot ────────────────────────────────────────────────────────

	describe("subtitle slot (optional)", () => {
		it("renders subtitle when provided", () => {
			act(() => {
				root.render(createElement(Row, { title: "Hello", subtitle: "Sub text" }));
			});
			expect(container.textContent).toContain("Sub text");
		});

		it("subtitle absent → not rendered (no placeholder)", () => {
			act(() => {
				root.render(createElement(Row, { title: "Hello" }));
			});
			// No subtitle-specific element — content should just be the title
			expect(container.textContent?.trim()).toBe("Hello");
		});
	});

	// ── Lead slot ────────────────────────────────────────────────────────────

	describe("lead slot (optional — AQ-113 no placeholder)", () => {
		it("renders lead when provided", () => {
			act(() => {
				root.render(
					createElement(Row, {
						title: "Hello",
						lead: createElement("span", { "data-testid": "lead-el" }, "●"),
					}),
				);
			});
			expect(container.querySelector("[data-testid='lead-el']")).not.toBeNull();
		});

		it("omitting lead renders NO placeholder element (AQ-113)", () => {
			act(() => {
				root.render(createElement(Row, { title: "Only title" }));
			});
			// No extra nodes before the title — just title text
			expect(container.textContent?.trim()).toBe("Only title");
		});
	});

	// ── Cells ────────────────────────────────────────────────────────────────

	describe("cells slot", () => {
		it("renders cell content", () => {
			act(() => {
				root.render(
					createElement(Row, {
						title: "Hello",
						cells: [{ content: "meta value" }],
					}),
				);
			});
			expect(container.textContent).toContain("meta value");
		});

		it("numeric:true cell has tabular-nums class (AQ-006)", () => {
			act(() => {
				root.render(
					createElement(Row, {
						title: "Hello",
						cells: [{ content: "42", numeric: true, "data-testid": "num-cell" }],
					}),
				);
			});
			const cell = container.querySelector("[data-testid='num-cell']") as HTMLElement | null;
			expect(cell).not.toBeNull();
			expect(cell?.className ?? "").toContain("tabular-nums");
		});

		it("numeric:false (default) cell does NOT have tabular-nums", () => {
			act(() => {
				root.render(
					createElement(Row, {
						title: "Hello",
						cells: [{ content: "text", "data-testid": "text-cell" }],
					}),
				);
			});
			const cell = container.querySelector("[data-testid='text-cell']") as HTMLElement | null;
			expect(cell).not.toBeNull();
			expect(cell?.className ?? "").not.toContain("tabular-nums");
		});

		it("cell with tone='error' uses --status-error token", () => {
			act(() => {
				root.render(
					createElement(Row, {
						title: "Hello",
						cells: [{ content: "Error detail", tone: "error", "data-testid": "err-cell" }],
					}),
				);
			});
			const cell = container.querySelector("[data-testid='err-cell']") as HTMLElement | null;
			expect(cell).not.toBeNull();
			// style or class must reference the error token
			const cellHtml = cell?.outerHTML ?? "";
			expect(cellHtml).toContain("status-error");
		});

		it("cell without tone uses --text-tertiary (default mono tertiary)", () => {
			act(() => {
				root.render(
					createElement(Row, {
						title: "Hello",
						cells: [{ content: "meta", "data-testid": "default-cell" }],
					}),
				);
			});
			const cell = container.querySelector("[data-testid='default-cell']") as HTMLElement | null;
			expect(cell).not.toBeNull();
			const cellHtml = cell?.outerHTML ?? "";
			expect(cellHtml).toContain("text-tertiary");
		});

		it("cell data-testid passthrough reaches DOM (C4 pattern)", () => {
			act(() => {
				root.render(
					createElement(Row, {
						title: "Hello",
						cells: [{ content: "val", "data-testid": "my-cell" }],
					}),
				);
			});
			expect(container.querySelector("[data-testid='my-cell']")).not.toBeNull();
		});
	});

	// ── Actions slot ─────────────────────────────────────────────────────────

	describe("actions slot", () => {
		it("renders actions content", () => {
			act(() => {
				root.render(
					createElement(Row, {
						title: "Hello",
						actions: createElement(
							"button",
							{ type: "button", "data-testid": "action-btn" },
							"Do it",
						),
					}),
				);
			});
			expect(container.querySelector("[data-testid='action-btn']")).not.toBeNull();
		});
	});

	// ── Selected state ───────────────────────────────────────────────────────

	describe("selected state", () => {
		it("selected=true adds aria-current=true", () => {
			act(() => {
				root.render(createElement(Row, { title: "Hello", selected: true }));
			});
			const el = container.firstElementChild as HTMLElement;
			expect(el?.getAttribute("aria-current")).toBe("true");
		});

		it("selected=false does not add aria-current", () => {
			act(() => {
				root.render(createElement(Row, { title: "Hello", selected: false }));
			});
			const el = container.firstElementChild as HTMLElement;
			expect(el?.getAttribute("aria-current")).toBeNull();
		});

		it("selected=true adds surface-elevated class (design §6)", () => {
			act(() => {
				root.render(createElement(Row, { title: "Hello", selected: true }));
			});
			const el = container.firstElementChild as HTMLElement;
			expect(el?.className ?? "").toContain("surface-elevated");
		});

		it("selected=true adds accent-primary border-l (design §6)", () => {
			act(() => {
				root.render(createElement(Row, { title: "Hello", selected: true }));
			});
			const el = container.firstElementChild as HTMLElement;
			expect(el?.className ?? "").toContain("accent-primary");
		});
	});

	// ── data-testid passthrough ──────────────────────────────────────────────

	describe("data-testid passthrough", () => {
		it("data-testid on Row reaches outermost DOM element", () => {
			act(() => {
				root.render(createElement(Row, { title: "Hello", "data-testid": "my-row" }));
			});
			expect(container.querySelector("[data-testid='my-row']")).not.toBeNull();
		});
	});

	// ── ds-attrs marker ─────────────────────────────────────────────────────

	describe("design-system marker (AC-2 check target)", () => {
		it("renders data-ds-component=Row marker (AC-2 migration verifiable)", () => {
			act(() => {
				root.render(createElement(Row, { title: "Hello" }));
			});
			const el = container.querySelector("[data-ds-component='Row']");
			expect(el).not.toBeNull();
		});
	});
});
