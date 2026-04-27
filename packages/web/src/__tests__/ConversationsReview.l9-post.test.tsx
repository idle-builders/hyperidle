/**
 * L9 — ConversationsReview commits POST distinguished L9 payloads.
 *
 * For L9 thread fixtures, `handleCommit` must POST to
 * `/api/conversations/responses` with the discriminating fields:
 *
 *   - permission_request + decision=approve  →  oneShot: true
 *   - file_lease + decision=approve          →  leaseGrantedTo: 'a'
 *   - file_lease + decision=reject           →  leaseGrantedTo: 'b'
 *   - other verdicts                         →  oneShot: null, leaseGrantedTo: null
 *
 * Closes the L9 DoD blocker: server schema accepts the fields but the
 * client never POSTed them — only a local mock toast was minted.
 *
 * NB: the J4 (non-L9) path is intentionally untouched — its wire format
 * lives in a future track; here we only assert the L9 path POSTs.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationsReview } from "../pages/ConversationsReview";

interface FetchCall {
	url: string;
	method: string;
	body: unknown;
	headers: Record<string, string>;
}

function installFetchSpy(): {
	calls: FetchCall[];
	restore: () => void;
} {
	const calls: FetchCall[] = [];
	const original = globalThis.fetch;
	globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url =
			typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
		const method = init?.method ?? "GET";
		const bodyText = typeof init?.body === "string" ? init.body : null;
		const body: unknown = bodyText ? JSON.parse(bodyText) : null;
		const headers: Record<string, string> = {};
		const rawHeaders = init?.headers;
		if (rawHeaders instanceof Headers) {
			rawHeaders.forEach((v, k) => {
				headers[k] = v;
			});
		} else if (Array.isArray(rawHeaders)) {
			for (const [k, v] of rawHeaders) headers[k] = v;
		} else if (rawHeaders && typeof rawHeaders === "object") {
			for (const [k, v] of Object.entries(rawHeaders)) headers[k] = String(v);
		}
		calls.push({ url, method, body, headers });
		return new Response(JSON.stringify({ id: `srv-${calls.length}` }), {
			status: 201,
			headers: { "Content-Type": "application/json" },
		});
	}) as typeof fetch;
	return {
		calls,
		restore: () => {
			globalThis.fetch = original;
		},
	};
}

function setLocation(thread: string): () => void {
	const original = window.location.search;
	// jsdom allows reassigning location.search via history.replaceState
	window.history.replaceState({}, "", `/conversations/review?thread=${thread}`);
	return () => {
		window.history.replaceState({}, "", original);
	};
}

describe("ConversationsReview — L9 commit POSTs distinguished payload", () => {
	let spy: ReturnType<typeof installFetchSpy>;
	let restoreLocation: () => void = () => {};

	beforeEach(() => {
		spy = installFetchSpy();
	});

	afterEach(() => {
		spy.restore();
		restoreLocation();
	});

	it("permission_request 'Approve once' POSTs oneShot=true", async () => {
		restoreLocation = setLocation("l9-permission-request");
		const user = userEvent.setup();
		render(
			<MemoryRouter>
				<ConversationsReview />
			</MemoryRouter>,
		);

		// Approve-once is the override label for `decision=approve` on
		// permission_request fixtures; verdictDoubleClick is true by default
		// so we click twice (first prefills, second commits).
		const approve = await screen.findByRole("button", { name: /approve once/i });
		await user.click(approve);
		await user.click(approve);

		await waitFor(() => {
			const post = spy.calls.find(
				(c) => c.url === "/api/conversations/responses" && c.method === "POST",
			);
			expect(post).toBeTruthy();
		});
		const post = spy.calls.find(
			(c) => c.url === "/api/conversations/responses" && c.method === "POST",
		);
		expect(post).toBeDefined();
		const body = post?.body as Record<string, unknown>;
		expect(body.itemId).toBe("l9-permission-request");
		expect(body.decision).toBe("approve");
		expect(body.oneShot).toBe(true);
		expect(body.leaseGrantedTo).toBeNull();
	});

	it("file_lease 'Grant lease to A' POSTs leaseGrantedTo='a'", async () => {
		restoreLocation = setLocation("l9-file-lease");
		const user = userEvent.setup();
		render(
			<MemoryRouter>
				<ConversationsReview />
			</MemoryRouter>,
		);

		const grantA = await screen.findByRole("button", { name: /grant lease to a/i });
		await user.click(grantA);
		await user.click(grantA);

		await waitFor(() => {
			expect(
				spy.calls.find((c) => c.url === "/api/conversations/responses" && c.method === "POST"),
			).toBeTruthy();
		});
		const post = spy.calls.find(
			(c) => c.url === "/api/conversations/responses" && c.method === "POST",
		);
		const body = post?.body as Record<string, unknown>;
		expect(body.itemId).toBe("l9-file-lease");
		expect(body.decision).toBe("approve");
		expect(body.leaseGrantedTo).toBe("a");
		expect(body.oneShot).toBeNull();
	});

	it("file_lease 'Grant lease to B' POSTs leaseGrantedTo='b'", async () => {
		restoreLocation = setLocation("l9-file-lease");
		const user = userEvent.setup();
		render(
			<MemoryRouter>
				<ConversationsReview />
			</MemoryRouter>,
		);

		const grantB = await screen.findByRole("button", { name: /grant lease to b/i });
		await user.click(grantB);
		await user.click(grantB);

		await waitFor(() => {
			expect(
				spy.calls.find((c) => c.url === "/api/conversations/responses" && c.method === "POST"),
			).toBeTruthy();
		});
		const post = spy.calls.find(
			(c) => c.url === "/api/conversations/responses" && c.method === "POST",
		);
		const body = post?.body as Record<string, unknown>;
		expect(body.itemId).toBe("l9-file-lease");
		expect(body.decision).toBe("reject");
		expect(body.leaseGrantedTo).toBe("b");
		expect(body.oneShot).toBeNull();
	});
});
