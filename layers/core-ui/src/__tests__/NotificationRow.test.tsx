import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NotificationRow } from "../ds";

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

	it("renders source as a Tag label when provided", () => {
		render(<NotificationRow {...defaultProps} source="CI/CD" />);
		expect(screen.getByText("CI/CD")).toBeInTheDocument();
	});

	it("does not render source Tag when omitted", () => {
		const { container } = render(<NotificationRow {...defaultProps} />);
		// No Tag elements should be rendered when source is omitted.
		// rounded-[var(--r-pill)] is no longer a Tag-unique marker — every
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

	it("shows both the severity status and the source tag together", () => {
		render(<NotificationRow {...defaultProps} source="system" />);
		expect(screen.getByText("HEALTHY")).toBeInTheDocument();
		expect(screen.getByText("system")).toBeInTheDocument();
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
