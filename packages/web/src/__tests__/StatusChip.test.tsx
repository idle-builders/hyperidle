import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Status } from "../components/StatusChip";
import { StatusChip } from "../components/StatusChip";

describe("StatusChip", () => {
	it("renders status text in uppercase", () => {
		render(<StatusChip status="healthy" />);
		expect(screen.getByText("HEALTHY")).toBeInTheDocument();
	});

	it("applies badge-accent class for healthy status", () => {
		render(<StatusChip status="healthy" />);
		const chip = screen.getByText("HEALTHY");
		expect(chip).toHaveClass("badge", "badge-accent");
	});

	it("applies badge-secondary class for behind status", () => {
		render(<StatusChip status="behind" />);
		const chip = screen.getByText("BEHIND");
		expect(chip).toHaveClass("badge", "badge-secondary");
	});

	it("applies badge-error class for blocked status", () => {
		render(<StatusChip status="blocked" />);
		const chip = screen.getByText("BLOCKED");
		expect(chip).toHaveClass("badge", "badge-error");
	});

	it("applies badge-neutral class for paused status", () => {
		render(<StatusChip status="paused" />);
		const chip = screen.getByText("PAUSED");
		expect(chip).toHaveClass("badge", "badge-neutral");
	});

	it("applies badge-success class for done status", () => {
		render(<StatusChip status="done" />);
		const chip = screen.getByText("DONE");
		expect(chip).toHaveClass("badge", "badge-success");
	});

	it("applies badge-error class for error status", () => {
		render(<StatusChip status="error" />);
		const chip = screen.getByText("ERROR");
		expect(chip).toHaveClass("badge", "badge-error");
	});

	it("has tooltip with status text", () => {
		render(<StatusChip status="blocked" />);
		const chip = screen.getByText("BLOCKED");
		expect(chip).toHaveAttribute("title", "blocked");
	});

	it("renders a 6px dot indicator", () => {
		const { container } = render(<StatusChip status="healthy" />);
		const dot = container.querySelector("span > span");
		expect(dot).toBeInTheDocument();
		expect(dot).toHaveClass("rounded-full");
	});

	it("renders all six status values without crashing", () => {
		const statuses: Status[] = ["healthy", "behind", "blocked", "paused", "done", "error"];
		for (const status of statuses) {
			const { unmount } = render(<StatusChip status={status} />);
			expect(screen.getByText(status.toUpperCase())).toBeInTheDocument();
			unmount();
		}
	});

	it("each status has a dot with a color class", () => {
		const statuses: Status[] = ["healthy", "behind", "blocked", "paused", "done", "error"];
		for (const status of statuses) {
			const { container, unmount } = render(<StatusChip status={status} />);
			const dot = container.querySelector("span > span");
			expect(dot).toHaveClass("rounded-full");
			// Every dot should have a bg-* color class
			expect(dot?.className).toMatch(/bg-/);
			unmount();
		}
	});

	it("badge has font-mono and text-xs classes for terminal aesthetic", () => {
		render(<StatusChip status="healthy" />);
		const chip = screen.getByText("HEALTHY");
		expect(chip).toHaveClass("font-mono", "text-xs");
	});

	it("renders visually distinct badges for blocked and error statuses", () => {
		// I4 S7: spec demands blocked and error must be visually distinguishable.
		// Current implementation assigns both `badge-error` → indistinguishable.
		// Assert the badge class on the chip element differs between the two.
		const { container: blockedContainer, unmount: blockedUnmount } = render(
			<StatusChip status="blocked" />,
		);
		const blockedChip = blockedContainer.querySelector("span.badge");
		const blockedClass = blockedChip?.className ?? "";
		blockedUnmount();

		const { container: errorContainer } = render(<StatusChip status="error" />);
		const errorChip = errorContainer.querySelector("span.badge");
		const errorClass = errorChip?.className ?? "";

		// Extract the `badge-<variant>` token from each className
		const badgeVariant = /badge-(accent|secondary|error|neutral|success|warning|info|primary)/;
		const blockedVariant = blockedClass.match(badgeVariant)?.[0];
		const errorVariant = errorClass.match(badgeVariant)?.[0];

		expect(blockedVariant).toBeDefined();
		expect(errorVariant).toBeDefined();
		expect(blockedVariant).not.toBe(errorVariant);
	});

	it("renders visually distinct dot colors for blocked and error statuses", () => {
		// Dot color must also differ so the indicator dot isn't collapsed to
		// the same hue for both states.
		const { container: blockedContainer, unmount } = render(<StatusChip status="blocked" />);
		const blockedDot = blockedContainer.querySelector("span > span");
		const blockedDotClass = blockedDot?.className ?? "";
		unmount();

		const { container: errorContainer } = render(<StatusChip status="error" />);
		const errorDot = errorContainer.querySelector("span > span");
		const errorDotClass = errorDot?.className ?? "";

		const bgToken = /bg-\S+/;
		const blockedBg = blockedDotClass.match(bgToken)?.[0];
		const errorBg = errorDotClass.match(bgToken)?.[0];
		expect(blockedBg).toBeDefined();
		expect(errorBg).toBeDefined();
		expect(blockedBg).not.toBe(errorBg);
	});
});
