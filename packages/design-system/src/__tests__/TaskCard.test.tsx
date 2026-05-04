// @vitest-environment jsdom
/**
 * L15 — TaskCard pendingRequest slot + onActivate handler.
 *
 * Source: docs/work-packages/L15-plan.md §4.4 + §12 row.
 *
 * RED PHASE — neither prop exists on TaskCard yet.
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TaskCard } from "../TaskCard.js";

// biome-ignore lint/style/useNamingConvention: React's flag name is fixed.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PENDING = {
	messageId: "m-1",
	verb: "request_stop" as const,
	createdAt: "2026-04-19T12:00:00Z",
};

describe("TaskCard — pendingRequest + onActivate", () => {
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

	it("(a) when pendingRequest is set, the cost slot is replaced by a request_pending StatusChip", async () => {
		await act(async () => {
			root.render(
				createElement(TaskCard, {
					title: "T",
					owner: "Owner",
					state: "in_progress",
					cost: "$1.00",
					// biome-ignore lint/suspicious/noExplicitAny: green phase widens props
					pendingRequest: PENDING as any,
				}),
			);
		});
		// Cost label should NOT appear when pending is set (replaced).
		expect(container.textContent).not.toContain("$1.00");
		// A StatusChip with the request_pending data-status should be present.
		const chip = container.querySelector(
			'[data-ds-component="StatusChip"][data-status="request_pending"]',
		);
		expect(chip).not.toBeNull();
	});

	it("(c) onActivate fires when the card body is clicked", async () => {
		const onActivate = vi.fn();
		await act(async () => {
			root.render(
				createElement(TaskCard, {
					title: "T",
					owner: "Owner",
					state: "in_progress",
					// biome-ignore lint/suspicious/noExplicitAny: green phase widens props
					onActivate: onActivate as any,
				}),
			);
		});
		const card = container.querySelector(
			'[data-ds-component="TaskCard"]',
		) as HTMLElement | null;
		expect(card).not.toBeNull();
		await act(async () => {
			card?.click();
		});
		expect(onActivate).toHaveBeenCalledTimes(1);
	});
});
