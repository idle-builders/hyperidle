// @vitest-environment jsdom
/**
 * Row component tests.
 *
 * Covers: the Row primitive exists with correct slots; rows share one
 * alignment/separator/hover/focus + 44px touch target.
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Row } from "../Row.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("Row", () => {
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
			expect(btn?.textContent).toBe("Hello");
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
			expect(divRoleButton?.tagName).toBe("DIV");
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
			expect(container.querySelectorAll("li")).toHaveLength(1);
		});

		it("as='div' override forces <div> even with onClick and no actions", () => {
			act(() => {
				root.render(createElement(Row, { title: "Hello", as: "div", onClick: () => {} }));
			});
			expect(container.querySelector("button")).toBeNull();
			// div is present
			expect(container.querySelectorAll("div")).toHaveLength(1);
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

	// ── Title slot ───────────────────────────────────────────────────────────

	describe("title slot (required)", () => {
		it("renders title text", () => {
			act(() => {
				root.render(createElement(Row, { title: "Test Title" }));
			});
			expect(container.textContent).toContain("Test Title");
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

	describe("lead slot (optional — no placeholder)", () => {
		it("renders lead when provided", () => {
			act(() => {
				root.render(
					createElement(Row, {
						title: "Hello",
						lead: createElement("span", { "data-testid": "lead-el" }, "●"),
					}),
				);
			});
			expect(container.querySelectorAll("[data-testid='lead-el']")).toHaveLength(1);
		});

		it("omitting lead renders NO placeholder element", () => {
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

		// AZ7 Set 5 / E7: RowCell.tone deleted — a status/tone shown in a cell
		// was a third status channel (StatusChip, RowDot, and this), with one
		// call site (plan.md §1.6 finding #1). A tinted cell now
		// colors its own `content` directly; see WorkTeam.tsx's agent-context
		// cell. This test used to prove `tone="error"` produced the error
		// token — that prop no longer exists, so every cell is --text-tertiary.

		it("cell uses --text-tertiary (mono tertiary, unconditional)", () => {
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
			expect(container.querySelectorAll("[data-testid='my-cell']")).toHaveLength(1);
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
			expect(container.querySelectorAll("[data-testid='action-btn']")).toHaveLength(1);
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
	});

	// ── data-testid passthrough ──────────────────────────────────────────────

	describe("data-testid passthrough", () => {
		it("data-testid on Row reaches outermost DOM element", () => {
			act(() => {
				root.render(createElement(Row, { title: "Hello", "data-testid": "my-row" }));
			});
			expect(container.querySelectorAll("[data-testid='my-row']")).toHaveLength(1);
		});
	});

	// ── disabled state (button branch) ───────────────────────────────────────

	describe("disabled state (button branch)", () => {
		it("disabled=true sets the disabled attribute and the click handler does not fire", () => {
			let clicked = false;
			act(() => {
				root.render(
					createElement(Row, {
						title: "Hello",
						onClick: () => {
							clicked = true;
						},
						disabled: true,
					}),
				);
			});
			const btn = container.querySelector("button");
			expect(btn?.disabled).toBe(true);
			act(() => {
				btn?.click();
			});
			expect(clicked).toBe(false);
		});

		it("disabled=false (default) leaves the row clickable", () => {
			let clicked = false;
			act(() => {
				root.render(
					createElement(Row, {
						title: "Hello",
						onClick: () => {
							clicked = true;
						},
					}),
				);
			});
			const btn = container.querySelector("button");
			expect(btn?.disabled).toBe(false);
			act(() => {
				btn?.click();
			});
			expect(clicked).toBe(true);
		});
	});

	// ── aria-label / aria-expanded passthrough (button branch) ──────────────

	describe("aria-label / aria-expanded passthrough", () => {
		it("aria-label overrides the accessible name for a row whose visible title is hidden at some breakpoint", () => {
			act(() => {
				root.render(
					createElement(Row, { title: "Hello", onClick: () => {}, "aria-label": "Row label" }),
				);
			});
			const btn = container.querySelector("button");
			expect(btn?.getAttribute("aria-label")).toBe("Row label");
		});

		it("aria-expanded reaches the outermost element for a row that toggles a popover it owns", () => {
			act(() => {
				root.render(
					createElement(Row, { title: "Hello", onClick: () => {}, "aria-expanded": true }),
				);
			});
			const btn = container.querySelector("button");
			expect(btn?.getAttribute("aria-expanded")).toBe("true");
		});

		it("omitting aria-expanded leaves the attribute off entirely", () => {
			act(() => {
				root.render(createElement(Row, { title: "Hello", onClick: () => {} }));
			});
			const btn = container.querySelector("button");
			expect(btn?.hasAttribute("aria-expanded")).toBe(false);
		});
	});
});
