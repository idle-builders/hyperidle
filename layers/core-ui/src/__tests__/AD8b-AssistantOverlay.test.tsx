/**
 * AD8b — AssistantOverlay component tests (RED phase).
 *
 * AC-7: The overlay renders artifacts and review messages (not just plain
 *       text). The coverage below proves ThreadShell renders.
 *
 * AC-8: Sidebar trigger is labeled "Assistant" (verified via aria-label).
 *
 * AC-9: Context can be attached (chips render when contextRefs is non-empty).
 *
 * These tests import from the planned path AssistantOverlay (not CocOverlay).
 * They will FAIL until the green phase creates AssistantOverlay.tsx.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssistantContextRef } from "../contexts/AssistantContext";
import { AssistantOverlay } from "../shell/AssistantOverlay";

// Module-level mock: provides a "ready" assistant thread for all AssistantOverlay tests.
vi.mock("../hooks/useAssistantThread", () => ({
	useAssistantThread: () => ({
		status: "ready",
		data: {
			thread: {
				id: "thr-ast-u-founder",
				hostKind: "user",
				hostId: "u-founder",
				initiatorId: "u-founder",
				participants: ["u-founder", "ast-agent-id"],
				pinned: false,
				resolvedAt: null,
				lastActiveAt: "2026-06-09T10:00:00.000Z",
				createdAt: "2026-06-09T10:00:00.000Z",
			},
			messages: [],
			identities: {
				"u-founder": { name: "You" },
				"ast-agent-id": { name: "Assistant", role: "assistant" },
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

// ---------------------------------------------------------------------------
// AC-8: Overlay renders with "Assistant" label (not "Coach" or "Chief of Staff")
// ---------------------------------------------------------------------------

describe("AD8b — AssistantOverlay open/close", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders nothing when open=false", () => {
		renderOverlay(false);
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	it("renders the overlay panel when open=true", () => {
		renderOverlay(true);
		expect(screen.getByRole("dialog")).toBeInTheDocument();
	});

	it("overlay has aria-label containing 'assistant'", () => {
		renderOverlay(true);
		expect(screen.getByRole("dialog", { name: /assistant/i })).toBeInTheDocument();
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

// ---------------------------------------------------------------------------
// AC-7: ThreadShell renders the overlay's message thread.
// ---------------------------------------------------------------------------

describe("AD8b — AssistantOverlay message thread rendering", () => {
	it("renders ThreadShell when overlay is open", () => {
		renderOverlay(true);
		expect(screen.getByTestId("thread-shell")).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// AC-9: Context chips (unchanged from CocOverlay, now under AssistantContext)
// ---------------------------------------------------------------------------

describe("AD8b — AssistantOverlay context chips", () => {
	it("renders context chips when contextRefs is non-empty", () => {
		const contextRefs: ReadonlyArray<AssistantContextRef> = [
			{ kind: "task", id: "task-1", label: "Test Bet" },
		];
		renderOverlay(true, contextRefs);
		expect(screen.getByText("Test Bet")).toBeInTheDocument();
	});

	it("renders no context chips when contextRefs is empty", () => {
		renderOverlay(true, []);
		expect(screen.queryByTestId("assistant-context-chips")).not.toBeInTheDocument();
	});

	it("renders context chip container with correct data-testid", () => {
		const contextRefs: ReadonlyArray<AssistantContextRef> = [
			{ kind: "task", id: "task-1", label: "Fix bug" },
		];
		renderOverlay(true, contextRefs);
		expect(screen.getByTestId("assistant-context-chips")).toBeInTheDocument();
	});

	it("calls onRemoveContextRef when chip dismiss button is clicked", async () => {
		const user = userEvent.setup();
		const onRemoveContextRef = vi.fn();
		const contextRefs: ReadonlyArray<AssistantContextRef> = [
			{ kind: "task", id: "task-1", label: "My Bet" },
		];
		renderOverlay(true, contextRefs, vi.fn(), onRemoveContextRef);
		const dismissButton = screen.getByRole("button", { name: /remove|dismiss|×/i });
		await user.click(dismissButton);
		expect(onRemoveContextRef).toHaveBeenCalledWith(0);
	});
});
