/**
 * J5 — PitchSelector inline detail pane.
 *
 * AC: clicking a pitch expands an inline detail pane showing
 * problem / appetite / solution / rabbit holes. "Add to canvas"
 * action ONLY in the detail pane (not on the card).
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { PitchSelectorPitch } from "../shell/PitchSelector";
import { PitchSelector } from "../shell/PitchSelector";

const pitchWithDetail: PitchSelectorPitch = {
	id: "pitch-1",
	title: "Mobile App V2",
	hypothesis: "Users want mobile access",
	proposer: "Alice",
	status: "shaped",
	appetite: "6 weeks",
	problem: "Users drop off on desktop-only sign up.",
	solution: "Responsive layout with a mobile-first flow.",
	rabbitHoles: "Do not build a native app.",
};

const pitchNoDetail: PitchSelectorPitch = {
	id: "pitch-2",
	title: "CLI Tool",
	hypothesis: "Developers prefer terminals",
	proposer: "Bob",
	status: "shaped",
	appetite: "2 weeks",
};

describe("PitchSelector — inline detail pane (J5)", () => {
	it("does not show the detail pane before a pitch is selected", () => {
		render(
			<PitchSelector
				pitches={[pitchWithDetail]}
				selectedIds={[]}
				onSelect={vi.fn()}
				onClose={vi.fn()}
			/>,
		);
		expect(screen.queryByTestId("pitch-detail-pane")).not.toBeInTheDocument();
	});

	it("shows detail pane with problem/appetite/solution/rabbit-holes after click", async () => {
		const user = userEvent.setup();
		render(
			<PitchSelector
				pitches={[pitchWithDetail]}
				selectedIds={[]}
				onSelect={vi.fn()}
				onClose={vi.fn()}
			/>,
		);

		await user.click(screen.getByText("Mobile App V2"));

		const pane = screen.getByTestId("pitch-detail-pane");
		expect(pane).toBeInTheDocument();
		expect(pane.textContent).toMatch(/problem/i);
		expect(pane.textContent).toContain("Users drop off on desktop-only sign up.");
		expect(pane.textContent).toMatch(/appetite/i);
		expect(pane.textContent).toContain("6 weeks");
		expect(pane.textContent).toMatch(/solution/i);
		expect(pane.textContent).toContain("Responsive layout with a mobile-first flow.");
		expect(pane.textContent).toMatch(/rabbit holes?/i);
		expect(pane.textContent).toContain("Do not build a native app.");
	});

	it("'Add to canvas' action appears ONLY inside the detail pane", async () => {
		const user = userEvent.setup();
		render(
			<PitchSelector
				pitches={[pitchWithDetail]}
				selectedIds={[]}
				onSelect={vi.fn()}
				onClose={vi.fn()}
			/>,
		);
		// Before expanding: no Add to canvas button anywhere
		expect(screen.queryByRole("button", { name: /add to canvas/i })).not.toBeInTheDocument();

		await user.click(screen.getByText("Mobile App V2"));

		const pane = screen.getByTestId("pitch-detail-pane");
		const addButton = screen.getByRole("button", { name: /add to canvas/i });
		expect(pane).toContainElement(addButton);
	});

	it("invokes onAddToCanvas with the selected pitch id when Add clicked", async () => {
		const user = userEvent.setup();
		const onAddToCanvas = vi.fn();
		render(
			<PitchSelector
				pitches={[pitchWithDetail]}
				selectedIds={[]}
				onSelect={vi.fn()}
				onAddToCanvas={onAddToCanvas}
				onClose={vi.fn()}
			/>,
		);
		await user.click(screen.getByText("Mobile App V2"));
		await user.click(screen.getByRole("button", { name: /add to canvas/i }));
		expect(onAddToCanvas).toHaveBeenCalledWith("pitch-1");
	});

	it("falls back gracefully when optional detail fields are missing", async () => {
		const user = userEvent.setup();
		render(
			<PitchSelector
				pitches={[pitchNoDetail]}
				selectedIds={[]}
				onSelect={vi.fn()}
				onClose={vi.fn()}
			/>,
		);
		await user.click(screen.getByText("CLI Tool"));
		// Detail pane still renders with section labels and an em-dash for missing.
		const pane = screen.getByTestId("pitch-detail-pane");
		expect(pane).toBeInTheDocument();
		expect(pane.textContent).toMatch(/problem/i);
		expect(pane.textContent).toMatch(/solution/i);
		expect(pane.textContent).toMatch(/rabbit holes?/i);
	});
});
