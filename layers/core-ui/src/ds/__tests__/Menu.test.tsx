// @vitest-environment jsdom

/**
 * Menu primitive: open/close, Escape, click-outside, roles, keyboard nav, dataAttrs passthrough.
 *
 * Red phase: all tests FAIL until Menu.tsx is created in framework/design-system/src/.
 */

import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Menu, type MenuItem, type MenuProps } from "../Menu.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noop = (): void => {};

const DEFAULT_ITEMS: MenuItem[] = [
	{ id: "activate", label: "Activate", onSelect: noop },
	{ id: "kill", label: "Kill", onSelect: noop, destructive: true },
];

describe("Menu: rendering", () => {
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

	const render = async (props: Partial<MenuProps> = {}): Promise<void> => {
		const merged: MenuProps = {
			open: true,
			onClose: noop,
			items: DEFAULT_ITEMS,
			label: "Bet actions",
			...props,
		};
		await act(async () => {
			root.render(createElement(Menu, merged) as ReactElement);
		});
	};

	it("renders null when open=false", async () => {
		await render({ open: false });
		const menu = container.querySelector("[role='menu']");
		expect(menu).toBeNull();
	});

	it("renders role=menu container when open=true", async () => {
		await render({ open: true });
		const menu = container.querySelector("[role='menu']");
		expect(menu).toBeInTheDocument();
	});

	it("role=menu container carries data-ds-component='Menu'", async () => {
		await render({ open: true });
		const menu = container.querySelector("[data-ds-component='Menu']");
		expect(menu).not.toBeNull();
		expect(menu?.getAttribute("role")).toBe("menu");
	});

	it("each item has role=menuitem", async () => {
		await render({ open: true });
		const items = container.querySelectorAll("[role='menuitem']");
		expect(items.length).toBe(DEFAULT_ITEMS.length);
	});

	it("aria-label on the menu container matches the label prop", async () => {
		await render({ open: true, label: "Bet actions" });
		const menu = container.querySelector("[role='menu']");
		expect(menu?.getAttribute("aria-label")).toBe("Bet actions");
	});

	it("disabled item has aria-disabled='true'", async () => {
		await render({
			items: [{ id: "archive", label: "Archive", onSelect: noop, disabled: true }],
		});
		const item = container.querySelector("[role='menuitem']");
		expect(item?.getAttribute("aria-disabled")).toBe("true");
	});

	it("clicking an item invokes its onSelect", async () => {
		let chosen = "";
		await render({
			items: [
				{
					id: "activate",
					label: "Activate",
					onSelect: () => {
						chosen = "activate";
					},
				},
			],
		});
		const item = container.querySelector("[role='menuitem']") as HTMLElement;
		await act(async () => {
			item.click();
		});
		expect(chosen).toBe("activate");
	});

	it("clicking an item invokes onClose", async () => {
		let closed = 0;
		await render({
			items: [{ id: "activate", label: "Activate", onSelect: noop }],
			onClose: () => {
				closed++;
			},
		});
		const item = container.querySelector("[role='menuitem']") as HTMLElement;
		await act(async () => {
			item.click();
		});
		expect(closed).toBeGreaterThan(0);
	});
});

describe("Menu: Escape closes the menu", () => {
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

	it("Escape key dispatched on document calls onClose", async () => {
		let closed = 0;
		await act(async () => {
			root.render(
				createElement(Menu, {
					open: true,
					onClose: () => {
						closed++;
					},
					items: DEFAULT_ITEMS,
					label: "Bet actions",
				}) as ReactElement,
			);
		});
		await act(async () => {
			document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		});
		expect(closed).toBeGreaterThan(0);
	});
});

describe("Menu: click-outside closes the menu", () => {
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

	it("mousedown outside the menu container calls onClose", async () => {
		let closed = 0;
		await act(async () => {
			root.render(
				createElement(Menu, {
					open: true,
					onClose: () => {
						closed++;
					},
					items: DEFAULT_ITEMS,
					label: "Bet actions",
				}) as ReactElement,
			);
		});
		// Click outside — on body, not inside the menu
		await act(async () => {
			document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
		});
		expect(closed).toBeGreaterThan(0);
	});

	it("mousedown INSIDE the menu does NOT call onClose", async () => {
		let closed = 0;
		await act(async () => {
			root.render(
				createElement(Menu, {
					open: true,
					onClose: () => {
						closed++;
					},
					items: DEFAULT_ITEMS,
					label: "Bet actions",
				}) as ReactElement,
			);
		});
		const menu = container.querySelector("[role='menu']") as HTMLElement;
		await act(async () => {
			menu.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
		});
		expect(closed).toBe(0);
	});
});

describe("Menu: keyboard navigation", () => {
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

	const renderMenu = async (
		items: MenuItem[] = DEFAULT_ITEMS,
		onClose: () => void = noop,
	): Promise<void> => {
		await act(async () => {
			root.render(
				createElement(Menu, {
					open: true,
					onClose,
					items,
					label: "Bet actions",
				}) as ReactElement,
			);
		});
	};

	it("ArrowDown moves focus to next item", async () => {
		await renderMenu();
		const items = container.querySelectorAll("[role='menuitem']") as NodeListOf<HTMLElement>;
		// Focus first item manually then press ArrowDown
		await act(async () => {
			items[0]?.focus();
		});
		await act(async () => {
			items[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
		});
		// @lore: act() flush — focus() can defer under parallel JSDOM load; extra act() ensures it settles before asserting document.activeElement
		await act(async () => {});
		expect(document.activeElement).toBe(items[1]);
	});

	it("ArrowUp moves focus to previous item", async () => {
		await renderMenu();
		const items = container.querySelectorAll("[role='menuitem']") as NodeListOf<HTMLElement>;
		await act(async () => {
			items[1]?.focus();
		});
		await act(async () => {
			items[1]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
		});
		expect(document.activeElement).toBe(items[0]);
	});

	it("Home key moves focus to first item", async () => {
		await renderMenu([
			{ id: "a", label: "A", onSelect: noop },
			{ id: "b", label: "B", onSelect: noop },
			{ id: "c", label: "C", onSelect: noop },
		]);
		const items = container.querySelectorAll("[role='menuitem']") as NodeListOf<HTMLElement>;
		await act(async () => {
			items[2]?.focus();
		});
		await act(async () => {
			items[2]?.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
		});
		expect(document.activeElement).toBe(items[0]);
	});

	it("End key moves focus to last item", async () => {
		await renderMenu([
			{ id: "a", label: "A", onSelect: noop },
			{ id: "b", label: "B", onSelect: noop },
			{ id: "c", label: "C", onSelect: noop },
		]);
		const items = container.querySelectorAll("[role='menuitem']") as NodeListOf<HTMLElement>;
		await act(async () => {
			items[0]?.focus();
		});
		await act(async () => {
			items[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
		});
		expect(document.activeElement).toBe(items[2]);
	});

	it("Enter key invokes the focused item's onSelect", async () => {
		let chosen = "";
		await renderMenu([
			{
				id: "activate",
				label: "Activate",
				onSelect: () => {
					chosen = "activate";
				},
			},
		]);
		const item = container.querySelector("[role='menuitem']") as HTMLElement;
		await act(async () => {
			item.focus();
		});
		await act(async () => {
			item.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		});
		expect(chosen).toBe("activate");
	});

	it("Space key invokes the focused item's onSelect", async () => {
		let chosen = "";
		await renderMenu([
			{
				id: "activate",
				label: "Activate",
				onSelect: () => {
					chosen = "activate";
				},
			},
		]);
		const item = container.querySelector("[role='menuitem']") as HTMLElement;
		await act(async () => {
			item.focus();
		});
		await act(async () => {
			item.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
		});
		expect(chosen).toBe("activate");
	});

	it("Tab key calls onClose", async () => {
		let closed = 0;
		await renderMenu(DEFAULT_ITEMS, () => {
			closed++;
		});
		const item = container.querySelector("[role='menuitem']") as HTMLElement;
		await act(async () => {
			item.focus();
		});
		await act(async () => {
			item.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
		});
		expect(closed).toBeGreaterThan(0);
	});
});

describe("Menu: dataAttrs passthrough", () => {
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

	it("bet item with dataAttrs emits literal data-bet-action attribute", async () => {
		await act(async () => {
			root.render(
				createElement(Menu, {
					open: true,
					onClose: noop,
					label: "Bet actions",
					items: [
						{
							id: "kill",
							label: "Kill bet",
							onSelect: noop,
							destructive: true,
							dataAttrs: { "data-bet-action": "kill" },
						},
					],
				}) as ReactElement,
			);
		});
		const item = container.querySelector("[data-bet-action='kill']");
		expect(item).not.toBeNull();
		expect(item?.getAttribute("role")).toBe("menuitem");
	});

	it("document item with dataAttrs emits literal data-testid attribute", async () => {
		await act(async () => {
			root.render(
				createElement(Menu, {
					open: true,
					onClose: noop,
					label: "Document actions",
					items: [
						{
							id: "archive",
							label: "Archive",
							onSelect: noop,
							dataAttrs: { "data-testid": "document-archive" },
						},
					],
				}) as ReactElement,
			);
		});
		const item = container.querySelector("[data-testid='document-archive']");
		expect(item).not.toBeNull();
		expect(item?.getAttribute("role")).toBe("menuitem");
	});

	it("multiple dataAttrs keys are all spread onto the item button", async () => {
		await act(async () => {
			root.render(
				createElement(Menu, {
					open: true,
					onClose: noop,
					label: "Actions",
					items: [
						{
							id: "multi",
							label: "Multi",
							onSelect: noop,
							dataAttrs: {
								"data-bet-action": "activate",
								"data-testid": "activate-btn",
							},
						},
					],
				}) as ReactElement,
			);
		});
		const item = container.querySelector("[data-bet-action='activate']") as HTMLElement | null;
		expect(item).not.toBeNull();
		expect(item?.dataset.testid).toBe("activate-btn");
	});
});

describe("Menu: focus management (WARNING-A)", () => {
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

	it("opening the menu focuses the first enabled menuitem", async () => {
		// Render with open=true; focus should move to first item automatically.
		await act(async () => {
			root.render(
				createElement(Menu, {
					open: true,
					onClose: noop,
					items: DEFAULT_ITEMS,
					label: "Bet actions",
				}) as ReactElement,
			);
		});
		// Wait for the rAF that defers the focus call.
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 20));
		});
		const items = container.querySelectorAll("[role='menuitem']") as NodeListOf<HTMLElement>;
		expect(document.activeElement).toBe(items[0]);
	});

	it("opening the menu skips disabled items and focuses the first enabled one", async () => {
		await act(async () => {
			root.render(
				createElement(Menu, {
					open: true,
					onClose: noop,
					items: [
						{ id: "disabled-first", label: "Unavailable", onSelect: noop, disabled: true },
						{ id: "enabled-second", label: "Activate", onSelect: noop },
					],
					label: "Bet actions",
				}) as ReactElement,
			);
		});
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 20));
		});
		const items = container.querySelectorAll("[role='menuitem']") as NodeListOf<HTMLElement>;
		// First item is disabled — focus should land on second
		expect(document.activeElement).toBe(items[1]);
	});

	it("closing the menu restores focus to the previously-focused element", async () => {
		// Create a trigger button to simulate the real trigger pattern.
		const trigger = document.createElement("button");
		trigger.textContent = "Open menu";
		document.body.appendChild(trigger);

		try {
			// Focus the trigger before opening the menu.
			await act(async () => {
				trigger.focus();
			});
			expect(document.activeElement).toBe(trigger);

			// Open menu — focus moves to first item.
			await act(async () => {
				root.render(
					createElement(Menu, {
						open: true,
						onClose: noop,
						items: DEFAULT_ITEMS,
						label: "Bet actions",
					}) as ReactElement,
				);
			});
			await act(async () => {
				await new Promise((resolve) => setTimeout(resolve, 20));
			});

			// Close the menu — focus should return to trigger.
			await act(async () => {
				root.render(
					createElement(Menu, {
						open: false,
						onClose: noop,
						items: DEFAULT_ITEMS,
						label: "Bet actions",
					}) as ReactElement,
				);
			});
			expect(document.activeElement).toBe(trigger);
		} finally {
			trigger.remove();
		}
	});
});

describe("Menu: align prop", () => {
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

	it('align="end" renders (default)', async () => {
		await act(async () => {
			root.render(
				createElement(Menu, {
					open: true,
					onClose: noop,
					items: DEFAULT_ITEMS,
					label: "Actions",
					align: "end",
				}) as ReactElement,
			);
		});
		expect(container.querySelectorAll("[role='menu']")).toHaveLength(1);
	});

	it('align="start" renders', async () => {
		await act(async () => {
			root.render(
				createElement(Menu, {
					open: true,
					onClose: noop,
					items: DEFAULT_ITEMS,
					label: "Actions",
					align: "start",
				}) as ReactElement,
			);
		});
		expect(container.querySelectorAll("[role='menu']")).toHaveLength(1);
	});
});
