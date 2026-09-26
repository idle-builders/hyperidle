import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Skeleton } from "../ds";

describe("Skeleton (single bar)", () => {
	it("renders a status region with the provided aria-label", () => {
		render(<Skeleton ariaLabel="Loading block reference" />);
		const region = screen.getByRole("status");
		expect(region).toHaveAttribute("aria-label", "Loading block reference");
	});

	it("supports a dataTestId passthrough", () => {
		render(<Skeleton ariaLabel="Loading" dataTestId="blockref-skeleton" />);
		expect(screen.getByTestId("blockref-skeleton")).toBeInTheDocument();
	});
});
