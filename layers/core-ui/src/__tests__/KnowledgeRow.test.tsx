import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KnowledgeRow } from "../ds";

describe("KnowledgeRow", () => {
	const defaultProps = {
		title: "API Rate Limiting Pattern",
		status: "active" as const,
		timestamp: "3 hours ago",
	};

	it("renders title text", () => {
		render(<KnowledgeRow {...defaultProps} />);
		expect(screen.getByText("API Rate Limiting Pattern")).toBeInTheDocument();
	});

	it("renders status as StatusChip via knowledgeStatusToStatus mapping", () => {
		render(<KnowledgeRow {...defaultProps} status="active" />);
		// active maps to healthy
		expect(screen.getByText("HEALTHY")).toBeInTheDocument();
	});

	it("renders timestamp", () => {
		render(<KnowledgeRow {...defaultProps} />);
		expect(screen.getByText("3 hours ago")).toBeInTheDocument();
	});

	it("renders actions slot content", () => {
		render(<KnowledgeRow {...defaultProps} actions={<button type="button">View</button>} />);
		expect(screen.getByText("View")).toBeInTheDocument();
	});

	it("calls onClick when row is clicked", () => {
		const handleClick = vi.fn();
		render(<KnowledgeRow {...defaultProps} onClick={handleClick} />);
		const row =
			screen.getByText("API Rate Limiting Pattern").closest("[role='button'], button, [onClick]") ??
			screen.getByText("API Rate Limiting Pattern").parentElement;
		(row as HTMLElement | null)?.click();
		expect(handleClick).toHaveBeenCalledOnce();
	});

	it("renders proposed status as BEHIND chip", () => {
		render(<KnowledgeRow {...defaultProps} status="proposed" />);
		expect(screen.getByText("BEHIND")).toBeInTheDocument();
	});

	it("renders active status as HEALTHY chip", () => {
		render(<KnowledgeRow {...defaultProps} status="active" />);
		expect(screen.getByText("HEALTHY")).toBeInTheDocument();
	});

	it("renders stale status as ERROR chip", () => {
		render(<KnowledgeRow {...defaultProps} status="stale" />);
		expect(screen.getByText("ERROR")).toBeInTheDocument();
	});

	it("renders archived status as DONE chip", () => {
		render(<KnowledgeRow {...defaultProps} status="archived" />);
		expect(screen.getByText("DONE")).toBeInTheDocument();
	});

	it("renders caption when provided", () => {
		render(<KnowledgeRow {...defaultProps} caption="A short description of the pattern" />);
		expect(screen.getByText("A short description of the pattern")).toBeInTheDocument();
	});

	it("does not render caption when omitted", () => {
		const { container } = render(<KnowledgeRow {...defaultProps} />);
		const captions = container.querySelectorAll("p");
		expect(captions.length).toBe(0);
	});

	it("has aria-label on title", () => {
		render(<KnowledgeRow {...defaultProps} />);
		expect(screen.getByLabelText("Knowledge: API Rate Limiting Pattern")).toBeInTheDocument();
	});

	it("composes StatusChip (Tier 1 primitive)", () => {
		render(<KnowledgeRow {...defaultProps} />);
		expect(screen.getByText("HEALTHY")).toHaveClass("inline-flex", "rounded-[var(--r-pill)]");
	});
});
