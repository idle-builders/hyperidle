/**
 * AI5 E3 — `ErrorState` compact variant (RED phase).
 *
 * Adds a `compact?: boolean` prop. Compact is inline (not floating):
 * 18px padding, no max-width, NO shadow, surface-page (not elevated), no 48px
 * icon block, 15px title / 13px desc, smaller retry pill with the AQ-015 touch
 * mechanism `min-h-[44px] xl:min-h-[30px]`, 12px mono detail block.
 *
 * NOTE: the full-variant contract is frozen by ErrorState.test.tsx and must
 * stay green. These tests cover only the compact branch.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ErrorState } from "../ds";

describe("ErrorState — compact", () => {
	it("uses 18px padding instead of 36px", () => {
		const { container } = render(<ErrorState compact title="Failed" description="Try again." />);
		const outer = container.firstElementChild;
		expect(outer?.className).toContain("p-[18px]");
		expect(outer?.className).not.toContain("p-[36px]");
	});

	it("uses surface-page (not elevated) and drops the shadow — it is inline, not floating", () => {
		const { container } = render(<ErrorState compact title="Failed" description="Try again." />);
		const outer = container.firstElementChild;
		expect(outer?.className).toContain("bg-[var(--surface-page)]");
		expect(outer?.className).not.toContain("bg-[var(--surface-elevated)]");
		expect(outer?.className).not.toContain("shadow");
	});

	it("drops the max-width so it fills the panel", () => {
		const { container } = render(<ErrorState compact title="Failed" description="Try again." />);
		const outer = container.firstElementChild;
		expect(outer?.className).not.toContain("max-w-[440px]");
	});

	it("never renders the 48px icon block", () => {
		const { container } = render(<ErrorState compact title="Failed" description="Try again." />);
		expect(container.querySelector(".w-\\[48px\\]")).toBeNull();
	});

	it("renders compact title and description with semantic profiles", () => {
		render(<ErrorState compact title="Failed to load" description="The server errored." />);
		const title = screen.getByText("Failed to load");
		const desc = screen.getByText("The server errored.");
		expect(title.className).toContain("type-copy");
		expect(desc.className).toContain("type-small");
	});

	it("still exposes role=alert", () => {
		render(<ErrorState compact title="Failed" description="Try again." />);
		expect(screen.getByRole("alert")).toBeInTheDocument();
	});

	it("invokes onRetry from the compact retry pill", async () => {
		const onRetry = vi.fn();
		render(<ErrorState compact title="Failed" description="Try again." onRetry={onRetry} />);
		await userEvent.click(screen.getByRole("button", { name: /retry/i }));
		expect(onRetry).toHaveBeenCalledTimes(1);
	});

	it("uses the AQ-015 touch mechanism on the compact retry pill (44px floor, dense xl)", () => {
		render(
			<ErrorState compact title="Failed" description="Try again." onRetry={() => undefined} />,
		);
		const btn = screen.getByRole("button", { name: /retry/i });
		expect(btn.className).toContain("min-h-[44px]");
		expect(btn.className).toContain("xl:min-h-[30px]");
	});

	it("renders the detail block with the data profile", () => {
		render(
			<ErrorState
				compact
				title="Failed"
				description="Try again."
				detail="Error 502: upstream unavailable"
			/>,
		);
		const detail = screen.getByText("Error 502: upstream unavailable");
		expect(detail.className).toContain("type-data");
	});

	it("keeps the full variant elevated with shadow when compact is false (default)", () => {
		const { container } = render(<ErrorState title="Failed" description="Try again." />);
		const outer = container.firstElementChild;
		expect(outer?.className).toContain("bg-[var(--surface-elevated)]");
		expect(outer?.className).toContain("shadow-[var(--shadow-default)]");
	});
});
