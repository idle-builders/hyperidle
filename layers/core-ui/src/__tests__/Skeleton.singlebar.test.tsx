import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Skeleton } from "../ds";

describe("Skeleton (single bar)", () => {
	it("renders a status region with the provided aria-label", () => {
		render(<Skeleton ariaLabel="Loading block reference" />);
		const region = screen.getByRole("status");
		expect(region).toHaveAttribute("aria-label", "Loading block reference");
	});

	it("defaults to height 32px and width 100%, and applies an explicit size when provided", () => {
		const { container, rerender } = render(<Skeleton ariaLabel="Loading" />);
		const outer = container.firstElementChild as HTMLElement;
		expect(outer.style.height).toBe("32px");
		expect(outer.style.width).toBe("100%");

		rerender(<Skeleton ariaLabel="Loading" width="33%" height="16px" />);
		expect(outer.style.height).toBe("16px");
		expect(outer.style.width).toBe("33%");
	});

	it("supports a dataTestId passthrough", () => {
		render(<Skeleton ariaLabel="Loading" dataTestId="blockref-skeleton" />);
		expect(screen.getByTestId("blockref-skeleton")).toBeInTheDocument();
	});
});
