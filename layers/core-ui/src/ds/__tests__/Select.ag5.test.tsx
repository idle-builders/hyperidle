// @vitest-environment jsdom

/**
 * AG5 — Select extended API: size, placeholder, option disabled, className width forwarding.
 *
 * Red phase: all tests FAIL until Select.tsx is updated with:
 *   - size prop ("sm" | "md")
 *   - placeholder prop
 *   - options[].disabled
 *   - className forwarded to inner <select> (not wrapper div)
 */

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

describe("AG5 — Select: native element assertion (C2 by-construction)", () => {
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
		const sel = container.querySelector("select");
		expect(sel, "expected a native <select> in the DOM").not.toBeNull();
	});
});

describe("AG5 — Select: size prop", () => {
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

	it('size="md" renders without error (default)', async () => {
		await act(async () => {
			root.render(createElement(Select, { options: BASE_OPTIONS, size: "md" }));
		});
		const sel = container.querySelector("select");
		expect(sel).not.toBeNull();
	});

	it('size="sm" renders without error', async () => {
		await act(async () => {
			root.render(createElement(Select, { options: BASE_OPTIONS, size: "sm" }));
		});
		const sel = container.querySelector("select");
		expect(sel).not.toBeNull();
	});

	it('size="sm" and size="md" produce different class strings on the inner select', async () => {
		// Render sm
		await act(async () => {
			root.render(createElement(Select, { options: BASE_OPTIONS, size: "sm" }));
		});
		const smSel = container.querySelector("select");
		const smClass = smSel?.className ?? "";

		root.unmount();
		container.remove();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);

		// Render md
		await act(async () => {
			root.render(createElement(Select, { options: BASE_OPTIONS, size: "md" }));
		});
		const mdSel = container.querySelector("select");
		const mdClass = mdSel?.className ?? "";

		expect(smClass).not.toBe(mdClass);
	});
});

describe("AG5 — Select: placeholder prop", () => {
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

	it("renders a leading disabled option with value='' when placeholder is set", async () => {
		await act(async () => {
			root.render(
				createElement(Select, {
					options: BASE_OPTIONS,
					placeholder: "Choose one…",
				}),
			);
		});
		const options = container.querySelectorAll("option");
		// First option should be the placeholder
		const first = options[0];
		expect(first).not.toBeNull();
		expect(first?.getAttribute("value")).toBe("");
		expect(first?.getAttribute("disabled")).not.toBeNull();
		expect(first?.textContent).toBe("Choose one…");
	});

	it("does not render a placeholder option when placeholder is not set", async () => {
		await act(async () => {
			root.render(createElement(Select, { options: BASE_OPTIONS }));
		});
		const options = container.querySelectorAll('option[value=""]');
		expect(options.length).toBe(0);
	});
});

describe("AG5 — Select: options[].disabled", () => {
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

	it("renders a disabled option when options[].disabled is true", async () => {
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
		expect(disabledOptions.length).toBeGreaterThanOrEqual(1);
		expect(disabledOptions[0]?.getAttribute("value")).toBe("");
	});

	it("renders normal (non-disabled) options without disabled attribute", async () => {
		await act(async () => {
			root.render(createElement(Select, { options: BASE_OPTIONS }));
		});
		const disabledOptions = container.querySelectorAll("option[disabled]");
		expect(disabledOptions.length).toBe(0);
	});
});

describe("AG5 — Select: className forwarded to inner <select> (C3 width fix)", () => {
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

	it("className='w-[88px]' is present on the inner <select>, not just the wrapper", async () => {
		await act(async () => {
			root.render(
				createElement(Select, {
					options: BASE_OPTIONS,
					className: "w-[88px]",
				}),
			);
		});
		// The inner <select> must carry the caller className
		const sel = container.querySelector("select");
		expect(sel?.className).toContain("w-[88px]");
	});

	it("className='w-[88px]' is NOT present on the wrapper div", async () => {
		await act(async () => {
			root.render(
				createElement(Select, {
					options: BASE_OPTIONS,
					className: "w-[88px]",
				}),
			);
		});
		// The outer wrapper must NOT carry the caller className
		const wrapper = container.querySelector("[data-ds-component='Select']");
		expect(wrapper?.className).not.toContain("w-[88px]");
	});

	it("className='w-full' is present on the inner <select>", async () => {
		await act(async () => {
			root.render(
				createElement(Select, {
					options: BASE_OPTIONS,
					className: "w-full",
				}),
			);
		});
		const sel = container.querySelector("select");
		expect(sel?.className).toContain("w-full");
	});

	it("without className, the inner <select> still has a width class (default full-width)", async () => {
		await act(async () => {
			root.render(createElement(Select, { options: BASE_OPTIONS }));
		});
		const sel = container.querySelector("select");
		// base default is w-full when no caller className overrides width
		expect(sel?.className).toContain("w-full");
	});

	it("className='max-w-md' does NOT suppress the default w-full (WARNING-B regex fix)", async () => {
		// max-w-md contains 'w-' as a substring but is NOT a Tailwind width token.
		// The regex /\bw-/ incorrectly matched it; /(?:^|\s)w-/ must not.
		await act(async () => {
			root.render(
				createElement(Select, {
					options: BASE_OPTIONS,
					className: "max-w-md",
				}),
			);
		});
		const sel = container.querySelector("select");
		// Should still have w-full from the base class (caller only narrowed the max width)
		expect(sel?.className).toContain("w-full");
	});

	it("className='min-w-[100px]' does NOT suppress the default w-full (WARNING-B regex fix)", async () => {
		await act(async () => {
			root.render(
				createElement(Select, {
					options: BASE_OPTIONS,
					className: "min-w-[100px]",
				}),
			);
		});
		const sel = container.querySelector("select");
		expect(sel?.className).toContain("w-full");
	});

	it("className='w-[88px]' DOES suppress the default w-full (caller width token wins)", async () => {
		await act(async () => {
			root.render(
				createElement(Select, {
					options: BASE_OPTIONS,
					className: "w-[88px]",
				}),
			);
		});
		const sel = container.querySelector("select");
		// w-full must NOT be injected; only the caller's w-[88px] controls width
		expect(sel?.className).not.toMatch(/(?:^|\s)w-full/);
	});
});
