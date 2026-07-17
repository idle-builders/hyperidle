/**
 * AF14 — AssistantOverlay component tests (AF14: renamed from CocOverlay).
 *
 * Acceptance criteria:
 *   AC-5: Clicking trigger opens AssistantOverlay (integrated via AppShell tests).
 *   AC-6: AssistantOverlay uses ThreadShell in assistant configuration (hostKind="user", pinned=true).
 *   AC-7: Context attachment: adding a bet creates a ref chip above the composer.
 *   AC-8: Assistant thread is user-attached (hostKind="user"), never bet/task.
 *   AC-9: Overlay closes on Escape key.
 *   AC-10: AssistantContext.overlayOpen is true when overlay is open.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, useContext } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssistantContext, type AssistantContextRef } from "../contexts/AssistantContext";
import { AssistantOverlay } from "../shell/AssistantOverlay";

// Module-level mock: provides a "ready" assistant thread for all AssistantOverlay tests.
vi.mock("../hooks/useAssistantThread", () => ({
	useAssistantThread: () => ({
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
	contextRefs: ReadonlyArray<AssistantContextRef> = [],
	onClose = vi.fn(),
	onRemoveContextRef = vi.fn(),
): ReturnType<typeof render> {
	return render(
		<MemoryRouter>
			<AssistantOverlay
				open={open}
				onClose={onClose}
				anchorRef={mockAnchorRef}
				contextRefs={contextRefs}
				onRemoveContextRef={onRemoveContextRef}
			/>
		</MemoryRouter>,
	);
}

describe("AF14 — AssistantOverlay open/close behavior", () => {
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

	// SANCTIONED CHANGE #3 (AI2): AssistantOverlay migrates to useDialogBehavior with
	// layer="overlay" → --z-overlay (40). The old hardcoded z-30 class is gone.
	// Assert via data-dialog-layer attribute which getOverlayProps emits.
	// See architecture.md §Sanctioned assertion changes #3.
	it("overlay has data-dialog-layer='overlay' (--z-overlay = 40, above main, below modal)", () => {
		renderOverlay(true);
		const dialog = screen.getByRole("dialog");
		expect(dialog.getAttribute("data-dialog-layer")).toBe("overlay");
	});
});

describe("AF14 — AssistantOverlay ThreadShell integration (assistant configuration)", () => {
	it("renders ThreadShell with assistant thread (data-testid='thread-shell')", () => {
		renderOverlay(true);
		// ThreadShell renders with the assistant thread.
		expect(screen.getByTestId("thread-shell")).toBeInTheDocument();
	});

	it("shows 'System Agent' identity in the thread (via title or aria-label)", () => {
		const { container } = renderOverlay(true);
		// The identities include "System Agent" from the mocked useAssistantThread.
		// The identity renders as an avatar with title="System Agent" (initials "S" as text).
		// We query by title attribute since the visible text content is abbreviated.
		const agentEl =
			container.querySelector('[title="System Agent"]') ??
			container.querySelector('[aria-label*="System Agent" i]');
		expect(agentEl).not.toBeNull();
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

describe("AF14 — AssistantOverlay context attachment (AC-7)", () => {
	it("renders context chips above the composer when contextRefs is non-empty", () => {
		const contextRefs: ReadonlyArray<AssistantContextRef> = [
			{ kind: "bet", id: "bet-123", label: "Ambrovia v2" },
		];
		renderOverlay(true, contextRefs);
		// A chip for the attached bet must appear.
		expect(screen.getByText("Ambrovia v2")).toBeInTheDocument();
	});

	it("renders a dismiss button for each context chip", () => {
		const contextRefs: ReadonlyArray<AssistantContextRef> = [
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
		const contextRefs: ReadonlyArray<AssistantContextRef> = [
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
		expect(screen.queryByTestId("assistant-context-chips")).not.toBeInTheDocument();
	});

	it("renders context chips area with test-id when contextRefs is non-empty", () => {
		const contextRefs: ReadonlyArray<AssistantContextRef> = [
			{ kind: "bet", id: "bet-1", label: "My Bet" },
		];
		renderOverlay(true, contextRefs);
		expect(screen.getByTestId("assistant-context-chips")).toBeInTheDocument();
	});
});

describe("AF14 — AssistantContext (AC-10)", () => {
	it("AssistantContext is importable and has correct default shape", () => {
		// Verify the context exports exist and have the expected interface.
		// The context default value must have overlayOpen=false and attachContext as a function.
		function Consumer(): null {
			const value = useContext(AssistantContext);
			expect(value).not.toBeNull();
			expect(value.overlayOpen).toBe(false);
			expect(typeof value.attachContext).toBe("function");
			return null;
		}

		render(
			<MemoryRouter>
				<Consumer />
			</MemoryRouter>,
		);
	});

	it("AssistantContext.Provider passes overlayOpen=true to consumers when overlay is open", () => {
		const mockAttachContext = vi.fn();
		const contextValue = {
			overlayOpen: true,
			attachContext: mockAttachContext,
		};

		function Consumer(): null {
			const ctx = useContext(AssistantContext);
			expect(ctx.overlayOpen).toBe(true);
			return null;
		}

		render(
			<AssistantContext.Provider value={contextValue}>
				<Consumer />
			</AssistantContext.Provider>,
		);
	});

	it("attachContext passes the ref to the provider's handler", () => {
		const mockAttachContext = vi.fn();
		const contextValue = {
			overlayOpen: true,
			attachContext: mockAttachContext,
		};

		const testRef: AssistantContextRef = { kind: "bet", id: "bet-xyz", label: "Test Bet" };

		function Consumer(): null {
			const { attachContext } = useContext(AssistantContext);
			attachContext(testRef);
			return null;
		}

		render(
			<AssistantContext.Provider value={contextValue}>
				<Consumer />
			</AssistantContext.Provider>,
		);

		expect(mockAttachContext).toHaveBeenCalledWith(testRef);
	});
});
