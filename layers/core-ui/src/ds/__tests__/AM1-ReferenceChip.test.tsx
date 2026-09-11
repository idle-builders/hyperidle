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

	// Draft mode with no `onOpen` renders the body as plain text, not a
	// dead focusable button — a caller with nothing to open (e.g. a
	// dependency-only reference list) must not ship a control that no-ops.
	it("draft mode with no onOpen: body is inert, not a focusable button", () => {
		const onRemove = vi.fn();
		render(<ReferenceChip kind="task" label="Some task" mode="draft" onRemove={onRemove} />);
		expect(screen.queryByRole("button", { name: /open/i })).toBeNull();
		expect(screen.getByText("Some task")).toBeDefined();
		// Remove still works — only the open half is affected by the missing handler.
		fireEvent.click(screen.getByLabelText(/remove/i));
		expect(onRemove).toHaveBeenCalledTimes(1);
	});

	// `disabled` freezes BOTH controls — real `disabled` attribute, not
	// merely an omitted handler (an omitted handler still leaves a focusable,
	// clickable-but-no-op control).
	it("disabled: both the open and remove buttons carry the real disabled attribute", () => {
		const onOpen = vi.fn();
		const onRemove = vi.fn();
		render(
			<ReferenceChip
				kind="task"
				label="Frozen task"
				mode="draft"
				onOpen={onOpen}
				onRemove={onRemove}
				disabled
			/>,
		);
		const openButton = screen.getByLabelText(/open/i);
		const removeButton = screen.getByLabelText(/remove/i);
		expect(openButton).toBeDisabled();
		expect(removeButton).toBeDisabled();
		fireEvent.click(openButton);
		fireEvent.click(removeButton);
		expect(onOpen).not.toHaveBeenCalled();
		expect(onRemove).not.toHaveBeenCalled();
	});

	// The accessible "remove" control found via its label IS the actual
	// remove button, not a wrapping element with no remove behaviour of its own.
	it("the remove control found by its accessible label is a real button", () => {
		render(<ReferenceChip kind="task" label="Task x" mode="draft" onRemove={() => undefined} />);
		const el = screen.getByLabelText("Remove Task x");
		expect(el.tagName).toBe("BUTTON");
	});
});
