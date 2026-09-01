/**
 * AF14 — AssistantOverlay block ref integration tests (renamed from CocOverlay.block-ref).
 *
 * Tests:
 *   - Block ref chip renders correctly in the overlay (kind, label)
 *   - ContextChip key generation handles block refs (no crash with blockId)
 *   - Wire serialization: block ref sends correct shape over the API
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AssistantContextRef } from "../contexts/AssistantContext";
import { AssistantOverlay } from "../shell/AssistantOverlay";

// Module-level mock for useAssistantThread
vi.mock("../hooks/useAssistantThread", () => ({
	useAssistantThread: () => ({
		status: "ready",
		data: {
			thread: {
				id: "thr-coach",
				hostKind: "user",
				hostId: "u-founder",
				initiatorId: "u-founder",
				participants: ["u-founder", "agent-coc"],
				pinned: true,
				resolvedAt: null,
				lastActiveAt: "2026-05-31T10:00:00.000Z",
				createdAt: "2026-05-31T10:00:00.000Z",
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

// Mock apiFetch to capture what payload gets sent
const mockApiFetch = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
vi.mock("../services/api-fetch.js", () => ({
	apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

function renderOverlay(
	contextRefs: ReadonlyArray<AssistantContextRef>,
	onRemoveContextRef = vi.fn(),
) {
	return render(
		<MemoryRouter>
			<AssistantOverlay
				open={true}
				onClose={vi.fn()}
				contextRefs={contextRefs}
				onRemoveContextRef={onRemoveContextRef}
			/>
		</MemoryRouter>,
	);
}

describe("AF14 — AssistantOverlay block ref chip rendering (AC-5)", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("renders a chip for a block ref with kind='block'", () => {
		const blockRef: AssistantContextRef = {
			kind: "block",
			blockId: "blk:v1:abc",
			hostKind: "task",
			hostId: "task-123",
			label: "Bet pitch paragraph 1",
		};
		renderOverlay([blockRef]);
		// The chip area should appear
		expect(screen.getByTestId("assistant-context-chips")).toBeInTheDocument();
		// The label should be visible
		expect(screen.getByText("Bet pitch paragraph 1")).toBeInTheDocument();
	});

	it("renders 'block' kind label in the chip", () => {
		const blockRef: AssistantContextRef = {
			kind: "block",
			blockId: "blk:v1:xyz",
			hostKind: "knowledge_item",
			hostId: "k-001",
			label: "Some paragraph",
		};
		renderOverlay([blockRef]);
		// The chip kind label should read "block"
		expect(screen.getByText("block")).toBeInTheDocument();
	});

	it("renders multiple chips for mixed entity and block refs", () => {
		const refs: ReadonlyArray<AssistantContextRef> = [
			{ kind: "task", id: "task-1", label: "Bet Alpha" },
			{
				kind: "block",
				blockId: "blk:v1:p1",
				hostKind: "task",
				hostId: "task-1",
				label: "First paragraph",
			},
		];
		renderOverlay(refs);
		expect(screen.getByText("Bet Alpha")).toBeInTheDocument();
		expect(screen.getByText("First paragraph")).toBeInTheDocument();
	});

	it("dismiss button for block ref chip calls onRemoveContextRef", async () => {
		const user = userEvent.setup();
		const onRemove = vi.fn();
		const blockRef: AssistantContextRef = {
			kind: "block",
			blockId: "blk:v1:abc",
			hostKind: "task",
			hostId: "task-1",
			label: "A block",
		};
		renderOverlay([blockRef], onRemove);
		const dismissBtn = screen.getByRole("button", { name: /remove a block/i });
		await user.click(dismissBtn);
		expect(onRemove).toHaveBeenCalledWith(0);
	});
});

describe("AF14 — AssistantOverlay wire serialization for block refs (AC-5)", () => {
	beforeEach(() => {
		mockApiFetch.mockResolvedValue({ ok: true, text: async () => "" });
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("sends block ref shape (kind/blockId/hostKind/hostId) when message has block context", async () => {
		const user = userEvent.setup();
		const blockRef: AssistantContextRef = {
			kind: "block",
			blockId: "blk:v1:theblock",
			hostKind: "task",
			hostId: "bet-777",
			label: "A paragraph",
		};
		renderOverlay([blockRef]);

		// Type and submit a message (Composer uses Cmd+Enter to submit)
		const composer = screen.getByPlaceholderText(/reply to thread/i);
		await user.click(composer);
		await user.type(composer, "Testing block ref");
		await user.keyboard("{Meta>}{Enter}{/Meta}");

		// Verify the API call was made with the correct block ref shape in refs
		expect(mockApiFetch).toHaveBeenCalled();
		const callArgs = mockApiFetch.mock.calls[0]!;
		const body = JSON.parse(callArgs[1].body as string) as {
			payload: { refs: unknown[] };
		};
		const refs = body.payload.refs;
		expect(refs).toHaveLength(1);
		expect(refs[0]).toEqual({
			kind: "block",
			blockId: "blk:v1:theblock",
			hostKind: "task",
			hostId: "bet-777",
		});
	});

	it("sends entity ref shape (kind/id) for entity context refs", async () => {
		const user = userEvent.setup();
		const entityRef: AssistantContextRef = {
			kind: "task",
			id: "bet-999",
			label: "My Bet",
		};
		renderOverlay([entityRef]);

		const composer = screen.getByPlaceholderText(/reply to thread/i);
		await user.click(composer);
		await user.type(composer, "Entity ref test");
		await user.keyboard("{Meta>}{Enter}{/Meta}");

		expect(mockApiFetch).toHaveBeenCalled();
		const callArgs = mockApiFetch.mock.calls[0]!;
		const body = JSON.parse(callArgs[1].body as string) as {
			payload: { refs: unknown[] };
		};
		const refs = body.payload.refs;
		expect(refs).toHaveLength(1);
		expect(refs[0]).toEqual({ kind: "task", id: "bet-999" });
	});
});
