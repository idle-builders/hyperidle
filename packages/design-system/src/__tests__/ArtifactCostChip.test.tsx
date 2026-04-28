// @vitest-environment jsdom
// L3 RED — sub-primitive ArtifactCostChip.
// Protected: AC-7 — cost-cell-em-dash (renders `—`, never `$0.00`).
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ArtifactCostChip } from "../ArtifactCostChip.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("ArtifactCostChip", () => {
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

	it("renders em-dash when both money and tokens are null (protected)", () => {
		act(() => {
			root.render(
				createElement(ArtifactCostChip, { cost: { money: null, tokens: null } }),
			);
		});
		expect(container.textContent).toContain("—");
		expect(container.textContent).not.toContain("$0.00");
	});

	it("renders the money string in compact variant (no tokens)", () => {
		act(() => {
			root.render(
				createElement(ArtifactCostChip, {
					cost: { money: "$0.42", tokens: "12.4k" },
					variant: "compact",
				}),
			);
		});
		expect(container.textContent).toContain("$0.42");
		expect(container.textContent).not.toContain("12.4k");
	});

	it("renders both money and tokens in full variant", () => {
		act(() => {
			root.render(
				createElement(ArtifactCostChip, {
					cost: { money: "$0.42", tokens: "12.4k" },
					variant: "full",
				}),
			);
		});
		expect(container.textContent).toContain("$0.42");
		expect(container.textContent).toContain("12.4k");
	});

	it("renders em-dash for money even when tokens populated (cost-pending money)", () => {
		act(() => {
			root.render(
				createElement(ArtifactCostChip, {
					cost: { money: null, tokens: "248" },
				}),
			);
		});
		expect(container.textContent).toContain("—");
	});
});
