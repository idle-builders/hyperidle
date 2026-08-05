// @vitest-environment jsdom
// L3 RED — sub-primitive ArtifactTimestamp.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ArtifactTimestamp } from "../ArtifactTimestamp.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("ArtifactTimestamp", () => {
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

	it("renders a non-empty string in default (relative) format", () => {
		act(() => {
			root.render(createElement(ArtifactTimestamp, { value: "2026-04-28T00:00:00.000Z" }));
		});
		const text = container.textContent ?? "";
		expect(text.length).toBeGreaterThan(0);
	});

	it("renders an absolute calendar date (MMM D, YYYY) when format='absolute'", () => {
		act(() => {
			root.render(
				createElement(ArtifactTimestamp, {
					value: "2026-04-28T00:00:00.000Z",
					format: "absolute",
				}),
			);
		});
		expect(container.textContent ?? "").toMatch(/2026/);
	});
});
