/**
 * L18 — KnowledgeDetail block popover tests.
 *
 * AC coverage:
 *  - clicking a block's gutter opens the actions popover
 *  - selecting Discuss invokes the discuss handler
 *  - Escape closes the popover
 */

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KnowledgeDetail } from "../../pages/KnowledgeDetail";

vi.mock("../../shell/HostThreadSection", () => ({
	HostThreadSection: ({ prefill }: { prefill?: { blockId: string; blockExcerpt: string } }) => (
		<div data-testid="host-thread-section">
			{prefill && <div data-testid="host-thread-prefill-chip">Re: {prefill.blockExcerpt}</div>}
		</div>
	),
}));

// k1 is in LEGACY_DETAILS with content "JWT-based authentication..."
// which renders as a paragraph block in KnowledgeBody
function renderKnowledge(id = "k1"): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[`/knowledge/${id}`]}>
			<Routes>
				<Route path="/knowledge/:knowledgeId" element={<KnowledgeDetail />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("KnowledgeDetail block popover (L18)", () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it("clicking a block's gutter opens the actions popover", async () => {
		const user = userEvent.setup();
		renderKnowledge("k1"); // k1 has content that renders as blocks

		const blocks = document.querySelectorAll("[data-ds-component='block']");
		expect(blocks.length).toBeGreaterThan(0);

		const firstBlock = blocks[0] as HTMLElement;
		firstBlock.focus();
		await user.keyboard(" ");

		expect(screen.getByTestId("block-actions-popover")).toBeInTheDocument();
	});

	it("selecting Discuss invokes onDiscussBlock and shows prefill chip", async () => {
		const user = userEvent.setup();
		renderKnowledge("k1");

		const blocks = document.querySelectorAll("[data-ds-component='block']");
		const firstBlock = blocks[0] as HTMLElement;
		firstBlock.focus();
		await user.keyboard(" ");

		const discussButton = screen.getByRole("menuitem", { name: /discuss/i });
		await user.click(discussButton);

		// The prefill chip appears in the HostThreadSection mock
		expect(screen.getByTestId("host-thread-prefill-chip")).toBeInTheDocument();
	});

	it("Escape closes the popover", async () => {
		const user = userEvent.setup();
		renderKnowledge("k1");

		const blocks = document.querySelectorAll("[data-ds-component='block']");
		const firstBlock = blocks[0] as HTMLElement;
		firstBlock.focus();
		await user.keyboard(" ");

		expect(screen.getByTestId("block-actions-popover")).toBeInTheDocument();

		await user.keyboard("{Escape}");

		expect(screen.queryByTestId("block-actions-popover")).not.toBeInTheDocument();
	});
});
