import { KnowledgeRow } from "@hyperidle/design-system";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

describe("KnowledgeRow", () => {
	const defaultProps = {
		title: "API Rate Limiting Pattern",
		layer: "L2" as const,
		kind: "pattern" as const,
		status: "validated" as const,
		timestamp: "3 hours ago",
	};

	it("renders title text", () => {
		render(<KnowledgeRow {...defaultProps} />);
		expect(screen.getByText("API Rate Limiting Pattern")).toBeInTheDocument();
	});

	it("renders layer as Tag", () => {
		render(<KnowledgeRow {...defaultProps} />);
		const tag = screen.getByText("L2");
		expect(tag).toHaveClass("inline-flex", "rounded-[var(--r-pill)]");
		expect(tag.className).toContain("text-secondary");
	});

	it("renders kind as Tag", () => {
		render(<KnowledgeRow {...defaultProps} />);
		// "pattern" matches TagKind so gets tint class instead of neutral bg
		expect(screen.getByText("pattern")).toHaveClass("inline-flex", "rounded-[var(--r-pill)]");
	});

	it("renders status as StatusChip via knowledgeStatusToStatus mapping", () => {
		render(<KnowledgeRow {...defaultProps} status="validated" />);
		// validated maps to healthy
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

	it("renders captured status as PAUSED chip", () => {
		render(<KnowledgeRow {...defaultProps} status="captured" />);
		expect(screen.getByText("PAUSED")).toBeInTheDocument();
	});

	it("renders provisional status as BEHIND chip", () => {
		render(<KnowledgeRow {...defaultProps} status="provisional" />);
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

	it("renders all KnowledgeLayer values as Tags", () => {
		const layers = ["L0", "L1", "L2", "L3", "L4"] as const;
		for (const layer of layers) {
			const { unmount } = render(<KnowledgeRow {...defaultProps} layer={layer} />);
			const tag = screen.getByText(layer);
			expect(tag).toHaveClass("inline-flex", "rounded-[var(--r-pill)]");
			expect(tag.className).toContain("text-secondary");
			unmount();
		}
	});

	it("renders all KnowledgeKind values as Tags", () => {
		const kinds = [
			"pattern",
			"anti_pattern",
			"brief",
			"principle",
			"decision",
			"failure",
			"reflection",
			"focus",
		] as const;
		// Kinds that match TagKind get tint classes; others fall back to neutral bg
		const tintedKinds = new Set(["pattern", "decision", "failure"]);
		for (const kind of kinds) {
			const { unmount } = render(<KnowledgeRow {...defaultProps} kind={kind} />);
			const el = screen.getByText(kind);
			expect(el).toHaveClass("inline-flex", "rounded-[var(--r-pill)]");
			if (!tintedKinds.has(kind)) {
				expect(el.className).toContain("text-secondary");
			}
			unmount();
		}
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

	it("composes at least 2 Tier 1 primitives (Tag + StatusChip)", () => {
		render(<KnowledgeRow {...defaultProps} />);
		// Tag for layer
		expect(screen.getByText("L2")).toHaveClass("inline-flex", "rounded-[var(--r-pill)]");
		// Tag for kind — "pattern" matches TagKind so gets tint class
		expect(screen.getByText("pattern")).toHaveClass("inline-flex", "rounded-[var(--r-pill)]");
		// StatusChip for status
		expect(screen.getByText("HEALTHY")).toHaveClass("inline-flex", "rounded-[var(--r-pill)]");
	});
});
