// @vitest-environment jsdom

/**
 * L2 AC-31, AC-42 — <BlockActionsPopover /> coverage.
 */

import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BlockActionsPopover } from "../BlockActionsPopover.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noop = (): void => {};

describe("<BlockActionsPopover />", () => {
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

	const renderPopover = async (props: Record<string, unknown> = {}): Promise<void> => {
		await act(async () => {
			root.render(
				createElement(BlockActionsPopover, {
					id: "popover-1",
					open: true,
					onClose: noop,
					items: [
						{ id: "copy", label: "Copy permalink", shortcut: "⌘L", onSelect: noop },
						{ id: "threads", label: "View threads", shortcut: "↵", onSelect: noop },
					],
					liveRegionId: "live-1",
					...props,
				}) as ReactElement,
			);
		});
	};

	it("AC-31: outermost element carries data-ds-component='block-actions-popover'", async () => {
		await renderPopover();
		const popover = document.querySelector("[data-ds-component='block-actions-popover']");
		expect(popover).toBeTruthy();
	});

	it("AC-31: role='menu' on the popover and role='menuitem' on items", async () => {
		await renderPopover();
		const menu = document.querySelector("[role='menu']");
		expect(menu).toBeTruthy();
		const items = document.querySelectorAll("[role='menuitem']");
		expect(items.length).toBe(2);
	});

	it("AC-31: Esc closes the popover", async () => {
		let closed = 0;
		await renderPopover({ onClose: () => closed++ });
		await act(async () => {
			document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		});
		expect(closed).toBeGreaterThan(0);
	});

	it("AC-31: clicking an item invokes onSelect", async () => {
		let chosen = "";
		await renderPopover({
			items: [
				{
					id: "copy",
					label: "Copy permalink",
					shortcut: "⌘L",
					onSelect: () => {
						chosen = "copy";
					},
				},
			],
		});
		const item = document.querySelector("[role='menuitem']") as HTMLElement;
		await act(async () => {
			item.click();
		});
		expect(chosen).toBe("copy");
	});

	it("AC-42: aria-live='polite' region exists for copy-success announcement", async () => {
		await renderPopover();
		const live = document.querySelector("[aria-live='polite']");
		expect(live).toBeTruthy();
	});

	it("AC-31: disabled items carry aria-disabled='true'", async () => {
		await renderPopover({
			items: [
				{
					id: "edit",
					label: "Suggest edit",
					disabled: true,
					hint: "read-only",
					onSelect: noop,
				},
			],
		});
		const item = document.querySelector("[role='menuitem']") as HTMLElement;
		expect(item.getAttribute("aria-disabled")).toBe("true");
	});
});
