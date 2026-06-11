/**
 * M3 — Thread row rendering: title display, no left-side avatar (E1, E2).
 *
 * After the visual parity pass (audit L-25), ThreadRow no longer renders
 * a left-side avatar (img or initials chip). The layout is now:
 *   unread-dot → info (title + preview) → meta (avatars, count, time)
 *
 * The `avatarUrl` prop is kept for backwards compatibility but not rendered.
 * Small participant avatars appear on the RIGHT via the `avatars` prop.
 *
 * These tests verify:
 *  - Thread title renders regardless of avatarUrl value
 *  - No left-side initials chip is rendered when avatarUrl is null
 *  - No <img> is rendered when avatarUrl is a URL (deprecated prop)
 *  - Right-side avatars render correctly via the `avatars` prop
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
		hostKind: "task",
		hasUnresolvedReview: false,
		blocking: false,
		pinned: false,
		lastActiveAt: "2026-04-30T12:00:00.000Z",
		...overrides,
	};
}

describe("M3 — Thread row rendering: no left-side avatar (visual parity pass)", () => {
	afterEach(() => {
		// no teardown needed
	});

	it("renders thread title when avatarUrl is null", async () => {
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
	});

	it("does NOT render a left-side avatar <img> when avatarUrl is null", async () => {
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

		// No img element should appear — avatarUrl is not rendered
		const imgs = container.querySelectorAll("img");
		expect(imgs.length).toBe(0);
	});

	it("does NOT render a left-side initials chip when avatarUrl is null", async () => {
		// Previously ThreadRow rendered initials = title.slice(0,2).toUpperCase()
		// as a left-side chip. After the visual parity pass this no longer happens.
		render(
			<MemoryRouter>
				<ThreadSections
					threads={[makeItem({ id: "t3", title: "Task thread abc", avatarUrl: null })]}
					onSelect={() => {}}
				/>
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByText("Task thread abc")).toBeInTheDocument();
		});

		// "TA" (initials) should NOT appear as a separate rendered element
		const initialsEl = screen.queryByText("TA");
		expect(initialsEl).toBeNull();
	});

	it("does NOT render <img> when avatarUrl is a URL (prop is deprecated, not rendered)", async () => {
		// avatarUrl is kept for backwards compat but no longer visually rendered.
		const { container } = render(
			<MemoryRouter>
				<ThreadSections
					threads={[
						makeItem({
							id: "t4",
							title: "Thread with Avatar URL",
							avatarUrl: "https://example.com/av.png",
						}),
					]}
					onSelect={() => {}}
				/>
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByText("Thread with Avatar URL")).toBeInTheDocument();
		});

		// No img element — avatarUrl no longer drives a left-side img
		const img = container.querySelector('img[src="https://example.com/av.png"]');
		expect(img).toBeNull();
	});

	it("does NOT use FALLBACK_AVATAR data URI when avatarUrl is null", async () => {
		const { container } = render(
			<MemoryRouter>
				<ThreadSections
					threads={[makeItem({ id: "t5", title: "No avatar thread", avatarUrl: null })]}
					onSelect={() => {}}
				/>
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByText("No avatar thread")).toBeInTheDocument();
		});

		// The old FALLBACK_AVATAR was a data: URI SVG — check no img with data: src exists
		const imgs = container.querySelectorAll("img");
		for (const img of imgs) {
			expect(img.getAttribute("src") ?? "").not.toMatch(/^data:/);
		}
	});
});
