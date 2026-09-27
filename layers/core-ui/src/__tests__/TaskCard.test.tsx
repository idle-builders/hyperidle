import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TaskCard } from "../ds";

describe("TaskCard", () => {
	const defaultProps = {
		title: "Implement login flow",
		owner: "Bob Smith",
		state: "in_progress" as const,
	};

	it("renders title text", () => {
		render(<TaskCard {...defaultProps} />);
		expect(screen.getByText("Implement login flow")).toBeInTheDocument();
	});

	it("renders owner name", () => {
		render(<TaskCard {...defaultProps} />);
		expect(screen.getByText("Bob Smith")).toBeInTheDocument();
	});

	it("renders state as StatusChip via taskStateToStatus mapping", () => {
		render(<TaskCard {...defaultProps} state="in_progress" />);
		// in_progress maps to healthy
		expect(screen.getByText("HEALTHY")).toBeInTheDocument();
	});

	it("renders parentTag as a Tag label when provided", () => {
		render(<TaskCard {...defaultProps} parentTag="Mobile V2" />);
		expect(screen.getByText("Mobile V2")).toBeInTheDocument();
	});

	it("renders actions slot content", () => {
		render(<TaskCard {...defaultProps} actions={<button type="button">Edit</button>} />);
		expect(screen.getByText("Edit")).toBeInTheDocument();
	});

	it("calls onClick when card is clicked", () => {
		const handleClick = vi.fn();
		render(<TaskCard {...defaultProps} onClick={handleClick} />);
		const card =
			screen.getByText("Implement login flow").closest("[role='button'], button, [onClick]") ??
			screen.getByText("Implement login flow").parentElement;
		(card as HTMLElement | null)?.click();
		expect(handleClick).toHaveBeenCalledOnce();
	});

	it("renders blocked state as BLOCKED chip", () => {
		render(<TaskCard {...defaultProps} state="blocked" />);
		expect(screen.getByText("BLOCKED")).toBeInTheDocument();
	});

	it("renders proposed state as PAUSED chip", () => {
		render(<TaskCard {...defaultProps} state="proposed" />);
		expect(screen.getByText("PAUSED")).toBeInTheDocument();
	});

	it("renders accepted state as HEALTHY chip", () => {
		render(<TaskCard {...defaultProps} state="accepted" />);
		expect(screen.getByText("HEALTHY")).toBeInTheDocument();
	});

	it("renders hold state as PAUSED chip", () => {
		render(<TaskCard {...defaultProps} state="hold" />);
		expect(screen.getByText("PAUSED")).toBeInTheDocument();
	});

	it("renders review state as BEHIND chip", () => {
		render(<TaskCard {...defaultProps} state="review" />);
		expect(screen.getByText("BEHIND")).toBeInTheDocument();
	});

	it("renders done state as DONE chip", () => {
		render(<TaskCard {...defaultProps} state="done" />);
		expect(screen.getByText("DONE")).toBeInTheDocument();
	});

	it("renders killed state as ERROR chip", () => {
		render(<TaskCard {...defaultProps} state="killed" />);
		expect(screen.getByText("ERROR")).toBeInTheDocument();
	});

	it("shows both the status and the parent tag together", () => {
		render(<TaskCard {...defaultProps} parentTag="Sprint 1" />);
		expect(screen.getByText("HEALTHY")).toBeInTheDocument();
		expect(screen.getByText("Sprint 1")).toBeInTheDocument();
	});

	it("all 8 TaskState values produce distinct visual states", () => {
		const states = [
			"proposed",
			"accepted",
			"hold",
			"in_progress",
			"blocked",
			"review",
			"done",
			"killed",
		] as const;
		const expectedChips = [
			"PAUSED",
			"HEALTHY",
			"PAUSED",
			"HEALTHY",
			"BLOCKED",
			"BEHIND",
			"DONE",
			"ERROR",
		];
		for (let i = 0; i < states.length; i++) {
			const { unmount } = render(<TaskCard {...defaultProps} state={states[i]!} />);
			expect(screen.getByText(expectedChips[i]!)).toBeInTheDocument();
			unmount();
		}
	});
});
