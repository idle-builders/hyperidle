// @vitest-environment jsdom
// L3 RED — sub-primitive ArtifactKindBadge.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ArtifactKindBadge } from "../ArtifactKindBadge.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("ArtifactKindBadge", () => {
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

	it("renders the kind label uppercased for 'code_diff'", () => {
		act(() => {
			root.render(createElement(ArtifactKindBadge, { kind: "code_diff" }));
		});
		expect(container.textContent).toContain("CODE DIFF");
	});

	it("renders 'DECK' for kind: 'deck'", () => {
		act(() => {
			root.render(createElement(ArtifactKindBadge, { kind: "deck" }));
		});
		expect(container.textContent).toContain("DECK");
	});

	it("renders the catch-all label for unknown_kind (uppercased kind id, never empty)", () => {
		act(() => {
			root.render(createElement(ArtifactKindBadge, { kind: "unknown_kind" }));
		});
		const text = container.textContent ?? "";
		expect(text.length).toBeGreaterThan(0);
		expect(text).toContain("UNKNOWN");
	});
});
