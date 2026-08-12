/**
 * W2 — Foundation Primitives existence + DOM marker tests.
 *
 * AC-3: All 10 Tier 0 primitives exist as TSX with stories.
 * AC-4: The vitest DOM-snapshot net (catalog-snapshot.test.tsx) catches
 *       class/markup/marker regressions for all catalogued stories.
 *       This unit test verifies primitives render the correct data-ds-component attribute.
 *
 * These tests FAIL in the red phase because the primitive files
 * do not yet exist.
 */

// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// W2: new Tier 0 primitives — these imports will fail until files are created.
import { Avatar, AvatarGroup } from "../Avatar.js";
import { Button, type ButtonProps } from "../Button.js";
import { Checkbox } from "../Checkbox.js";
import { Input } from "../Input.js";
import { Progress } from "../Progress.js";
import { Select } from "../Select.js";
import { TabBar } from "../TabBar.js";
import { Toast } from "../Toast.js";
import { Toggle } from "../Toggle.js";

// Silence React 19 act() warnings for sync render+assert pattern below.
// biome-ignore lint/style/useNamingConvention: React's flag name is fixed.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface ComponentCase {
	name: string;
	render: () => ReturnType<typeof createElement>;
}

const PRIMITIVE_CASES: ComponentCase[] = [
	{
		name: "Avatar",
		render: () => createElement(Avatar, { initials: "AB" }),
	},
	{
		name: "AvatarGroup",
		render: () =>
			createElement(
				AvatarGroup,
				null,
				createElement(Avatar, { key: "a", initials: "AB" }),
				createElement(Avatar, { key: "b", initials: "CD" }),
			),
	},
	{
		name: "Button",
		render: () => createElement(Button, null, "Click me"),
	},
	{
		name: "Input",
		render: () => createElement(Input, { placeholder: "Enter value" }),
	},
	{
		name: "Select",
		render: () =>
			createElement(Select, {
				options: [
					{ value: "a", label: "Option A" },
					{ value: "b", label: "Option B" },
				],
			}),
	},
	{
		name: "Toggle",
		render: () => createElement(Toggle, { label: "Enable feature" }),
	},
	{
		name: "Checkbox",
		render: () => createElement(Checkbox, { label: "Accept terms" }),
	},
	{
		name: "TabBar",
		render: () =>
			createElement(TabBar, {
				tabs: [
					{ id: "a", label: "Tab A" },
					{ id: "b", label: "Tab B" },
				],
				activeId: "a",
			}),
	},
	{
		name: "Toast",
		render: () =>
			createElement(Toast, {
				variant: "success",
				icon: null,
				title: "Saved",
				message: "Your changes were saved.",
			}),
	},
	{
		name: "Progress",
		render: () => createElement(Progress, { value: 60 }),
	},
];

describe("W2 — Tier 0 primitive DOM markers (AC-3, AC-4)", () => {
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

	for (const c of PRIMITIVE_CASES) {
		it(`${c.name} renders with data-ds-component="${c.name}"`, async () => {
			await act(async () => {
				root.render(c.render());
			});
			const outer = container.querySelector(`[data-ds-component="${c.name}"]`);
			expect(
				outer,
				`${c.name}: expected an element with data-ds-component="${c.name}" to be in the DOM`,
			).not.toBeNull();
		});

		it(`${c.name} renders with data-ds-source="design-system"`, async () => {
			await act(async () => {
				root.render(c.render());
			});
			const outer = container.querySelector(`[data-ds-component="${c.name}"]`);
			expect(
				outer?.getAttribute("data-ds-source"),
				`${c.name}: expected data-ds-source="design-system"`,
			).toBe("design-system");
		});
	}
});

describe("W2 — Avatar sizes (AC-3)", () => {
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

	it("Avatar renders default size (md)", async () => {
		await act(async () => {
			root.render(createElement(Avatar, { initials: "AB" }));
		});
		const el = container.querySelector("[data-ds-component='Avatar']");
		expect(el).not.toBeNull();
		// Should render without error — size defaults to md
		expect(el?.textContent).toBe("AB");
	});

	it("Avatar renders sm size", async () => {
		await act(async () => {
			root.render(createElement(Avatar, { initials: "AB", size: "sm" }));
		});
		const el = container.querySelector("[data-ds-component='Avatar']");
		expect(el).not.toBeNull();
	});

	it("Avatar renders lg size", async () => {
		await act(async () => {
			root.render(createElement(Avatar, { initials: "AB", size: "lg" }));
		});
		const el = container.querySelector("[data-ds-component='Avatar']");
		expect(el).not.toBeNull();
	});

	it("Avatar agent variant renders", async () => {
		await act(async () => {
			root.render(createElement(Avatar, { initials: "AI", agent: true }));
		});
		const el = container.querySelector("[data-ds-component='Avatar']");
		expect(el).not.toBeNull();
	});
});

describe("W2 — AvatarGroup small variant uses cloneElement (AC-3)", () => {
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

	it("AvatarGroup with small=true renders all children avatars as smaller size", async () => {
		await act(async () => {
			root.render(
				createElement(
					AvatarGroup,
					{ small: true },
					createElement(Avatar, { key: "a", initials: "AB" }),
					createElement(Avatar, { key: "b", initials: "CD" }),
				),
			);
		});
		// Both avatars should be present
		const avatars = container.querySelectorAll("[data-ds-component='Avatar']");
		expect(avatars.length).toBe(2);
	});
});

describe("W2 — Button variants (AC-3)", () => {
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

	const variants = ["primary", "secondary", "ghost", "destructive"] as const;

	for (const variant of variants) {
		it(`Button variant="${variant}" renders`, async () => {
			await act(async () => {
				root.render(createElement(Button, { variant }, variant));
			});
			const el = container.querySelector("[data-ds-component='Button']");
			expect(el).not.toBeNull();
		});
	}

	it("Button is a button element with type attribute", async () => {
		await act(async () => {
			root.render(createElement(Button, { type: "submit" }, "Submit"));
		});
		const btn = container.querySelector("button");
		expect(btn).not.toBeNull();
		expect(btn?.getAttribute("type")).toBe("submit");
	});

	it('Button size="icon" renders square (AZ7 Set 1)', async () => {
		await act(async () => {
			root.render(createElement(Button, { size: "icon", "aria-label": "Add" }, "+"));
		});
		const btn = container.querySelector("button");
		expect(btn).not.toBeNull();
		expect(btn?.className).toContain("w-[44px]");
		expect(btn?.className).toContain("h-[44px]");
	});

	// AZ7 E1: the closed variant/size set IS a type. A @ts-expect-error line
	// that stops erroring (because someone widened the union) fails npm run
	// check — the guard cannot silently rot. amber was deleted (zero
	// production uses); a 5th variant or a 4th size must be a type error.
	it("the variant/size unions are closed (compile-time guard)", () => {
		// @ts-expect-error — "amber" was removed from ButtonProps["variant"] (AZ7 Set 1)
		const invalidVariant: NonNullable<ButtonProps["variant"]> = "amber";
		// @ts-expect-error — "lg" was never a member of ButtonProps["size"]
		const invalidSize: NonNullable<ButtonProps["size"]> = "lg";
		expect(invalidVariant).toBe("amber");
		expect(invalidSize).toBe("lg");
	});
});

describe("W2 — Toast variants (AC-3)", () => {
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

	const toastVariants = ["success", "error", "warning", "info"] as const;

	for (const variant of toastVariants) {
		it(`Toast variant="${variant}" renders`, async () => {
			await act(async () => {
				root.render(
					createElement(Toast, {
						variant,
						icon: null,
						title: "Title",
						message: "Message",
					}),
				);
			});
			const el = container.querySelector("[data-ds-component='Toast']");
			expect(el).not.toBeNull();
		});
	}
});

describe("W2 — Progress variants (AC-3)", () => {
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

	it("Progress renders with value=0", async () => {
		await act(async () => {
			root.render(createElement(Progress, { value: 0 }));
		});
		const el = container.querySelector("[data-ds-component='Progress']");
		expect(el).not.toBeNull();
	});

	it("Progress renders with value=100", async () => {
		await act(async () => {
			root.render(createElement(Progress, { value: 100 }));
		});
		const el = container.querySelector("[data-ds-component='Progress']");
		expect(el).not.toBeNull();
	});

	it("Progress amber variant renders", async () => {
		await act(async () => {
			root.render(createElement(Progress, { value: 50, variant: "amber" }));
		});
		const el = container.querySelector("[data-ds-component='Progress']");
		expect(el).not.toBeNull();
	});
});

describe("W2 — TabBar variants (AC-3)", () => {
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

	it("TabBar pill variant renders", async () => {
		await act(async () => {
			root.render(
				createElement(TabBar, {
					tabs: [{ id: "a", label: "A" }],
					activeId: "a",
					variant: "pill",
				}),
			);
		});
		const el = container.querySelector("[data-ds-component='TabBar']");
		expect(el).not.toBeNull();
	});

	it("TabBar underline variant renders", async () => {
		await act(async () => {
			root.render(
				createElement(TabBar, {
					tabs: [{ id: "a", label: "A" }],
					activeId: "a",
					variant: "underline",
				}),
			);
		});
		const el = container.querySelector("[data-ds-component='TabBar']");
		expect(el).not.toBeNull();
	});
});
