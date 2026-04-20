import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SkeletonCard, SkeletonList } from "@hyperidle/design-system";

describe("SkeletonList", () => {
	it("renders the requested number of rows using DaisyUI skeleton class", () => {
		render(<SkeletonList rows={4} ariaLabel="Loading knowledge" />);
		const rows = screen.getAllByTestId("skeleton-row");
		expect(rows).toHaveLength(4);
		// DaisyUI skeleton utility is part of every row.
		expect(rows[0].className).toMatch(/skeleton/);
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
		// A title bar + at least two body lines.
		expect(card.querySelectorAll(".skeleton")).not.toHaveLength(0);
		expect(card.querySelectorAll(".skeleton").length).toBeGreaterThanOrEqual(3);
	});
});
