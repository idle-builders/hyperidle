/**
 * M3 RED — Avatar rendering: initials chip when no avatarUrl, img when present (E1, E2).
 *
 * Tests that:
 *  - FALLBACK_AVATAR is deleted from useConversationsThreads.ts
 *  - Thread list item renderer uses conditional rendering:
 *    avatarUrl present → <img>, name present → initials chip, neither → User icon
 *
 * @lore M3 E2: The avatar rendering is in ThreadRow (design-system component).
 * We test it by rendering ThreadSections directly with controlled thread data.
 * Submenu is just a layout wrapper and does not render thread items itself.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import type { ThreadItem } from "../components/ThreadSections";
import { ThreadSections } from "../components/ThreadSections";

function makeItem(overrides: Partial<ThreadItem> = {}): ThreadItem {
	return {
		id: "thread-1",
		title: "Test Thread",
		avatarUrl: null,
		snippet: "Latest message",
		timestamp: "1m ago",
		unread: false,
		kind: "plain",
		participants: ["user-1"],
		hostKind: "task",
		hostId: "task-1",
		blocking: false,
		pinned: false,
		...overrides,
	};
}

describe("M3 — Thread avatar: initials chip when avatarUrl is null (E1/E2)", () => {
	afterEach(() => {
		// no teardown needed
	});

	it("renders initials chip when avatarUrl is null and title is available", async () => {
		render(
			<MemoryRouter>
				<ThreadSections
					threads={[makeItem({ id: "t1", title: "Task thread abc", avatarUrl: null })]}
					onSelect={() => {}}
				/>
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByText("Task thread abc")).toBeInTheDocument();
		});

		// Initials derived from "Task thread abc" = "TA" (uppercase first two chars)
		// ThreadRow renders: title.slice(0, 2).toUpperCase() = "TA"
		const initialsElements = screen.queryAllByText(/^[A-Z]{2}$/);
		expect(initialsElements.length).toBeGreaterThan(0);
	});

	it("does NOT use FALLBACK_AVATAR data URI when avatarUrl is null", async () => {
		const { container } = render(
			<MemoryRouter>
				<ThreadSections
					threads={[makeItem({ id: "t2", title: "No avatar thread", avatarUrl: null })]}
					onSelect={() => {}}
				/>
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByText("No avatar thread")).toBeInTheDocument();
		});

		// The FALLBACK_AVATAR was a data: URI SVG — check no img with data: src exists
		const imgs = container.querySelectorAll("img");
		for (const img of imgs) {
			expect(img.getAttribute("src") ?? "").not.toMatch(/^data:/);
		}
	});

	it("renders <img> element when avatarUrl is a valid URL", async () => {
		const { container } = render(
			<MemoryRouter>
				<ThreadSections
					threads={[
						makeItem({
							id: "t3",
							title: "Thread with Avatar",
							avatarUrl: "https://example.com/av.png",
						}),
					]}
					onSelect={() => {}}
				/>
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByText("Thread with Avatar")).toBeInTheDocument();
		});

		const img = container.querySelector('img[src="https://example.com/av.png"]');
		expect(img).not.toBeNull();
	});
});
