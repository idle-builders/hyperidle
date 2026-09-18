/**
 * L10 — `ThreadSections` filter-empty EmptyState tests.
 *
 * AC (TRACK-L L10:354): "Empty filtered states show a clear empty state
 * with a clear-filter affordance."
 *
 * Plan §3.6: dedicated EmptyState with `dataTestId="thread-sections-filter-empty"`,
 * chip-specific description copy, and a `Clear filter` action button that
 * invokes `onClearFilter`.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { type ThreadItem, ThreadSections } from "../ThreadSections";

const NOW = Date.parse("2026-04-30T12:00:00Z");
const AVATAR =
	"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'/%3E";

const mk = (overrides: Partial<ThreadItem>): ThreadItem => ({
	id: overrides.id ?? "t1",
	title: overrides.title ?? "Default title",
	snippet: "",
	timestamp: "just now",
	avatarUrl: AVATAR,
	hostKind: "team",
	hasUnresolvedReview: false,
	blocking: false,
	pinned: false,
	lastActiveAt: "2026-04-30T12:00:00.000Z",
	...overrides,
});

describe("ThreadSections — filter-empty EmptyState", () => {
	it("renders the filter-empty EmptyState when activeFilter='blocking' and no rows match", () => {
		const onlyAsync: ThreadItem[] = [
			mk({ id: "a1", blocking: false }),
			mk({ id: "a2", blocking: false }),
		];
		render(
			<ThreadSections
				threads={onlyAsync}
				now={NOW}
				activeFilter="blocking"
				onClearFilter={vi.fn()}
			/>,
		);
		const emptyState = screen.getByTestId("thread-sections-filter-empty");
		expect(emptyState).toBeInTheDocument();
		// Section regions must NOT be rendered alongside the filter-empty state.
		expect(screen.queryByRole("heading", { name: /blocking/i })).not.toBeInTheDocument();
	});

	it("renders chip-specific description copy for the 'blocking' filter", () => {
		render(
			<ThreadSections threads={[]} now={NOW} activeFilter="blocking" onClearFilter={vi.fn()} />,
		);
		const emptyState = screen.getByTestId("thread-sections-filter-empty");
		expect(emptyState.textContent ?? "").toMatch(/no blocking threads/i);
	});

	it("renders chip-specific description copy for the 'async' filter", () => {
		render(<ThreadSections threads={[]} now={NOW} activeFilter="async" onClearFilter={vi.fn()} />);
		const emptyState = screen.getByTestId("thread-sections-filter-empty");
		expect(emptyState.textContent ?? "").toMatch(/no async/i);
	});

	it("renders a Clear filter action button that invokes onClearFilter on click", async () => {
		const onClearFilter = vi.fn();
		const user = userEvent.setup();
		render(
			<ThreadSections
				threads={[]}
				now={NOW}
				activeFilter="blocking"
				onClearFilter={onClearFilter}
			/>,
		);
		const clearButton = screen.getByRole("button", { name: /clear filter/i });
		expect(clearButton).toBeInTheDocument();
		await user.click(clearButton);
		expect(onClearFilter).toHaveBeenCalledTimes(1);
	});

	it("does NOT render the filter-empty state when activeFilter='all' and the list is empty", () => {
		// activeFilter='all' on a globally empty list keeps the existing L8
		// "No threads yet" empty state — not the filter-empty variant.
		render(<ThreadSections threads={[]} now={NOW} activeFilter="all" />);
		expect(screen.queryByTestId("thread-sections-filter-empty")).not.toBeInTheDocument();
		expect(screen.getByTestId("thread-sections-empty")).toBeInTheDocument();
	});
});
