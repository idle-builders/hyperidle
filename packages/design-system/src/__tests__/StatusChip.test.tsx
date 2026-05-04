// @vitest-environment jsdom
/**
 * L15 — StatusChip `request_pending` variant unit test.
 *
 * Source: docs/work-packages/L15-plan.md §4.5 + §12 row.
 *
 * RED PHASE — `request_pending` is not yet a member of the Status union.
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StatusChip } from "../StatusChip.js";

// biome-ignore lint/style/useNamingConvention: React's flag name is fixed.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("StatusChip — request_pending", () => {
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

	it("renders the ↪ PENDING label for status='request_pending'", async () => {
		await act(async () => {
			// biome-ignore lint/suspicious/noExplicitAny: status union widened in green phase
			root.render(createElement(StatusChip, { status: "request_pending" as any }));
		});
		const chip = container.querySelector('[data-ds-component="StatusChip"]');
		expect(chip).not.toBeNull();
		expect(chip?.textContent ?? "").toMatch(/↪\s*PENDING/);
	});

	it("uses dashed border styling characteristic of the pending variant", async () => {
		await act(async () => {
			// biome-ignore lint/suspicious/noExplicitAny: status union widened in green phase
			root.render(createElement(StatusChip, { status: "request_pending" as any }));
		});
		const chip = container.querySelector(
			'[data-ds-component="StatusChip"]',
		) as HTMLElement | null;
		expect(chip).not.toBeNull();
		// Class string must reference dashed border or the surface-ghost token.
		const cls = chip?.className ?? "";
		expect(cls.includes("dashed") || cls.includes("--surface-ghost")).toBe(true);
	});
});
