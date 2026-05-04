/**
 * L15: TaskCard accepts an optional `overflowMenu` prop. The slot is
 * absolute-positioned, opacity-0 by default, and becomes visible when the
 * nearest [data-density="comfortable"] ancestor is set (AQ-016 mobile rule).
 */
import { TaskCard } from "@hyperidle/design-system";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("L15 TaskCard.overflowMenu", () => {
	it("renders the overflowMenu slot when provided", () => {
		render(
			<TaskCard
				title="Task A"
				owner="Dev"
				state="in_progress"
				overflowMenu={<button type="button">Kebab</button>}
			/>,
		);
		expect(screen.getByText("Kebab")).toBeInTheDocument();
	});

	it("renders no overflow slot DOM when overflowMenu is omitted (visual parity)", () => {
		const { container } = render(<TaskCard title="Task A" owner="Dev" state="in_progress" />);
		expect(container.querySelector("[data-task-overflow]")).toBeNull();
	});

	it("overflowMenu wrapper has opacity-0 by default", () => {
		const { container } = render(
			<TaskCard
				title="Task A"
				owner="Dev"
				state="in_progress"
				overflowMenu={<button type="button">Kebab</button>}
			/>,
		);
		const wrapper = container.querySelector("[data-task-overflow]");
		expect(wrapper).not.toBeNull();
		expect(wrapper?.className).toMatch(/opacity-0/);
	});

	it("overflowMenu becomes visible when ancestor has data-density='comfortable'", () => {
		const { container } = render(
			<div data-density="comfortable">
				<TaskCard
					title="Task A"
					owner="Dev"
					state="in_progress"
					overflowMenu={<button type="button">Kebab</button>}
				/>
			</div>,
		);
		const wrapper = container.querySelector("[data-task-overflow]");
		// The CSS rule `[data-density="comfortable"] [data-task-overflow] { opacity: 1 }`
		// is set via Tailwind arbitrary-variant or a class chain. We assert the slot
		// presence + a class hint declaring the comfortable-visible behavior.
		expect(wrapper).not.toBeNull();
		expect(wrapper?.className).toMatch(
			/\[\[data-density=comfortable\]_&\]:opacity-100|data-\[density=comfortable\]|comfortable:opacity-100/,
		);
		// Verify the slot is mounted under an ancestor carrying the data attr.
		const ancestor = wrapper?.closest('[data-density="comfortable"]');
		expect(ancestor).not.toBeNull();
	});
});
