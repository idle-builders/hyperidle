import { NotificationRow } from "@hyperidle/design-system";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("NotificationRow", () => {
	const defaultProps = {
		severity: "healthy" as const,
		message: "Deploy completed successfully",
		timestamp: "Just now",
	};

	it("renders severity as StatusChip", () => {
		render(<NotificationRow {...defaultProps} severity="healthy" />);
		expect(screen.getByText("HEALTHY")).toBeInTheDocument();
	});

	it("renders message text", () => {
		render(<NotificationRow {...defaultProps} />);
		expect(screen.getByText("Deploy completed successfully")).toBeInTheDocument();
	});

	it("renders timestamp", () => {
		render(<NotificationRow {...defaultProps} />);
		expect(screen.getByText("Just now")).toBeInTheDocument();
	});

	it("renders source as Tag when provided", () => {
		render(<NotificationRow {...defaultProps} source="CI/CD" />);
		const tag = screen.getByText("CI/CD");
		expect(tag).toHaveClass("inline-flex", "rounded-[var(--r-pill)]");
		expect(tag.className).toContain("text-secondary");
	});

	it("does not render source Tag when omitted", () => {
		const { container } = render(<NotificationRow {...defaultProps} />);
		// No Tag elements should be rendered when source is omitted.
		// AZ7: rounded-[var(--r-pill)] is no longer a Tag-unique marker — every
		// pill-shaped element (Tag, StatusChip, its dot) now shares the SAME
		// token spelling (Trade-off 1: pill has exactly one spelling). Tag's
		// own data-ds-component marker is the unique, reliable selector.
		const tags = container.querySelectorAll('[data-ds-component="Tag"]');
		expect(tags.length).toBe(0);
	});

	it("renders actions slot content", () => {
		render(<NotificationRow {...defaultProps} actions={<button type="button">Dismiss</button>} />);
		expect(screen.getByText("Dismiss")).toBeInTheDocument();
	});

	it("renders error severity as ERROR chip", () => {
		render(<NotificationRow {...defaultProps} severity="error" />);
		expect(screen.getByText("ERROR")).toBeInTheDocument();
	});

	it("renders blocked severity as BLOCKED chip", () => {
		render(<NotificationRow {...defaultProps} severity="blocked" />);
		expect(screen.getByText("BLOCKED")).toBeInTheDocument();
	});

	it("renders behind severity as BEHIND chip", () => {
		render(<NotificationRow {...defaultProps} severity="behind" />);
		expect(screen.getByText("BEHIND")).toBeInTheDocument();
	});

	it("renders paused severity as PAUSED chip", () => {
		render(<NotificationRow {...defaultProps} severity="paused" />);
		expect(screen.getByText("PAUSED")).toBeInTheDocument();
	});

	it("renders done severity as DONE chip", () => {
		render(<NotificationRow {...defaultProps} severity="done" />);
		expect(screen.getByText("DONE")).toBeInTheDocument();
	});

	it("has aria-label on message", () => {
		render(<NotificationRow {...defaultProps} />);
		expect(
			screen.getByLabelText("Notification: Deploy completed successfully"),
		).toBeInTheDocument();
	});

	it("composes at least 2 Tier 1 primitives (StatusChip + Tag)", () => {
		render(<NotificationRow {...defaultProps} source="system" />);
		// StatusChip for severity
		expect(screen.getByText("HEALTHY")).toHaveClass("inline-flex", "rounded-[var(--r-pill)]");
		// Tag for source
		expect(screen.getByText("system")).toHaveClass("inline-flex", "rounded-[var(--r-pill)]");
	});

	it("all severity levels produce visually distinct chips", () => {
		const severities = ["healthy", "behind", "blocked", "paused", "done", "error"] as const;
		const expectedTexts = ["HEALTHY", "BEHIND", "BLOCKED", "PAUSED", "DONE", "ERROR"];
		for (let i = 0; i < severities.length; i++) {
			const { unmount } = render(<NotificationRow {...defaultProps} severity={severities[i]!} />);
			expect(screen.getByText(expectedTexts[i]!)).toBeInTheDocument();
			unmount();
		}
	});
});
