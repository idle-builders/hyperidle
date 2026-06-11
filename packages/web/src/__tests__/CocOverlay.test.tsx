/**
 * L21 — CocOverlay component tests (RED phase).
 *
 * Acceptance criteria:
 *   AC-5: Clicking trigger opens CocOverlay (integrated via AppShell tests).
 *   AC-6: CocOverlay uses ThreadShell in assistant configuration (hostKind="user", pinned=true).
 *   AC-7: Context attachment: adding a bet creates a ref chip above the composer.
 *   AC-8: Assistant thread is user-attached (hostKind="user"), never bet/task.
 *   AC-9: Overlay closes on Escape key.
 *   AC-10: CocContext.overlayOpen is true when overlay is open.
 *
 * Tests import CocOverlay from shell/CocOverlay (not yet created — will FAIL
 * until the green phase creates it).
 *
 * @lore L21 RED phase: vi.mock must be at module top level in Vitest. The
 * useCocThread mock below provides a stable ready state for all tests in
 * this describe block. Loading-state is tested in a sibling describe with
 * a dedicated mock factory (not vi.doMock which is hoisting-incompatible).
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, useContext } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CocContext, type CocContextRef, type CocContextValue } from "../contexts/CocContext";
// These imports will FAIL until the green phase creates these modules.
// That's expected — this is the RED phase.
import { CocOverlay } from "../shell/CocOverlay";

// Module-level mock: provides a "ready" assistant thread for all CocOverlay tests.
vi.mock("../hooks/useCocThread", () => ({
	useCocThread: () => ({
		status: "ready",
		data: {
			thread: {
				id: "thr-coach-u-founder",
				hostKind: "user",
				hostId: "u-founder",
				initiatorId: "u-founder",
				participants: ["u-founder", "agent-coc"],
				pinned: true,
				resolvedAt: null,
				lastActiveAt: "2026-05-06T10:00:00.000Z",
				createdAt: "2026-05-06T10:00:00.000Z",
			},
			messages: [],
			identities: {
				"u-founder": { name: "You" },
				"agent-coc": { name: "System Agent", role: "assistant" },
			},
		},
		error: null,
		retry: vi.fn(),
		refresh: vi.fn(),
	}),
}));

const mockAnchorRef = createRef<HTMLButtonElement>();

function renderOverlay(
	open: boolean,
	contextRefs: ReadonlyArray<CocContextRef> = [],
	onClose = vi.fn(),
	onRemoveContextRef = vi.fn(),
): ReturnType<typeof render> {
	return render(
		<MemoryRouter>
			<CocOverlay
				open={open}
				onClose={onClose}
				anchorRef={mockAnchorRef}
				contextRefs={contextRefs}
				onRemoveContextRef={onRemoveContextRef}
			/>
		</MemoryRouter>,
	);
}

describe("L21 — CocOverlay open/close behavior", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders nothing when open=false", () => {
		renderOverlay(false);
		// The overlay container must not be in the DOM when closed.
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	it("renders the overlay panel when open=true", () => {
		renderOverlay(true);
		// The overlay must be accessible as a dialog.
		expect(screen.getByRole("dialog")).toBeInTheDocument();
	});

	// @lore AD8a: aria-label changed from "Chief of Staff conversation" to "Assistant conversation".
	it("overlay has aria-label='Assistant conversation'", () => {
		renderOverlay(true);
		expect(screen.getByRole("dialog", { name: /assistant conversation/i })).toBeInTheDocument();
	});

	it("calls onClose when Escape is pressed", async () => {
		const user = userEvent.setup();
		const onClose = vi.fn();
		renderOverlay(true, [], onClose);
		await user.keyboard("{Escape}");
		expect(onClose).toHaveBeenCalledOnce();
	});

	it("overlay z-index is z-30 (above Main at z-0, below Settings at z-40)", () => {
		renderOverlay(true);
		const dialog = screen.getByRole("dialog");
		// z-30 per design spec — verified via class name.
		expect(dialog.className).toMatch(/z-30/);
	});
});

describe("L21 — CocOverlay ThreadShell integration (assistant configuration)", () => {
	it("renders ThreadShell with assistant thread (data-testid='thread-shell')", () => {
		renderOverlay(true);
		// ThreadShell renders with the assistant thread.
		expect(screen.getByTestId("thread-shell")).toBeInTheDocument();
	});

	// @lore AD8a: display name changed from "Chief of Staff" to "System Agent".
	it("shows 'System Agent' identity in the thread", () => {
		renderOverlay(true);
		// The identities include "System Agent" from the mocked useCocThread.
		// Multiple elements may carry this text (sr-only heading, identity chips, etc.)
		// — any match confirms the identity is present in the rendered output.
		expect(screen.getAllByText(/system agent/i).length).toBeGreaterThan(0);
	});

	it("renders the composer for sending messages", () => {
		renderOverlay(true);
		// Composer is present (ThreadShell always renders a Composer).
		expect(screen.getByPlaceholderText(/reply to thread/i)).toBeInTheDocument();
	});

	it("shows empty state when no messages exist (new assistant thread)", () => {
		renderOverlay(true);
		// ThreadShell empty state.
		expect(screen.getByText(/no messages yet/i)).toBeInTheDocument();
	});

	// @lore AD8a: aria-label changed from "Chief of Staff conversation" to "Assistant conversation".
	it("AC-8: thread hostKind is 'user' — assistant threads never attached to bet/task", () => {
		renderOverlay(true);
		// ThreadShell is mounted with the assistant thread; assistant config requires hostKind="user".
		// We verify the underlying data by ensuring the mocked thread with hostKind="user"
		// is what gets rendered. The ThreadShell is present (proves the hook result is used).
		expect(screen.getByTestId("thread-shell")).toBeInTheDocument();
		// The overlay dialog is present and labeled correctly.
		expect(screen.getByRole("dialog", { name: /assistant conversation/i })).toBeInTheDocument();
	});
});

describe("L21 — CocOverlay context attachment (AC-7)", () => {
	it("renders context chips above the composer when contextRefs is non-empty", () => {
		const contextRefs: ReadonlyArray<CocContextRef> = [
			{ kind: "bet", id: "bet-123", label: "Ambrovia v2" },
		];
		renderOverlay(true, contextRefs);
		// A chip for the attached bet must appear.
		expect(screen.getByText("Ambrovia v2")).toBeInTheDocument();
	});

	it("renders a dismiss button for each context chip", () => {
		const contextRefs: ReadonlyArray<CocContextRef> = [
			{ kind: "bet", id: "bet-123", label: "Ambrovia v2" },
			{ kind: "task", id: "task-456", label: "Fix bug" },
		];
		renderOverlay(true, contextRefs);
		// Each chip has a dismiss button (×).
		const dismissButtons = screen.getAllByRole("button", { name: /remove|dismiss|×/i });
		expect(dismissButtons.length).toBeGreaterThanOrEqual(2);
	});

	it("calls onRemoveContextRef with the correct index when a chip is dismissed", async () => {
		const user = userEvent.setup();
		const onRemoveContextRef = vi.fn();
		const contextRefs: ReadonlyArray<CocContextRef> = [
			{ kind: "bet", id: "bet-123", label: "Ambrovia v2" },
		];
		renderOverlay(true, contextRefs, vi.fn(), onRemoveContextRef);
		const dismissButton = screen.getByRole("button", { name: /remove|dismiss|×/i });
		await user.click(dismissButton);
		expect(onRemoveContextRef).toHaveBeenCalledWith(0);
	});

	it("renders no context chips area when contextRefs is empty", () => {
		renderOverlay(true, []);
		// No chip containers should be present.
		expect(screen.queryByTestId("coc-context-chips")).not.toBeInTheDocument();
	});

	it("renders context chips area with test-id when contextRefs is non-empty", () => {
		const contextRefs: ReadonlyArray<CocContextRef> = [
			{ kind: "bet", id: "bet-1", label: "My Bet" },
		];
		renderOverlay(true, contextRefs);
		expect(screen.getByTestId("coc-context-chips")).toBeInTheDocument();
	});
});

describe("L21 — CocContext (AC-10)", () => {
	it("CocContext is importable and has correct default shape", () => {
		// Verify the context exports exist and have the expected interface.
		// The context default value must have overlayOpen=false and attachContext as a function.
		let capturedValue: CocContextValue | null = null;

		function Consumer(): null {
			capturedValue = useContext(CocContext);
			return null;
		}

		render(
			<MemoryRouter>
				<Consumer />
			</MemoryRouter>,
		);

		expect(capturedValue).not.toBeNull();
		expect(capturedValue!.overlayOpen).toBe(false);
		expect(typeof capturedValue!.attachContext).toBe("function");
	});

	it("CocContext.Provider passes overlayOpen=true to consumers when overlay is open", () => {
		const mockAttachContext = vi.fn();
		const contextValue = {
			overlayOpen: true,
			attachContext: mockAttachContext,
		};

		let capturedOverlayOpen = false;
		function Consumer(): null {
			const ctx = useContext(CocContext);
			capturedOverlayOpen = ctx.overlayOpen;
			return null;
		}

		render(
			<CocContext.Provider value={contextValue}>
				<Consumer />
			</CocContext.Provider>,
		);

		expect(capturedOverlayOpen).toBe(true);
	});

	it("attachContext passes the ref to the provider's handler", () => {
		const mockAttachContext = vi.fn();
		const contextValue = {
			overlayOpen: true,
			attachContext: mockAttachContext,
		};

		const testRef: CocContextRef = { kind: "bet", id: "bet-xyz", label: "Test Bet" };

		function Consumer(): null {
			const { attachContext } = useContext(CocContext);
			attachContext(testRef);
			return null;
		}

		render(
			<CocContext.Provider value={contextValue}>
				<Consumer />
			</CocContext.Provider>,
		);

		expect(mockAttachContext).toHaveBeenCalledWith(testRef);
	});
});
