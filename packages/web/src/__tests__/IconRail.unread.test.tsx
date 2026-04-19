import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IconRail } from "../shell/IconRail";

/**
 * J2: IconRail gains two visual affordances driven by the activeView + unreadByView
 * map. These tests pin down:
 *   1. Active view renders a 2px left-edge indicator via `bg-[var(--primary)]`.
 *   2. Inactive views with unread > 0 render a 6px error dot + aria-label addendum.
 *   3. Active view suppresses the dot.
 *   4. Back-compat: without unreadByView, no dots render anywhere.
 */
describe("IconRail — unread + active edge indicator", () => {
	const defaultProps = {
		activeView: "conversations" as const,
		onViewChange: vi.fn(),
	};

	it("active view renders a 2px left-edge indicator", () => {
		const { container } = render(<IconRail {...defaultProps} activeView="work" />);
		const workButton = screen.getByRole("button", { name: /work/i });
		// Edge indicator is a <span> with bg-[var(--primary)] and w-0.5 (2px).
		const edge = workButton.querySelector("span.bg-\\[var\\(--primary\\)\\]");
		expect(edge).not.toBeNull();
		// Should be present only on the active button — inactive buttons must not
		// have this class.
		const inactiveEdges = container.querySelectorAll(
			"button:not([aria-current='page']) span.bg-\\[var\\(--primary\\)\\]",
		);
		expect(inactiveEdges.length).toBe(0);
	});

	it("inactive view with unread count renders a 6px error-colored dot", () => {
		render(<IconRail {...defaultProps} activeView="work" unreadByView={{ conversations: 3 }} />);
		const convButton = screen.getByRole("button", { name: /conversations/i });
		// The dot is a span with bg-error (DaisyUI error token) + rounded-full.
		const dot = convButton.querySelector("span.bg-error");
		expect(dot).not.toBeNull();
		expect(dot?.className).toMatch(/rounded-full/);
	});

	it("appends 'N unread items' to aria-label when an inactive view has unread", () => {
		render(<IconRail {...defaultProps} activeView="work" unreadByView={{ conversations: 5 }} />);
		const convButton = screen.getByRole("button", { name: /conversations/i });
		expect(convButton.getAttribute("aria-label")).toMatch(/5 unread items/i);
	});

	it("active view suppresses the unread dot even when its own count is > 0", () => {
		render(
			<IconRail {...defaultProps} activeView="conversations" unreadByView={{ conversations: 7 }} />,
		);
		const convButton = screen.getByRole("button", { name: /conversations/i });
		expect(convButton.querySelector("span.bg-error")).toBeNull();
	});

	it("no unreadByView prop → no dots rendered for any view (back-compat)", () => {
		const { container } = render(<IconRail {...defaultProps} />);
		expect(container.querySelectorAll("span.bg-error").length).toBe(0);
	});
});
