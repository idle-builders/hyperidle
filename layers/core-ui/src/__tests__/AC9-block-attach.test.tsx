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
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AssistantContextRef } from "../contexts/AssistantContext";
import { AssistantOverlay } from "../shell/AssistantOverlay";

vi.mock("../hooks/useAssistantThread", () => ({
	useAssistantThread: () => ({
		status: "ready",
		data: {
			thread: {
				id: "thr-assistant",
				hostKind: "user",
				hostId: "u-founder",
				initiatorId: "u-founder",
				participants: ["u-founder", "agent-assistant"],
				pinned: true,
				resolvedAt: null,
				lastActiveAt: "2026-09-02T10:00:00.000Z",
				createdAt: "2026-09-02T10:00:00.000Z",
			},
			messages: [],
			identities: {
				"u-founder": { name: "You" },
				"agent-assistant": { name: "Assistant", role: "assistant" },
			},
		},
		error: null,
		retry: vi.fn(),
		refresh: vi.fn(),
	}),
}));

vi.mock("../hooks/useCurrentUser", () => ({
	useCurrentUser: () => ({
		user: { id: "u-founder", name: "Founder", email: "x@x.com", avatarUrl: null, teamId: "team-1" },
		status: "ready",
		error: null,
		retry: vi.fn(),
	}),
}));

const mockApiFetch = vi.fn();
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
			// Thread message send succeeds
			return Promise.resolve({ ok: true, text: async () => "" });
		});
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
		expect(body.parentId).toBe("thr-assistant");
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

		// Find the thread message POST
		const messageCalls = mockApiFetch.mock.calls.filter((args: unknown[]) =>
			(args[0] as string).includes("/api/threads/"),
		);
		expect(messageCalls).toHaveLength(1);

		const [, msgOpts] = messageCalls[0]!;
		const msgBody = JSON.parse((msgOpts as { body: string }).body) as {
			payload?: { refs?: unknown[] };
		};
		// refs must be absent or empty — no pending_block wire ref
		const refs = msgBody.payload?.refs;
		expect(refs === undefined || refs.length === 0).toBe(true);
	});
});
