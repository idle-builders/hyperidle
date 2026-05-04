/**
 * L15 step8 (write-tests) — Optimistic-update prohibition (PROTECTED).
 *
 * Approved.md §5 ("Request succeeded ... card StatusChip does NOT change.")
 * Plan §3.5.
 *
 * The TaskCard MUST NOT preempt the StatusChip when a request verb is
 * picked. The chip is a pure projection of the `state` prop. The parent
 * never updates state in this test, so the chip text MUST stay equal
 * across the click.
 *
 * @lore L15 PROTECTED TEST: do not weaken or delete. Optimistic state
 * changes are explicitly forbidden by approved.md §12 item 5.
 */

import { TaskCard } from "@hyperidle/design-system";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

describe("TaskCard — optimistic update prohibition (L15)", () => {
	it("StatusChip text does NOT change after onRequestStateChange fires", async () => {
		const user = userEvent.setup();
		const onRequestStateChange = vi.fn(); // does NOT change parent state
		render(
			<TaskCard
				title="Implement login"
				owner="Agent A"
				state="accepted"
				onRequestStateChange={onRequestStateChange}
				onOpenThread={vi.fn()}
			/>,
		);
		// `accepted` maps to HEALTHY chip.
		expect(screen.getByText("HEALTHY")).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: /task actions|open menu|more/i }));
		await user.click(screen.getByRole("menuitem", { name: /^mark done$/i }));

		// The handler fired, but the parent did not update state — so the chip
		// must still read HEALTHY (not DONE). The card MUST NOT optimistically
		// move the chip.
		expect(onRequestStateChange).toHaveBeenCalledWith("mark_done");
		expect(screen.getByText("HEALTHY")).toBeInTheDocument();
		expect(screen.queryByText("DONE")).toBeNull();
	});

	it("StatusChip is the only source of state and reflects the prop verbatim", () => {
		const { rerender } = render(
			<TaskCard
				title="Implement login"
				owner="Agent A"
				state="accepted"
				onRequestStateChange={vi.fn()}
				onOpenThread={vi.fn()}
			/>,
		);
		expect(screen.getByText("HEALTHY")).toBeInTheDocument();
		// Parent provides a new state — chip must update.
		rerender(
			<TaskCard
				title="Implement login"
				owner="Agent A"
				state="done"
				onRequestStateChange={vi.fn()}
				onOpenThread={vi.fn()}
			/>,
		);
		expect(screen.getByText("DONE")).toBeInTheDocument();
	});
});
