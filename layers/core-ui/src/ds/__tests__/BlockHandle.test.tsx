// @vitest-environment jsdom

/**
 * L2 AC-30, AC-46 — <BlockHandle /> coverage.
 */

import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BlockHandle } from "../BlockHandle.js";

// biome-ignore lint/style/useNamingConvention: React's flag name is fixed.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noop = (): void => {};

describe("<BlockHandle />", () => {
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

	const renderHandle = async (props: Record<string, unknown> = {}): Promise<void> => {
		await act(async () => {
			root.render(
				createElement(BlockHandle, {
					open: false,
					threadCount: 0,
					onOpen: noop,
					onClose: noop,
					onCopyPermalink: noop,
					ariaControls: "popover-1",
					...props,
				}) as ReactElement,
			);
		});
	};

	it("AC-30: carries data-ds-component='block-handle' (lowercase)", async () => {
		await renderHandle();
		const el = container.firstElementChild as HTMLElement;
		expect(el.getAttribute("data-ds-component")).toBe("block-handle");
	});

	it("AC-30: aria-expanded reflects open prop", async () => {
		await renderHandle({ open: false });
		expect((container.firstElementChild as HTMLElement).getAttribute("aria-expanded")).toBe(
			"false",
		);
		await renderHandle({ open: true });
		expect((container.firstElementChild as HTMLElement).getAttribute("aria-expanded")).toBe("true");
	});

	it("AC-30: aria-controls references the popover id", async () => {
		await renderHandle({ ariaControls: "blk-actions-42" });
		expect((container.firstElementChild as HTMLElement).getAttribute("aria-controls")).toBe(
			"blk-actions-42",
		);
	});

	it("AC-30: rendering includes a chevron-right SVG", async () => {
		await renderHandle();
		const svg = container.querySelector("svg");
		expect(svg).toBeTruthy();
	});

	it("AC-30: clicking the handle invokes onOpen when closed", async () => {
		let opened = 0;
		await renderHandle({ open: false, onOpen: () => opened++ });
		const btn = container.firstElementChild as HTMLButtonElement;
		await act(async () => {
			btn.click();
		});
		expect(opened).toBe(1);
	});

	it("AC-30: pressing Enter or Space opens the popover when closed", async () => {
		let opened = 0;
		await renderHandle({ open: false, onOpen: () => opened++ });
		const btn = container.firstElementChild as HTMLButtonElement;
		btn.focus();
		await act(async () => {
			btn.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		});
		await act(async () => {
			btn.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
		});
		expect(opened).toBeGreaterThan(0);
	});

	it("AC-30: thread-count chip renders when threadCount > 0", async () => {
		await renderHandle({ threadCount: 3 });
		expect(container.textContent ?? "").toContain("3");
	});

	it("AC-46: no J/K vim handlers", async () => {
		let opened = 0;
		await renderHandle({ open: false, onOpen: () => opened++ });
		const btn = container.firstElementChild as HTMLButtonElement;
		btn.focus();
		btn.dispatchEvent(new KeyboardEvent("keydown", { key: "j", bubbles: true }));
		btn.dispatchEvent(new KeyboardEvent("keydown", { key: "k", bubbles: true }));
		expect(opened).toBe(0);
	});

	it("AC-45: no draggable / aria-grabbed / cursor-grab markers", async () => {
		await renderHandle();
		const html = container.innerHTML;
		expect(html).not.toContain("aria-grabbed");
		expect(html).not.toContain('draggable="true"');
		expect(html).not.toMatch(/cursor:\s*grab/);
	});
});
