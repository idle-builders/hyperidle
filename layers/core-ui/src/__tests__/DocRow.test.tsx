import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DocRow } from "../ds";

describe("DocRow", () => {
	const defaultProps = {
		title: "API Rate Limiting Pattern",
		status: "active" as const,
		timestamp: "3 hours ago",
	};

	it("renders title text", () => {
		render(<DocRow {...defaultProps} />);
		expect(screen.getByText("API Rate Limiting Pattern")).toBeInTheDocument();
	});

	it("renders status as StatusChip via documentStatusToStatus mapping", () => {
		render(<DocRow {...defaultProps} status="active" />);
		// active maps to healthy
		expect(screen.getByText("HEALTHY")).toBeInTheDocument();
	});

	it("renders timestamp", () => {
		render(<DocRow {...defaultProps} />);
		expect(screen.getByText("3 hours ago")).toBeInTheDocument();
	});

	it("renders actions slot content", () => {
		render(<DocRow {...defaultProps} actions={<button type="button">View</button>} />);
		expect(screen.getByText("View")).toBeInTheDocument();
	});

	it("calls onClick when row is clicked", () => {
		const handleClick = vi.fn();
		render(<DocRow {...defaultProps} onClick={handleClick} />);
		const row =
			screen.getByText("API Rate Limiting Pattern").closest("[role='button'], button, [onClick]") ??
			screen.getByText("API Rate Limiting Pattern").parentElement;
		(row as HTMLElement | null)?.click();
		expect(handleClick).toHaveBeenCalledOnce();
	});

	it("renders proposed status as BEHIND chip", () => {
		render(<DocRow {...defaultProps} status="proposed" />);
		expect(screen.getByText("BEHIND")).toBeInTheDocument();
	});

	it("renders active status as HEALTHY chip", () => {
		render(<DocRow {...defaultProps} status="active" />);
		expect(screen.getByText("HEALTHY")).toBeInTheDocument();
	});

	it("renders stale status as ERROR chip", () => {
		render(<DocRow {...defaultProps} status="stale" />);
		expect(screen.getByText("ERROR")).toBeInTheDocument();
	});

	it("renders archived status as DONE chip", () => {
		render(<DocRow {...defaultProps} status="archived" />);
		expect(screen.getByText("DONE")).toBeInTheDocument();
	});

	it("renders caption when provided", () => {
		render(<DocRow {...defaultProps} caption="A short description of the pattern" />);
		expect(screen.getByText("A short description of the pattern")).toBeInTheDocument();
	});

	it("does not render caption when omitted", () => {
		const { container } = render(<DocRow {...defaultProps} />);
		const captions = container.querySelectorAll("p");
		expect(captions.length).toBe(0);
	});

	it("has aria-label on title", () => {
		render(<DocRow {...defaultProps} />);
		expect(screen.getByLabelText("Document: API Rate Limiting Pattern")).toBeInTheDocument();
	});

	it("shows the item's status via StatusChip", () => {
		render(<DocRow {...defaultProps} />);
		expect(screen.getByText("HEALTHY")).toBeInTheDocument();
	});
});
