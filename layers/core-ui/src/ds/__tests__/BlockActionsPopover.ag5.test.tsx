// @vitest-environment jsdom

/**
 * AG5 — BlockActionsPopover renders through Menu (C1 single-owner assertion).
 *
 * After the AG5 refactor, BlockActionsPopover must:
 *   - produce a Menu-owned role=menu container (data-ds-component="Menu" present)
 *   - NOT define its own role=menu element separately from Menu
 *
 * Red phase: tests FAIL until BlockActionsPopover.tsx is refactored to render through <Menu>.
 */

import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BlockActionsPopover } from "../BlockActionsPopover.js";

// biome-ignore lint/style/useNamingConvention: React's flag name is fixed.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noop = (): void => {};

const BASE_PROPS = {
	id: "popover-1",
	open: true,
	onClose: noop,
	items: [
		{ id: "copy", label: "Copy permalink", shortcut: "⌘L", onSelect: noop },
		{ id: "threads", label: "View threads", shortcut: "↵", onSelect: noop },
	],
	liveRegionId: "live-1",
};

describe("AG5 — BlockActionsPopover renders through Menu (C1)", () => {
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

	it("renders exactly one role=menu container (no duplicate anatomy)", async () => {
		await act(async () => {
			root.render(createElement(BlockActionsPopover, BASE_PROPS) as ReactElement);
		});
		const menus = container.querySelectorAll("[role='menu']");
		expect(menus.length).toBe(1);
	});

	it("aria-live polite region still present after refactor (copy-feedback preserved)", async () => {
		await act(async () => {
			root.render(createElement(BlockActionsPopover, BASE_PROPS) as ReactElement);
		});
		const live = container.querySelector("[aria-live='polite']");
		expect(live).not.toBeNull();
	});

	it("items still render as role=menuitem through Menu", async () => {
		await act(async () => {
			root.render(createElement(BlockActionsPopover, BASE_PROPS) as ReactElement);
		});
		const items = container.querySelectorAll("[role='menuitem']");
		expect(items.length).toBe(2);
	});
});
