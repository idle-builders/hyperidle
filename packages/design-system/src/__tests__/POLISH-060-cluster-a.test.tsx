// @vitest-environment jsdom
/**
 * POLISH-060 Cluster A — design-system foundation tests.
 *
 * A1: Empty/error/loading states in contained ItemList must NOT render
 *     the surface-container grey background — only real row children get the container.
 * A2: variant="flush" works and drops surface-container (already exists; coverage test).
 * A3: Button and Input keep min-h-[44px] class at touch viewports and expose
 *     lg:min-h-[36px] for desktop relaxation.
 * A4: Sidebar mount wrappers in AppShell carry h-full overflow-hidden.
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Button } from "../Button.js";
import { Input } from "../Input.js";
import { ItemList } from "../ItemList.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function FakeRow({ label }: { label: string }) {
	return createElement("div", { "data-testid": "fake-row" }, label);
}

// ── A1: De-grey empty/error/loading states ───────────────────────────────────

describe("ItemList empty/error/loading states must not carry surface-container bg", () => {
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

	it("contained ItemList with isEmpty=true does NOT have surface-container on the outer wrapper", () => {
		act(() => {
			root.render(
				createElement(ItemList, {
					isEmpty: true,
					variant: "contained",
					empty: {
						title: "No items",
						description: "Nothing here yet.",
					},
				}),
			);
		});

		// The outermost element must NOT carry the bg-[var(--surface-container)] class
		// when rendering an empty state — it should be transparent (page surface).
		const outer = container.firstElementChild as HTMLElement;
		expect(outer?.className ?? "").not.toContain("surface-container");
	});

	it("contained ItemList with error does NOT have surface-container on the outer wrapper", () => {
		act(() => {
			root.render(
				createElement(ItemList, {
					isEmpty: false,
					variant: "contained",
					error: { description: "Something went wrong" },
				}),
			);
		});

		const outer = container.firstElementChild as HTMLElement;
		expect(outer?.className ?? "").not.toContain("surface-container");
	});

	it("contained ItemList with loading=true does NOT have surface-container on the outer wrapper", () => {
		act(() => {
			root.render(
				createElement(ItemList, {
					isEmpty: false,
					variant: "contained",
					loading: true,
					loadingLabel: "Loading",
				}),
			);
		});

		const outer = container.firstElementChild as HTMLElement;
		expect(outer?.className ?? "").not.toContain("surface-container");
	});

	it("contained ItemList with real children STILL has surface-container on the outer wrapper", () => {
		act(() => {
			root.render(
				createElement(
					ItemList,
					{ isEmpty: false, variant: "contained" },
					createElement(FakeRow, { label: "Row A" }),
				),
			);
		});

		const outer = container.firstElementChild as HTMLElement;
		expect(outer?.className ?? "").toContain("surface-container");
	});
});

// ── A2: flush variant coverage ───────────────────────────────────────────────

describe("variant=flush drops surface-container background", () => {
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

	it("flush variant with real rows has no surface-container class", () => {
		act(() => {
			root.render(
				createElement(
					ItemList,
					{ isEmpty: false, variant: "flush" },
					createElement(FakeRow, { label: "Row" }),
				),
			);
		});

		const outer = container.firstElementChild as HTMLElement;
		expect(outer?.className ?? "").not.toContain("surface-container");
	});

	it("flush variant with empty state has no surface-container class", () => {
		act(() => {
			root.render(
				createElement(ItemList, {
					isEmpty: true,
					variant: "flush",
					empty: { title: "Empty", description: "Nothing" },
				}),
			);
		});

		const outer = container.firstElementChild as HTMLElement;
		expect(outer?.className ?? "").not.toContain("surface-container");
	});
});

// ── A3: Button and Input responsive touch target ─────────────────────────────

describe("Button keeps 44px touch target; relaxes min-height at desktop breakpoint", () => {
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

	it("Button default size carries min-h-[44px] (AQ-015 touch floor)", () => {
		act(() => {
			root.render(createElement(Button, { size: "default" }, "Click me"));
		});

		const btn = container.querySelector("button") as HTMLButtonElement | null;
		expect(btn).not.toBeNull();
		// Must keep the 44px touch-target floor class
		expect(btn?.className ?? "").toContain("min-h-[44px]");
	});

	it("Button default size carries lg:min-h-[36px] for desktop relaxation", () => {
		act(() => {
			root.render(createElement(Button, { size: "default" }, "Click me"));
		});

		const btn = container.querySelector("button") as HTMLButtonElement | null;
		expect(btn?.className ?? "").toContain("lg:min-h-[36px]");
	});

	it("Button sm size carries min-h-[44px] (touch floor applies to sm too)", () => {
		act(() => {
			root.render(createElement(Button, { size: "sm" }, "Small"));
		});

		const btn = container.querySelector("button") as HTMLButtonElement | null;
		expect(btn?.className ?? "").toContain("min-h-[44px]");
	});

	it("Button sm size carries lg:min-h-[32px] for desktop relaxation", () => {
		act(() => {
			root.render(createElement(Button, { size: "sm" }, "Small"));
		});

		const btn = container.querySelector("button") as HTMLButtonElement | null;
		expect(btn?.className ?? "").toContain("lg:min-h-[32px]");
	});
});

describe("Input keeps touch target; relaxed min-height at desktop", () => {
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

	it("Input carries min-h-[44px] (AQ-015 touch floor)", () => {
		act(() => {
			root.render(createElement(Input, { placeholder: "Type here" }));
		});

		const input = container.querySelector("input") as HTMLInputElement | null;
		expect(input).not.toBeNull();
		expect(input?.className ?? "").toContain("min-h-[44px]");
	});

	it("Input carries lg:min-h-[36px] for desktop relaxation", () => {
		act(() => {
			root.render(createElement(Input, { placeholder: "Type here" }));
		});

		const input = container.querySelector("input") as HTMLInputElement | null;
		expect(input?.className ?? "").toContain("lg:min-h-[36px]");
	});
});
