import { SkeletonCard, SkeletonList } from "@hyperidle/design-system";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("SkeletonList", () => {
	it("renders the requested number of rows with the loading motion profile", () => {
		render(<SkeletonList rows={4} ariaLabel="Loading knowledge" />);
		const rows = screen.getAllByTestId("skeleton-row");
		expect(rows).toHaveLength(4);
		expect(rows[0]!.className).toContain("motion-loading");
	});

	it("exposes an aria-live status so loading is announced", () => {
		render(<SkeletonList rows={2} ariaLabel="Loading knowledge" />);
		const region = screen.getByRole("status", { name: /loading knowledge/i });
		expect(region).toBeInTheDocument();
	});

	it("defaults to 3 rows when `rows` is omitted", () => {
		render(<SkeletonList ariaLabel="Loading" />);
		expect(screen.getAllByTestId("skeleton-row")).toHaveLength(3);
	});
});

describe("SkeletonCard", () => {
	it("matches the card shape with a title bar + body lines", () => {
		render(<SkeletonCard ariaLabel="Loading bet" />);
		const card = screen.getByTestId("skeleton-card");
		// A title bar + at least two body lines use the complete loading profile.
		const bars = card.querySelectorAll(".motion-loading");
		expect(bars).not.toHaveLength(0);
		expect(bars.length).toBeGreaterThanOrEqual(3);
	});

	it("skeleton bars use --surface-container background", () => {
		render(<SkeletonCard ariaLabel="Loading bet" />);
		const card = screen.getByTestId("skeleton-card");
		const bars = card.querySelectorAll(".motion-loading");
		for (const bar of bars) {
			expect(bar.className).toContain("bg-[var(--surface-container)]");
		}
	});

	it("SkeletonCard wrapper uses --surface-elevated background", () => {
		render(<SkeletonCard ariaLabel="Loading bet" />);
		const card = screen.getByTestId("skeleton-card");
		expect(card.className).toContain("bg-[var(--surface-elevated)]");
	});
});
