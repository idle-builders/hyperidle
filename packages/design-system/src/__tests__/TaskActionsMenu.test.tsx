// @vitest-environment jsdom
/**
 * L15 — TaskActionsMenu unit tests.
 *
 * Source: docs/work-packages/L15-plan.md §4.3 + §12 row assertions (a-f).
 *
 * RED PHASE — `TaskActionsMenu` does not exist yet.
 */

import type { TaskState } from "@hyperidle/shared";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TaskActionsMenu } from "../TaskActionsMenu.js";

// biome-ignore lint/style/useNamingConvention: React's flag name is fixed.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface RenderArgs {
	state?: TaskState;
	pendingRequest?: { messageId: string; verb: string; createdAt: string } | null;
}

const noopHandlers = {
	onRequestStateChange: vi.fn(),
	onCancelPendingRequest: vi.fn(),
	onOpenThread: vi.fn(),
	onReplyInThread: vi.fn(),
	onSnooze24h: vi.fn(),
	onCopyLink: vi.fn(),
};

function renderMenu(
	root: Root,
	args: RenderArgs & {
		handlers?: Partial<typeof noopHandlers>;
	} = {},
): Promise<void> {
	return act(async () => {
		root.render(
			createElement(TaskActionsMenu, {
				task: {
					id: "task-1",
					title: "T",
					state: args.state ?? "in_progress",
					pendingRequest: args.pendingRequest ?? null,
				},
				...noopHandlers,
				...args.handlers,
				children: createElement("div", null, "card"),
				// biome-ignore lint/suspicious/noExplicitAny: prop shape lands in green phase
			} as any),
		);
	});
}

describe("TaskActionsMenu", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		for (const fn of Object.values(noopHandlers)) fn.mockReset();
	});
	afterEach(() => {
		root.unmount();
		container.remove();
	});

	function open(): HTMLElement {
		const trigger = container.querySelector(
			'[data-ds-component="TaskActionsMenu"] button',
		) as HTMLElement | null;
		if (!trigger) throw new Error("menu trigger not found");
		return trigger;
	}

	it("(a) renders state-conditional verbs: in_progress shows request_stop", async () => {
		await renderMenu(root, { state: "in_progress" });
		open().click();
		expect(container.textContent).toContain("Request stop");
	});

	it("(a) accepted state hides request_stop and shows hand_back", async () => {
		await renderMenu(root, { state: "accepted" });
		open().click();
		expect(container.textContent).toContain("Hand back to me");
		expect(container.textContent).not.toContain("Request stop");
	});

	it("(b) clicking a verb fires onRequestStateChange(verb)", async () => {
		const handler = vi.fn();
		await renderMenu(root, {
			state: "in_progress",
			handlers: { onRequestStateChange: handler },
		});
		await act(async () => {
			open().click();
		});
		// Find the menu item whose visible text is "Request stop".
		const items = Array.from(
			container.querySelectorAll('[role="menuitem"], button, li'),
		) as HTMLElement[];
		const stopItem = items.find((el) => /Request stop/.test(el.textContent ?? ""));
		expect(stopItem).toBeDefined();
		await act(async () => {
			stopItem?.click();
		});
		expect(handler).toHaveBeenCalledTimes(1);
		expect(handler.mock.calls[0][0]).toBe("request_stop");
	});

	it("(d) cancel_request item only appears when pendingRequest is set", async () => {
		await renderMenu(root, { state: "in_progress", pendingRequest: null });
		await act(async () => {
			open().click();
		});
		expect(container.textContent).not.toContain("Cancel pending request");

		// Re-render with pendingRequest set.
		await renderMenu(root, {
			state: "in_progress",
			pendingRequest: {
				messageId: "m1",
				verb: "request_stop",
				createdAt: "2026-04-19T12:00:00Z",
			},
		});
		await act(async () => {
			open().click();
		});
		expect(container.textContent).toContain("Cancel pending request");
	});

	it("(e) letter-shortcut keydown triggers the matching item (e.g. S → Request stop)", async () => {
		const handler = vi.fn();
		await renderMenu(root, {
			state: "in_progress",
			handlers: { onRequestStateChange: handler },
		});
		await act(async () => {
			open().click();
		});
		const menu = container.querySelector(
			'[data-ds-component="TaskActionsMenu"]',
		) as HTMLElement | null;
		expect(menu).not.toBeNull();
		await act(async () => {
			menu?.dispatchEvent(
				new KeyboardEvent("keydown", { key: "s", bubbles: true }),
			);
		});
		expect(handler).toHaveBeenCalled();
	});

	it("(f) Esc closes the menu", async () => {
		await renderMenu(root, { state: "in_progress" });
		await act(async () => {
			open().click();
		});
		expect(container.textContent).toContain("Request stop");
		const menu = container.querySelector(
			'[data-ds-component="TaskActionsMenu"]',
		) as HTMLElement | null;
		await act(async () => {
			menu?.dispatchEvent(
				new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
			);
		});
		// After Esc, "Request stop" should not be visible (menu closed).
		expect(container.textContent).not.toContain("Request stop");
	});
});
