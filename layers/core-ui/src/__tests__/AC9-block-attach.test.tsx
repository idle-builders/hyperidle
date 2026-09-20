/**
 * AC9 — Clicking "+" on a block creates a knowledge item parented to the thread.
 *
 * After the rewire:
 *   - AssistantContextRef gains kind:"pending_block" with { content, label }
 *   - On send, AssistantOverlay calls POST /api/knowledge for each pending_block ref,
 *     with parentKind:"thread", parentId:<threadId>, format:"markdown", body = content.
 *   - pending_block refs do NOT appear in payload.refs of the thread message.
 *   - The knowledge item carries the block's content verbatim — editing the source
 *     afterwards leaves the item unchanged (no pointer, no rotting blockId).
 *
 * @lore BC3: re-pointed off the deleted `useAssistantThread` onto
 * `useThread`/`useThreads`/`useAgents`/`useCurrentUser`, same pattern as
 * `shell/__tests__/AH3-AssistantOverlay.notice.test.tsx`. The thread message
 * send itself no longer POSTs `/api/threads/<id>` — `sendToThread` in
 * `shell/AssistantOverlay.tsx` sends it via
 * `call("send_message", {threadId, text, refs, clientKey})`. The knowledge
 * item creation (`POST /api/knowledge`) is untouched — that door still goes
 * through `apiFetch` directly (no `call()` door exists for it yet, per the
 * component's own `@lore artifacts-become-knowledge` note) — so `apiFetch`
 * stays mocked for that assertion.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AssistantContextRef } from "../contexts/AssistantContext";
import type { UseAgentsResult } from "../hooks/useAgents.js";
import type { UseCurrentUserResult } from "../hooks/useCurrentUser.js";
import type { UseThreadResult } from "../hooks/useThread.js";
import type { UseThreadsResult } from "../hooks/useThreads.js";
import { AssistantOverlay } from "../shell/AssistantOverlay";

const MY_USER_ID = "u-founder";
const MY_AGENT_ID = "agent-assistant";
const THREAD_ID = "thr-assistant";
const NOW_ISO = "2026-09-02T10:00:00.000Z";

const BASE_THREAD = {
	id: THREAD_ID,
	hostKind: "agent" as const,
	hostId: MY_AGENT_ID,
	initiatorId: MY_USER_ID,
	members: [MY_USER_ID, MY_AGENT_ID],
	title: null,
	computedTitle: "Assistant",
	pinned: true,
	resolvedAt: null,
	deletedAt: null,
	lastActiveAt: NOW_ISO,
	createdAt: NOW_ISO,
};

vi.mock("../hooks/useAgents.js", () => ({
	useAgents: vi.fn(),
}));
vi.mock("../hooks/useCurrentUser", () => ({
	useCurrentUser: vi.fn(),
}));
vi.mock("../hooks/useThread.js", () => ({
	useThread: vi.fn(),
}));
vi.mock("../hooks/useThreads.js", () => ({
	useThreads: vi.fn(),
}));

const mockApiFetch = vi.fn();
vi.mock("../services/api-fetch.js", () => ({
	apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const callMock = vi.fn();
vi.mock("../services/call.js", () => ({
	call: (...args: unknown[]) => callMock(...args),
}));

import { useAgents } from "../hooks/useAgents.js";
import { useCurrentUser } from "../hooks/useCurrentUser.js";
import { useThread } from "../hooks/useThread.js";
import { useThreads } from "../hooks/useThreads.js";

function mockReadyThread(): void {
	vi.mocked(useCurrentUser).mockReturnValue({
		user: {
			id: MY_USER_ID,
			name: "Founder",
			email: "x@x.com",
			avatarUrl: null,
			teamId: "team-1",
		},
		status: "ready",
		error: null,
		retry: vi.fn(),
	} as UseCurrentUserResult);
	vi.mocked(useAgents).mockReturnValue({
		agents: [{ id: MY_AGENT_ID, ownerUserId: MY_USER_ID } as UseAgentsResult["agents"][number]],
		loading: false,
		error: null,
		refetch: vi.fn(),
	} as UseAgentsResult);
	vi.mocked(useThreads).mockReturnValue({
		status: "ready",
		threads: [{ ...BASE_THREAD, hasUnresolvedReview: false, lastMessagePreview: null }],
		error: null,
		retry: vi.fn(),
	} as UseThreadsResult);
	vi.mocked(useThread).mockReturnValue({
		status: "ready",
		data: {
			thread: BASE_THREAD,
			members: [
				{ id: MY_USER_ID, name: "You", role: "human", isAgent: false },
				{ id: MY_AGENT_ID, name: "Assistant", role: "assistant", isAgent: true },
			],
			messages: [],
			headMessageId: null,
			hostTitle: "Assistant",
		},
		error: null,
		refresh: vi.fn(),
	} as UseThreadResult);
}

function renderOverlay(
	contextRefs: ReadonlyArray<AssistantContextRef>,
	onRemoveContextRef = vi.fn(),
): ReturnType<typeof render> {
	mockReadyThread();
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

describe("AC9 — pending_block on send creates a knowledge item, not a wire ref", () => {
	beforeEach(() => {
		// Knowledge item creation succeeds
		mockApiFetch.mockImplementation((url: string, opts?: { method?: string }) => {
			if (url.includes("/api/knowledge") && opts?.method === "POST") {
				return Promise.resolve({
					ok: true,
					json: async () => ({ id: "ki-new-1" }),
					text: async () => JSON.stringify({ id: "ki-new-1" }),
				});
			}
			return Promise.resolve({ ok: true, text: async () => "" });
		});
		// The thread message send — always resolves to the existing thread.
		callMock.mockResolvedValue({ ok: true, data: { thread: { id: THREAD_ID } } });
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("pending_block ref triggers POST /api/knowledge with thread as parent on send", async () => {
		const user = userEvent.setup();
		const pendingBlock: AssistantContextRef = {
			kind: "pending_block",
			content: "## Auth migration\n\nThis is the block content.",
			label: "Auth migration",
		};
		renderOverlay([pendingBlock]);

		const composer = screen.getByPlaceholderText(/reply to thread/i);
		await user.click(composer);
		await user.type(composer, "Attaching this block");
		await user.keyboard("{Meta>}{Enter}{/Meta}");

		// Find the knowledge creation call
		const knowledgeCalls = mockApiFetch.mock.calls.filter((args: unknown[]) => {
			const url = args[0] as string;
			const opts = args[1] as { method?: string } | undefined;
			return url.includes("/api/knowledge") && opts?.method === "POST";
		});
		expect(knowledgeCalls).toHaveLength(1);

		const [, opts] = knowledgeCalls[0]!;
		const body = JSON.parse((opts as { body: string }).body) as Record<string, unknown>;
		expect(body.parentKind).toBe("thread");
		expect(body.parentId).toBe(THREAD_ID);
		expect(body.body).toBe("## Auth migration\n\nThis is the block content.");
		expect(body.format).toBe("markdown");
	});

	it("pending_block ref does NOT appear in thread message payload.refs", async () => {
		const user = userEvent.setup();
		const pendingBlock: AssistantContextRef = {
			kind: "pending_block",
			content: "Some block content",
			label: "Block label",
		};
		renderOverlay([pendingBlock]);

		const composer = screen.getByPlaceholderText(/reply to thread/i);
		await user.click(composer);
		await user.type(composer, "Hello");
		await user.keyboard("{Meta>}{Enter}{/Meta}");

		// Find the send_message call.
		const messageCalls = callMock.mock.calls.filter(
			(args: unknown[]) => args[0] === "send_message",
		);
		expect(messageCalls).toHaveLength(1);

		const [, input] = messageCalls[0]! as [string, { refs?: unknown[] }];
		// refs must be absent or empty — no pending_block wire ref
		const refs = input.refs;
		expect(refs === undefined || refs.length === 0).toBe(true);
	});
});
