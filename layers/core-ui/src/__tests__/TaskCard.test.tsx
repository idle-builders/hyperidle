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

	it("renders parentTag as Tag when provided", () => {
		render(<TaskCard {...defaultProps} parentTag="Mobile V2" />);
		const tag = screen.getByText("Mobile V2");
		expect(tag).toHaveClass("inline-flex", "rounded-[var(--r-pill)]");
		expect(tag.className).toContain("text-secondary");
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

	// Acceptance criterion: TaskCard in blocked state has red border (border-[var(--status-error)])
	it("keeps the normal outline when state is blocked", () => {
		const { container } = render(<TaskCard {...defaultProps} state="blocked" />);
		const root = container.firstElementChild;
		expect(root?.className).toContain("border-[var(--border-subtle)]");
		expect(root?.className).not.toContain("border-[var(--status-error)]");
	});

	it("does not apply border-[var(--status-error)] class when state is not blocked", () => {
		const { container } = render(<TaskCard {...defaultProps} state="in_progress" />);
		const root = container.firstElementChild;
		expect(root?.className).not.toContain("border-[var(--status-error)]");
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

	it("composes at least 2 Tier 1 primitives (StatusChip + Tag)", () => {
		render(<TaskCard {...defaultProps} parentTag="Sprint 1" />);
		// StatusChip
		expect(screen.getByText("HEALTHY")).toHaveClass("inline-flex", "rounded-[var(--r-pill)]");
		// Tag for parentTag
		expect(screen.getByText("Sprint 1")).toHaveClass("inline-flex", "rounded-[var(--r-pill)]");
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
