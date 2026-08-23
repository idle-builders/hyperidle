/**
 * AM1 — ReferenceChip (promoted to the design system). RED phase.
 *
 * AC6: ReferenceChip is the SINGLE shared attachment/reference primitive.
 *  - kinds {artifact, image, knowledge, block} × modes {draft, posted}.
 *  - draft mode = TWO distinct hit targets: open body + remove ✕.
 *  - posted mode = whole chip opens; NO remove ✕.
 *  - label/meta render as text content (React-escaped) — never HTML (§8).
 *
 * RED until `framework/design-system/src/ReferenceChip.tsx` exists and is
 * exported from the barrel (green-phase task 3).
 */

// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReferenceChip } from "../ReferenceChip.js";

describe("AM1 ReferenceChip — single shared reference primitive (AC6)", () => {
	it("renders the label as text", () => {
		render(<ReferenceChip kind="artifact" label="auth/passkey.ts" mode="posted" />);
		expect(screen.getByText("auth/passkey.ts")).toBeDefined();
	});

	it("carries data-ds-component=ReferenceChip + kind + mode markers", () => {
		render(<ReferenceChip kind="block" label="Auth plan" mode="posted" />);
		const el = document.querySelector('[data-ds-component="ReferenceChip"]');
		expect(el).not.toBeNull();
		expect(el?.getAttribute("data-ds-kind")).toBe("block");
		expect(el?.getAttribute("data-ds-mode")).toBe("posted");
	});

	it("renders each of the four kinds", () => {
		for (const kind of ["artifact", "image", "knowledge", "block"] as const) {
			const { unmount } = render(<ReferenceChip kind={kind} label={`l-${kind}`} mode="posted" />);
			expect(document.querySelector(`[data-ds-kind="${kind}"]`)).not.toBeNull();
			unmount();
		}
	});

	it("posted mode: whole chip = open; NO remove control", () => {
		const onOpen = vi.fn();
		const onRemove = vi.fn();
		render(
			<ReferenceChip
				kind="artifact"
				label="x.ts"
				mode="posted"
				onOpen={onOpen}
				onRemove={onRemove}
			/>,
		);
		// No remove affordance in posted mode.
		expect(screen.queryByLabelText(/remove/i)).toBeNull();
		// Whole chip opens.
		fireEvent.click(screen.getByText("x.ts"));
		expect(onOpen).toHaveBeenCalledTimes(1);
		expect(onRemove).not.toHaveBeenCalled();
	});

	it("draft mode: TWO distinct hit targets — open body + remove ✕", () => {
		const onOpen = vi.fn();
		const onRemove = vi.fn();
		render(
			<ReferenceChip
				kind="image"
				label="auth-flow.png"
				mode="draft"
				onOpen={onOpen}
				onRemove={onRemove}
			/>,
		);
		const remove = screen.getByLabelText(/remove/i);
		fireEvent.click(remove);
		expect(onRemove).toHaveBeenCalledTimes(1);
		expect(onOpen).not.toHaveBeenCalled();

		fireEvent.click(screen.getByText("auth-flow.png"));
		expect(onOpen).toHaveBeenCalledTimes(1);
	});

	it("renders optional meta as text alongside the label", () => {
		render(<ReferenceChip kind="artifact" label="auth/passkey.ts" meta="+2 −1" mode="posted" />);
		expect(screen.getByText("+2 −1")).toBeDefined();
	});

	it("renders a label containing markup as TEXT, not HTML (§8 injection guard)", () => {
		render(<ReferenceChip kind="block" label="<img src=x onerror=1>" mode="posted" />);
		// No injected <img> — React escapes the label to text.
		expect(document.querySelector("img")).toBeNull();
		expect(screen.getByText("<img src=x onerror=1>")).toBeDefined();
	});
});
