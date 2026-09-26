// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Select } from "../Select.js";

// biome-ignore lint/style/useNamingConvention: React's flag name is fixed.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BASE_OPTIONS = [
	{ value: "a", label: "Option A" },
	{ value: "b", label: "Option B" },
];

describe("Select", () => {
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

	it("renders a native <select> element (keyboard parity by construction)", async () => {
		await act(async () => {
			root.render(createElement(Select, { options: BASE_OPTIONS }));
		});
		expect(container.querySelector("select")).not.toBeNull();
	});

	it("renders a leading disabled option with value='' only when placeholder is set", async () => {
		await act(async () => {
			root.render(createElement(Select, { options: BASE_OPTIONS, placeholder: "Choose one…" }));
		});
		const first = container.querySelectorAll("option")[0];
		expect(first?.getAttribute("value")).toBe("");
		expect(first?.getAttribute("disabled")).not.toBeNull();
		expect(first?.textContent).toBe("Choose one…");

		root.unmount();
		container.remove();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);

		await act(async () => {
			root.render(createElement(Select, { options: BASE_OPTIONS }));
		});
		expect(container.querySelectorAll('option[value=""]').length).toBe(0);
	});

	it("renders options[].disabled as a real disabled <option>", async () => {
		await act(async () => {
			root.render(
				createElement(Select, {
					options: [
						{ value: "", label: "-- no team --", disabled: true },
						{ value: "a", label: "Team A" },
					],
				}),
			);
		});
		const disabledOptions = container.querySelectorAll("option[disabled]");
		expect(disabledOptions.length).toBe(1);
		expect(disabledOptions[0]?.getAttribute("value")).toBe("");
	});
});
