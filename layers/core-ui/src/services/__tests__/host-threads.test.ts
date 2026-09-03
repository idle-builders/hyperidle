/**
 * L18 — host-threads.ts service tests.
 *
 * AC coverage:
 *  - resolveOrCreateHostThread round-trips on each host kind (task, knowledge_item)
 *  - resolveOrCreateHostThread idempotency: returns existing thread id when already exists
 *  - postPlainHostMessage forwards blockId in payload when provided
 *  - postPlainHostMessage works without blockId (plain message)
 *
 * @lore artifacts-become-knowledge: "artifact" removed from host kind coverage —
 * artifact is no longer a valid HostKind; threads hang off knowledge items instead.
 */

import type { AnchorRef } from "@hyperidle/domain-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BlockId } from "../../block/types.js";
import {
	postPlainHostMessage,
	postVerdictHostMessage,
	resolveOrCreateHostThread,
} from "../../services/host-threads";

// Mock apiFetch so host-threads.ts does not call global.fetch directly.
// Header injection is covered by api-fetch.test.ts; these tests focus on
// service logic (URLs, payloads, error handling).
vi.mock("../../services/api-fetch.js", () => ({
	apiFetch: vi.fn(),
}));

const EXISTING_THREAD_ID = "thread-existing-001";
const CREATED_THREAD_ID = "thread-created-002";
const FOUNDER_ID = "u-founder";
const AGENT_ID = "agent-unassigned";

function makeThreadListResponse(threadList: Array<{ id: string }>): Response {
	return {
		ok: true,
		json: () => Promise.resolve({ threads: threadList }),
	} as unknown as Response;
}

function makeCreateThreadResponse(id: string): Response {
	return {
		ok: true,
		json: () => Promise.resolve({ thread: { id } }),
	} as unknown as Response;
}

function makePostMessageResponse(): Response {
	return {
		ok: true,
		json: () => Promise.resolve({ message: { id: "msg-001" } }),
	} as unknown as Response;
}

describe("resolveOrCreateHostThread (L18)", () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		const { apiFetch } = await import("../../services/api-fetch.js");
		fetchSpy = vi.mocked(apiFetch);
		fetchSpy.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	for (const hostKind of ["task", "task", "knowledge_item"] as const) {
		it(`resolveOrCreateHostThread round-trips on host_kind='${hostKind}'`, async () => {
			fetchSpy.mockResolvedValueOnce(makeThreadListResponse([{ id: EXISTING_THREAD_ID }]));

			const result = await resolveOrCreateHostThread(
				hostKind,
				`${hostKind}-host-1`,
				FOUNDER_ID,
				AGENT_ID,
			);

			expect(result).toBe(EXISTING_THREAD_ID);
			expect(fetchSpy).toHaveBeenCalledOnce();
			const [url] = fetchSpy.mock.calls[0] as [string, RequestInit | undefined];
			expect(url).toContain(`host_kind=${hostKind}`);
			expect(url).toContain(`host_id=${hostKind}-host-1`);
		});
	}

	it("creates a new thread when none exists and returns its id", async () => {
		fetchSpy
			.mockResolvedValueOnce(makeThreadListResponse([]))
			.mockResolvedValueOnce(makeCreateThreadResponse(CREATED_THREAD_ID));

		const result = await resolveOrCreateHostThread("task", "bet-new-1", FOUNDER_ID, AGENT_ID);

		expect(result).toBe(CREATED_THREAD_ID);
		expect(fetchSpy).toHaveBeenCalledTimes(2);
		const [, postOptions] = fetchSpy.mock.calls[1] as [string, RequestInit];
		const body = JSON.parse(postOptions.body as string) as {
			hostKind: string;
			hostId: string;
			participants: string[];
		};
		expect(body.hostKind).toBe("task");
		expect(body.hostId).toBe("bet-new-1");
		expect(body.participants).toContain(FOUNDER_ID);
	});

	it("idempotent: returns existing thread id when GET returns >=1 thread", async () => {
		fetchSpy.mockResolvedValueOnce(makeThreadListResponse([{ id: EXISTING_THREAD_ID }]));

		const result = await resolveOrCreateHostThread("knowledge_item", "ki-1", FOUNDER_ID, AGENT_ID);

		expect(result).toBe(EXISTING_THREAD_ID);
		// Only one fetch — no POST needed
		expect(fetchSpy).toHaveBeenCalledOnce();
	});
});

describe("postPlainHostMessage (L18)", () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		const { apiFetch } = await import("../../services/api-fetch.js");
		fetchSpy = vi.mocked(apiFetch);
		fetchSpy.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("POSTs a plain message to the correct endpoint", async () => {
		fetchSpy.mockResolvedValueOnce(makePostMessageResponse());

		const threadId = "thread-abc";
		const text = "This is a test message.";
		const clientKey = "client-key-001";

		await postPlainHostMessage(threadId, text, clientKey);

		expect(fetchSpy).toHaveBeenCalledOnce();
		const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
		expect(url).toContain(`/api/threads/${threadId}/messages`);
		expect(options.method).toBe("POST");

		const body = JSON.parse(options.body as string) as {
			type: string;
			payload: { text: string; blockId?: string; spotLabel?: string; refs?: unknown[] };
			clientKey: string;
		};
		expect(body.type).toBe("plain");
		expect(body.payload.text).toBe(text);
		expect(body.clientKey).toBe(clientKey);
		expect(body.payload.blockId).toBeUndefined();
	});

	it("forwards an AL4 anchor as blockId + spotLabel + artifact ref", async () => {
		fetchSpy.mockResolvedValueOnce(makePostMessageResponse());

		const threadId = "thread-anchor";
		const text = "Discussing this line";
		const clientKey = "client-key-anchor";
		const anchor: AnchorRef = {
			artifactId: "artifact:code:1",
			blockId: "block-abc" as BlockId,
			spotLabel: "PromoField.tsx:118",
		};

		await postPlainHostMessage(threadId, text, clientKey, undefined, anchor);

		expect(fetchSpy).toHaveBeenCalledOnce();
		const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(options.body as string) as {
			type: string;
			payload: { text: string; blockId?: string; spotLabel?: string; refs?: unknown[] };
			clientKey: string;
		};
		expect(body.payload.blockId).toBe(anchor.blockId);
		expect(body.payload.spotLabel).toBe(anchor.spotLabel);
		expect(body.payload.refs).toEqual([{ kind: "artifact", id: anchor.artifactId }]);
		expect(body.payload.text).toBe(text);
	});

	it("forwards blockId in payload when provided (legacy path)", async () => {
		fetchSpy.mockResolvedValueOnce(makePostMessageResponse());

		const threadId = "thread-xyz";
		const text = "Discussing this block";
		const clientKey = "client-key-002";
		const blockId = "block-id-abc";

		await postPlainHostMessage(threadId, text, clientKey, blockId);

		expect(fetchSpy).toHaveBeenCalledOnce();
		const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(options.body as string) as {
			type: string;
			payload: { text: string; blockId?: string };
		};
		expect(body.payload.blockId).toBe(blockId);
		expect(body.payload.text).toBe(text);
	});

	it("throws when the server returns a non-ok response", async () => {
		fetchSpy.mockResolvedValueOnce({
			ok: false,
			status: 500,
			json: () => Promise.resolve({ error: "Internal server error" }),
		} as unknown as Response);

		await expect(postPlainHostMessage("thread-fail", "some text", "key-fail")).rejects.toThrow();
	});
});

describe("postVerdictHostMessage (AM1)", () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		const { apiFetch } = await import("../../services/api-fetch.js");
		fetchSpy = vi.mocked(apiFetch);
		fetchSpy.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("POSTs a verdict message with type:verdict, decision, and resolvesMessageId", async () => {
		fetchSpy.mockResolvedValueOnce(makePostMessageResponse());

		const threadId = "thread-verdict";
		const clientKey = "client-key-verdict";

		await postVerdictHostMessage(threadId, "approve", "review-msg-7", clientKey);

		expect(fetchSpy).toHaveBeenCalledOnce();
		const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
		expect(url).toContain(`/api/threads/${threadId}/messages`);
		expect(options.method).toBe("POST");

		const body = JSON.parse(options.body as string) as {
			type: string;
			payload: { decision: string; resolvesMessageId: string };
			clientKey: string;
		};
		expect(body.type).toBe("verdict");
		expect(body.payload.decision).toBe("approve");
		expect(body.payload.resolvesMessageId).toBe("review-msg-7");
		expect(body.clientKey).toBe(clientKey);
	});

	it("returns the server outcome ('ok') on 2xx", async () => {
		fetchSpy.mockResolvedValueOnce(makePostMessageResponse());
		const outcome = await postVerdictHostMessage("t", "reject", "rmid", "ck-reject-001");
		expect(outcome).toBe("ok");
	});

	it("returns 'race' on a 409 verdict_race response (does not throw)", async () => {
		fetchSpy.mockResolvedValueOnce({
			ok: false,
			status: 409,
			json: () => Promise.resolve({ code: "verdict_race" }),
		} as unknown as Response);

		const outcome = await postVerdictHostMessage("t", "approve", "rmid", "ck-race-0001");
		expect(outcome).toBe("race");
	});

	it("returns 'forbidden' on a 403 verdict_authorization response (does not throw)", async () => {
		fetchSpy.mockResolvedValueOnce({
			ok: false,
			status: 403,
			json: () => Promise.resolve({ code: "verdict_authorization" }),
		} as unknown as Response);

		const outcome = await postVerdictHostMessage("t", "approve", "rmid", "ck-authz-001");
		expect(outcome).toBe("forbidden");
	});

	it("throws on an unexpected non-ok response", async () => {
		fetchSpy.mockResolvedValueOnce({
			ok: false,
			status: 500,
			json: () => Promise.resolve({ error: "boom" }),
		} as unknown as Response);

		await expect(postVerdictHostMessage("t", "approve", "rmid", "ck-fail-0001")).rejects.toThrow();
	});
});
