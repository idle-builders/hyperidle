/**
 * AssistantOverlay — UI layout defect fixes.
 *
 * UI-138: Composer was invisible because ThreadShell had no flex-1 parent
 *         with a definite height — its h-full resolved to 0.
 * UI-139: Message list clipped mid-sentence for the same reason.
 * UI-140: Overlay showed two stacked "Assistant" headers — one from the
 *         overlay's own header bar, one from ThreadShell's hostBanner.
 *         hideHostBanner={true} removes ThreadShell's header.
 */

import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AssistantOverlay } from "../shell/AssistantOverlay";

vi.mock("../hooks/useAssistantThread", () => ({
	useAssistantThread: () => ({
		status: "ready",
		data: {
			thread: {
				id: "thr-ast-layout",
				hostKind: "user",
				hostId: "u-founder",
				initiatorId: "u-founder",
				participants: ["u-founder", "ast-1"],
				pinned: false,
				resolvedAt: null,
				lastActiveAt: "2026-08-01T10:00:00.000Z",
				createdAt: "2026-08-01T10:00:00.000Z",
			},
			messages: [],
			identities: {
				"u-founder": { name: "You" },
				"ast-1": { name: "Assistant", role: "assistant" },
			},
		},
		error: null,
		retry: vi.fn(),
		refresh: vi.fn(),
	}),
}));

const mockAnchorRef = createRef<HTMLButtonElement>();

function renderOverlay(): ReturnType<typeof render> {
	return render(
		<MemoryRouter>
			<AssistantOverlay
				open={true}
				onClose={vi.fn()}
				anchorRef={mockAnchorRef}
				contextRefs={[]}
				onRemoveContextRef={vi.fn()}
			/>
		</MemoryRouter>,
	);
}

describe("AssistantOverlay layout fixes", () => {
	it("UI-140: overlay bar contains no heading — ThreadShell banner is the only title", () => {
		renderOverlay();

		// The overlay's own bar used to have an <h2>Assistant</h2> which duplicated
		// ThreadShell's host banner. That h2 is now removed. The close button
		// is the only interactive element in the bar.
		const closeBtn = screen.getByRole("button", { name: /close assistant/i });
		expect(closeBtn).toBeInTheDocument();

		// No semantic headings — ThreadHostBanner renders non-heading text.
		const headings = screen.queryAllByRole("heading");
		expect(headings).toHaveLength(0);
	});

	it("UI-138/139: ThreadShell's inner content wrapper is flex-1 min-h-0", () => {
		renderOverlay();

		// ThreadShell is a Tier-3 shell: marker is data-ds-shell, not data-ds-component.
		const threadShellEl = document.querySelector("[data-ds-shell='ThreadShell']");
		expect(threadShellEl).not.toBeNull();

		// Its parent wrapper (added by UI-138 fix) should have flex-1 and min-h-0
		const wrapper = threadShellEl?.parentElement;
		expect(wrapper).not.toBeNull();
		expect(wrapper?.className).toContain("flex-1");
		expect(wrapper?.className).toContain("min-h-0");
	});

	it("UI-138/139: the outer overlay container itself is flex flex-col with height constraint", () => {
		renderOverlay();

		// The overlay dialog element
		const dialog = screen.getByRole("dialog", { name: /assistant conversation/i });
		expect(dialog.className).toContain("flex-col");
		// @lore UI-138/139: must be h-[70vh] (definite height), NOT max-h-[70vh].
		// max-h is a visual cap, not a CSS "definite" height, so ThreadShell h-full
		// resolves to content height and the composer renders off-screen.
		expect(dialog.className).toContain("h-[70vh]");
		expect(dialog.className).not.toContain("max-h-");
	});
});
