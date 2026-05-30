import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { PitchSelectorPitch } from "../shell/PitchSelector";
import { PitchSelector } from "../shell/PitchSelector";

const samplePitches: PitchSelectorPitch[] = [
	{
		id: "pitch-1",
		title: "Mobile App V2",
		hypothesis: "Users want mobile access",
		proposer: "Alice",
		status: "draft",
		appetite: "6 weeks",
	},
	{
		id: "pitch-2",
		title: "Analytics Dashboard",
		hypothesis: "Data drives decisions",
		proposer: "Bob",
		status: "draft",
		appetite: "4 weeks",
	},
	{
		id: "pitch-3",
		title: "CLI Tool",
		hypothesis: "Developers prefer terminals",
		proposer: "Charlie",
		status: "draft",
		appetite: "2 weeks",
	},
];

describe("PitchSelector", () => {
	it("renders SearchField and pitch list", () => {
		render(
			<PitchSelector
				pitches={samplePitches}
				selectedIds={[]}
				onSelect={vi.fn()}
				onClose={vi.fn()}
			/>,
		);
		expect(screen.getByPlaceholderText("Search pitches…")).toBeInTheDocument();
		expect(screen.getByText("Mobile App V2")).toBeInTheDocument();
		expect(screen.getByText("Analytics Dashboard")).toBeInTheDocument();
		expect(screen.getByText("CLI Tool")).toBeInTheDocument();
	});

	it("filters pitches based on search input", async () => {
		const user = userEvent.setup();
		render(
			<PitchSelector
				pitches={samplePitches}
				selectedIds={[]}
				onSelect={vi.fn()}
				onClose={vi.fn()}
			/>,
		);
		const input = screen.getByPlaceholderText("Search pitches…");
		await user.type(input, "Mobile");
		expect(screen.getByText("Mobile App V2")).toBeInTheDocument();
		expect(screen.queryByText("Analytics Dashboard")).not.toBeInTheDocument();
		expect(screen.queryByText("CLI Tool")).not.toBeInTheDocument();
	});

	it("shows checkmark on selected pitches", () => {
		render(
			<PitchSelector
				pitches={samplePitches}
				selectedIds={["pitch-1"]}
				onSelect={vi.fn()}
				onClose={vi.fn()}
			/>,
		);
		const checkmarks = screen.getAllByText("✓");
		expect(checkmarks).toHaveLength(1);
	});

	it("calls onSelect when a pitch is clicked", async () => {
		const user = userEvent.setup();
		const onSelect = vi.fn();
		render(
			<PitchSelector
				pitches={samplePitches}
				selectedIds={[]}
				onSelect={onSelect}
				onClose={vi.fn()}
			/>,
		);
		await user.click(screen.getByText("Mobile App V2"));
		expect(onSelect).toHaveBeenCalledWith("pitch-1");
	});

	it("renders empty state when no pitches", () => {
		render(<PitchSelector pitches={[]} selectedIds={[]} onSelect={vi.fn()} onClose={vi.fn()} />);
		expect(screen.getByText("No pitches available")).toBeInTheDocument();
	});

	it("renders empty state when search matches nothing", async () => {
		const user = userEvent.setup();
		render(
			<PitchSelector
				pitches={samplePitches}
				selectedIds={[]}
				onSelect={vi.fn()}
				onClose={vi.fn()}
			/>,
		);
		const input = screen.getByPlaceholderText("Search pitches…");
		await user.type(input, "zzzznonexistent");
		expect(screen.getByText("No pitches available")).toBeInTheDocument();
	});

	it("calls onClose when close button is clicked", async () => {
		const user = userEvent.setup();
		const onClose = vi.fn();
		render(
			<PitchSelector
				pitches={samplePitches}
				selectedIds={[]}
				onSelect={vi.fn()}
				onClose={onClose}
			/>,
		);
		await user.click(screen.getByLabelText("Close pitch selector"));
		expect(onClose).toHaveBeenCalledOnce();
	});
});
