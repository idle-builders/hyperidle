/**
 * AC9 — Clicking "+" on a block creates a document parented to the thread.
 *
 * After the rewire:
 *   - AssistantContextRef gains kind:"pending_block" with { content, label }
 *   - On send, AssistantOverlay calls edit_document for each pending_block ref,
 *     with as:"artifact", parent:{kind:"thread", id}, format:"markdown", body = content.
 *   - pending_block refs do NOT appear in payload.refs of the thread message.
 *   - The document carries the block's content verbatim — editing the source
 *     afterwards leaves the item unchanged (no pointer, no rotting blockId).
 *
 * @lore BC3: re-pointed off the deleted `useAssistantThread` onto
 * `useThread`/`useThreads`/`useAgents`/`useCurrentUser`, same pattern as
 * `shell/__tests__/AH3-AssistantOverlay.notice.test.tsx`. The thread message
 * send itself no longer POSTs `/api/threads/<id>` — `sendToThread` in
 * `shell/AssistantOverlay.tsx` sends it via
 * `call("send_message", {threadId, text, refs, clientKey})`.
 *
 * @lore BC4: the document creation call moved off `apiFetch("/api/knowledge",
 * …)` onto `call("edit_document", …)` too — both calls now go through the
 * same mocked `call()` door (architecture.md §9.2).
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

describe("AC9 — pending_block on send creates a document, not a wire ref", () => {
	beforeEach(() => {
		callMock.mockImplementation((name: string) => {
			if (name === "send_message") {
				return Promise.resolve({ ok: true, data: { thread: { id: THREAD_ID } } });
			}
			if (name === "edit_document") {
				return Promise.resolve({
					ok: true,
					data: {
						document: { id: "ki-new-1" },
						ancestors: [],
						children: [],
						siblings: [],
						scopeName: "Factory",
					},
				});
			}
			return Promise.resolve({ ok: true, data: {} });
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("pending_block ref triggers edit_document with the thread as parent on send", async () => {
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

		// Find the document creation call
		const documentCalls = callMock.mock.calls.filter((args) => args[0] === "edit_document");
		expect(documentCalls).toHaveLength(1);

		const [, input] = documentCalls[0]! as [string, Record<string, unknown>];
		expect(input.as).toBe("artifact");
		expect(input.parent).toEqual({ kind: "thread", id: THREAD_ID });
		expect(input.title).toBe("Auth migration");
		expect(input.body).toBe("## Auth migration\n\nThis is the block content.");
		expect(input.format).toBe("markdown");
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
