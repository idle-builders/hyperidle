/**
 * AI5 E1 — `Skeleton` single-bar DS export (RED phase).
 *
 * DS exports only SkeletonList / SkeletonCard today. BlockRefEmbed and
 * ArtifactThreadsSummary need a single bar. This adds a `Skeleton` export that
 * uses the shared SKELETON_BAR animation (the `--accent`-free skeleton-pulse).
 */

import { Skeleton } from "@hyperidle/design-system";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("Skeleton (single bar)", () => {
	it("renders a status region with the provided aria-label", () => {
		render(<Skeleton ariaLabel="Loading block reference" />);
		const region = screen.getByRole("status");
		expect(region).toHaveAttribute("aria-label", "Loading block reference");
	});

	it("uses the shared loading motion profile (not a raw animation)", () => {
		const { container } = render(<Skeleton ariaLabel="Loading" />);
		const outer = container.firstElementChild;
		expect(outer?.className).toContain("motion-loading");
		expect(outer?.className).not.toContain("skeleton-pulse");
		expect(outer?.className).not.toContain("animate-pulse");
	});

	it("uses the surface-container bg and --r-default radius matching SKELETON_BAR", () => {
		const { container } = render(<Skeleton ariaLabel="Loading" />);
		const outer = container.firstElementChild;
		expect(outer?.className).toContain("bg-[var(--surface-container)]");
		expect(outer?.className).toContain("rounded-[var(--r-default)]");
	});

	it("defaults to height 32px and width 100%", () => {
		const { container } = render(<Skeleton ariaLabel="Loading" />);
		const outer = container.firstElementChild as HTMLElement;
		// Dimensions render via inline style (Tailwind JIT can't emit runtime-interpolated
		// arbitrary classes); the contract is the rendered dimension, not a fragile class.
		expect(outer.style.height).toBe("32px");
		expect(outer.style.width).toBe("100%");
	});

	it("applies an explicit width and height when provided", () => {
		const { container } = render(<Skeleton ariaLabel="Loading" width="33%" height="16px" />);
		const outer = container.firstElementChild as HTMLElement;
		expect(outer.style.height).toBe("16px");
		expect(outer.style.width).toBe("33%");
	});

	it("supports a dataTestId passthrough", () => {
		render(<Skeleton ariaLabel="Loading" dataTestId="blockref-skeleton" />);
		expect(screen.getByTestId("blockref-skeleton")).toBeInTheDocument();
	});

	it("merges a custom className", () => {
		const { container } = render(<Skeleton ariaLabel="Loading" className="mb-[12px]" />);
		const outer = container.firstElementChild;
		expect(outer?.className).toContain("mb-[12px]");
	});
});
