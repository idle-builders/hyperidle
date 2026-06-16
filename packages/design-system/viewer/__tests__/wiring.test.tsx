// @vitest-environment jsdom

/**
 * AJ7 — wiring.test.tsx (TDD red) — AC1 (the load-bearing wiring fix).
 *
 * main.tsx must pass the LIVE story-root element to AnnotationOverlay via a
 * callback-ref → state (not ref.current at mount, which is null). We assert this
 * behaviorally: TsxComponentView, given a callback ref, invokes it with the
 * non-null .demo-grid element after mount.
 */

import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { StoryModule } from "../discovery.js";
import { TsxComponentView } from "../main.js";

// biome-ignore lint/style/useNamingConvention: React's flag name is fixed.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

function Variant(): React.JSX.Element {
	return createElement("button", { className: "x", type: "button" }, "v");
}

const MODULE: StoryModule = {
	title: "Button",
	group: { kind: "tier", name: "Foundation" },
	uses: [],
	variants: [{ name: "Default", render: Variant }],
};

describe("AC1 — story root callback ref delivers the live element", () => {
	test("TsxComponentView invokes storyRootCb with the non-null .demo-grid after mount", async () => {
		let captured: HTMLDivElement | null = null;
		function Harness(): React.JSX.Element {
			const [, setNode] = useState<HTMLDivElement | null>(null);
			const cb = (node: HTMLDivElement | null): void => {
				if (node) captured = node;
				setNode(node);
			};
			return createElement(TsxComponentView, { module: MODULE, storyRootCb: cb });
		}
		await act(async () => {
			root.render(createElement(Harness));
		});
		expect(captured).not.toBeNull();
		expect((captured as unknown as HTMLElement).classList.contains("demo-grid")).toBe(true);
	});
});
