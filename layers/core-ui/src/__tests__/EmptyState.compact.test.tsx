/**
 * AI5 E2 — `EmptyState` compact variant (RED phase).
 *
 * Adds a `compact?: boolean` prop (default false). Compact embodies the
 * hand-rolled panel one-liners (ArtifactThreadsSummary, SessionActivityPanel):
 * 18px padding, no max-width, no 48px icon block, 15px/600 title, 13px desc.
 *
 * NOTE: the full-variant contract is frozen by EmptyState.test.tsx and must
 * stay green. These tests cover only the compact branch.
 */

import { EmptyState } from "@hyperidle/design-system";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("EmptyState — compact", () => {
	it("uses 18px padding instead of 36px", () => {
		const { container } = render(
			<EmptyState compact title="No discussions" description="Start one." />,
		);
		const outer = container.firstElementChild;
		expect(outer?.className).toContain("p-[18px]");
		expect(outer?.className).not.toContain("p-[36px]");
	});

	it("drops the max-width so it fills the panel", () => {
		const { container } = render(
			<EmptyState compact title="No discussions" description="Start one." />,
		);
		const outer = container.firstElementChild;
		expect(outer?.className).not.toContain("max-w-[420px]");
	});

	it("renders the compact title with the copy profile", () => {
		render(<EmptyState compact title="No discussions" description="Start one." />);
		const title = screen.getByText("No discussions");
		expect(title.className).toContain("type-copy");
	});

	it("renders the compact description with the small profile", () => {
		render(<EmptyState compact title="No discussions" description="Start one." />);
		const desc = screen.getByText("Start one.");
		expect(desc.className).toContain("type-small");
	});

	it("never renders the 48px icon block even when an icon is passed", () => {
		const { container } = render(
			<EmptyState compact title="T" description="D" icon={<svg data-testid="compact-icon" />} />,
		);
		expect(container.querySelector(".w-\\[48px\\]")).toBeNull();
	});

	it("still exposes role=status and the message", () => {
		render(<EmptyState compact title="No activity yet" description="Nothing happened." />);
		const region = screen.getByRole("status");
		expect(region).toHaveTextContent("No activity yet");
		expect(region).toHaveTextContent("Nothing happened.");
	});

	it("renders an action slot in compact mode", () => {
		render(
			<EmptyState
				compact
				title="T"
				description="D"
				action={
					<button type="button" onClick={() => undefined}>
						Add one
					</button>
				}
			/>,
		);
		expect(screen.getByRole("button", { name: "Add one" })).toBeInTheDocument();
	});

	it("keeps the full variant at 36px padding when compact is false (default)", () => {
		const { container } = render(<EmptyState title="T" description="D" />);
		const outer = container.firstElementChild;
		expect(outer?.className).toContain("p-[36px]");
	});
});
