/**
 * ReferenceChip (promoted to the design system).
 *
 * ReferenceChip is the SINGLE shared attachment/reference primitive.
 *  - kinds {artifact, image, document, block} × modes {draft, posted}.
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

describe("ReferenceChip — single shared reference primitive", () => {
	it("renders the label as text", () => {
		render(<ReferenceChip kind="artifact" label="auth/passkey.ts" mode="posted" />);
		expect(screen.getByText("auth/passkey.ts")).toBeInTheDocument();
	});

	it("renders each of the four kinds' label without error", () => {
		for (const kind of ["artifact", "image", "document", "block"] as const) {
			const { unmount } = render(<ReferenceChip kind={kind} label={`l-${kind}`} mode="posted" />);
			expect(screen.getByText(`l-${kind}`)).toBeInTheDocument();
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
		expect(screen.getByText("+2 −1")).toBeInTheDocument();
	});

	it("renders a label containing markup as TEXT, not HTML", () => {
		render(<ReferenceChip kind="block" label="<img src=x onerror=1>" mode="posted" />);
		// No injected <img> — React escapes the label to text.
		expect(document.querySelector("img")).toBeNull();
		expect(screen.getByText("<img src=x onerror=1>")).toBeInTheDocument();
	});

	// Draft mode with no `onOpen` renders the body as plain text, not a
	// dead focusable button — a caller with nothing to open (e.g. a
	// dependency-only reference list) must not ship a control that no-ops.
	it("draft mode with no onOpen: body is inert, not a focusable button", () => {
		const onRemove = vi.fn();
		render(<ReferenceChip kind="task" label="Some task" mode="draft" onRemove={onRemove} />);
		expect(screen.queryByRole("button", { name: /open/i })).toBeNull();
		expect(screen.getByText("Some task")).toBeInTheDocument();
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

	// A draft chip that only lists a reference (e.g. a dependency chip with
	// nothing to detach) must not ship a remove control nobody wired.
	it("draft mode with no onRemove: renders no remove button", () => {
		render(<ReferenceChip kind="task" label="Read-only dep" mode="draft" />);
		expect(screen.queryByLabelText(/remove/i)).toBeNull();
		expect(screen.queryByRole("button", { name: /remove/i })).toBeNull();
	});

	// removeAriaLabel overrides the default `Remove ${label}` name — for a
	// caller whose label alone doesn't read as a sensible removal target.
	it("removeAriaLabel overrides the default accessible name on the remove button", () => {
		const onRemove = vi.fn();
		render(
			<ReferenceChip
				kind="task"
				label="Task x"
				mode="draft"
				onRemove={onRemove}
				removeAriaLabel="Detach Task x from this review"
			/>,
		);
		expect(screen.queryByLabelText("Remove Task x")).toBeNull();
		const button = screen.getByLabelText("Detach Task x from this review");
		fireEvent.click(button);
		expect(onRemove).toHaveBeenCalledTimes(1);
	});
});
