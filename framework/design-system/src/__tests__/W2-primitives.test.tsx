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

	// AZ7 N12 (review round 1): this only proves Button.tsx's own className
	// composition still emits the right utility TOKENS — a source-level
	// regression guard (e.g. someone deleting `w-[44px]` from Button.tsx).
	// jsdom has no layout engine and never loads the real Tailwind-built
	// stylesheet, so a passing className-contains check here says nothing
	// about whether Tailwind actually GENERATED those utilities into the
	// served CSS — that is exactly how B1 (conversation Send button
	// rendering as a 17px sliver because `layers/core-ui/src/index.css`'s
	// `@source` glob pointed at a non-existent directory) shipped invisibly:
	// this test was green the entire time. The real geometry proof —
	// `getBoundingClientRect()`/`getComputedStyle()` against the actual
	// rendered app — is `__e2e__/AZ7-icon-button-geometry.spec.ts`.
	it('Button size="icon" composes the closed-set size classes (source-level guard; see AZ7-icon-button-geometry.spec.ts for the real geometry proof)', async () => {
		await act(async () => {
			root.render(createElement(Button, { size: "icon", "aria-label": "Add" }, "+"));
		});
		const btn = container.querySelector("button");
		expect(btn).not.toBeNull();
		expect(btn?.className).toContain("w-[44px]");
		expect(btn?.className).toContain("h-[44px]");
	});

	// AZ7 E1 (review round 1, B5): the previous guard only caught the ONE
	// removed literal string ("amber") being re-added. It proved nothing about
	// the set staying closed to a genuinely NEW member: adding "warning" to
	// both the ButtonProps["variant"] union AND VARIANT_CLASSES (a real,
	// self-consistent 5th variant) left `@ts-expect-error — "amber"…` with
	// nothing to catch, and `npm run check` stayed green — DESIGN.md's claim
	// that "adding a value outside a set is a type error" was false for
	// exactly the case that matters (a real addition, not a resurrected
	// deletion). Fixed with a set-EQUALITY check: `VariantSetIsExact` requires
	// ActualButtonVariant and EXPECTED_BUTTON_VARIANTS to contain exactly the
	// same members in both directions (Equal<A,B> = A extends B ? B extends A
	// ? true : false : false, the standard bidirectional-`extends` trick for
	// union equality). ANY change to the union — add, remove, rename — makes
	// `_buttonVariantSetIsExact`'s literal type stop being `true`, which fails
	// to satisfy `: true` and fails `npm run check`. Same construction for
	// size. Live-verified (see review evidence): adding "warning" to both the
	// union and VARIANT_CLASSES makes this fail with 2 errors; reverting is
	// green again.
	type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

	const EXPECTED_BUTTON_VARIANTS = ["primary", "secondary", "ghost", "destructive"] as const;
	type ActualButtonVariant = NonNullable<ButtonProps["variant"]>;
	type ExpectedButtonVariant = (typeof EXPECTED_BUTTON_VARIANTS)[number];
	// If this line errors, ButtonProps["variant"] no longer matches Set 1
	// (framework/design-system/DESIGN.md § Closed Sets) — update whichever
	// side is now wrong, not just this list.
	const _buttonVariantSetIsExact: Equal<ActualButtonVariant, ExpectedButtonVariant> = true;

	const EXPECTED_BUTTON_SIZES = ["default", "sm", "icon"] as const;
	type ActualButtonSize = NonNullable<ButtonProps["size"]>;
	type ExpectedButtonSize = (typeof EXPECTED_BUTTON_SIZES)[number];
	const _buttonSizeSetIsExact: Equal<ActualButtonSize, ExpectedButtonSize> = true;

	it("the variant/size unions are closed (compile-time set-equality guard)", () => {
		expect(EXPECTED_BUTTON_VARIANTS).toContain("primary");
		expect(EXPECTED_BUTTON_SIZES).toContain("icon");
		expect(_buttonVariantSetIsExact).toBe(true);
		expect(_buttonSizeSetIsExact).toBe(true);
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
