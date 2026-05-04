/**
 * L15 — WorkTeam page: drag is gone; request menu + open-thread are wired.
 *
 * The legacy `COLUMN_TO_STATE round-trip` test is replaced with the inverse
 * assertion (the symbol is no longer exported from Kanban). The new tests
 * exercise the open-thread navigation and the submit-request integration via
 * a fetch mock.
 *
 * Source: `plans/L15-plan.md` §4.6 + AC-2 + AC-4.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkTeam } from "../pages/WorkTeam";

// L15 review C3: typed runtime parser for the fetch-mock POST body — replaces
// unsafe `as` casts. Throws if the shape is wrong, surfacing protocol drift
// at the assertion point instead of pretending types match.
interface ParsedPostBody {
	readonly type: string;
	readonly clientKey: string;
	readonly payload: {
		readonly text: string;
		readonly refs?: ReadonlyArray<{ kind: string; requestedState?: string }>;
	};
}
function parsePostBody(raw: unknown): ParsedPostBody {
	if (typeof raw !== "object" || raw === null) {
		throw new Error(`parsePostBody: expected object, got ${typeof raw}`);
	}
	const r = raw as Record<string, unknown>;
	if (typeof r.type !== "string") throw new Error("parsePostBody: type must be string");
	if (typeof r.clientKey !== "string") throw new Error("parsePostBody: clientKey must be string");
	const p = r.payload;
	if (typeof p !== "object" || p === null) throw new Error("parsePostBody: payload must be object");
	const pp = p as Record<string, unknown>;
	if (typeof pp.text !== "string") throw new Error("parsePostBody: payload.text must be string");
	const refsRaw = pp.refs;
	let refs: ReadonlyArray<{ kind: string; requestedState?: string }> | undefined;
	if (Array.isArray(refsRaw)) {
		refs = refsRaw.map((entry: unknown) => {
			if (typeof entry !== "object" || entry === null)
				throw new Error("parsePostBody: ref must be object");
			const e = entry as Record<string, unknown>;
			if (typeof e.kind !== "string") throw new Error("parsePostBody: ref.kind must be string");
			const rs = e.requestedState;
			return { kind: e.kind, requestedState: typeof rs === "string" ? rs : undefined };
		});
	}
	return { type: r.type, clientKey: r.clientKey, payload: { text: pp.text, refs } };
}

function LocationProbe(): JSX.Element {
	const loc = useLocation();
	return <div data-testid="location-probe">{`${loc.pathname}${loc.search}`}</div>;
}

function renderPage(): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={["/work/team"]}>
			<Routes>
				<Route path="/work/team" element={<WorkTeam />} />
				<Route
					path="/conversations"
					element={
						<>
							<div data-testid="conversations-route" />
							<LocationProbe />
						</>
					}
				/>
			</Routes>
		</MemoryRouter>,
	);
}

describe("WorkTeam — base render (preserved from pre-L15)", () => {
	it("renders with test id", () => {
		renderPage();
		expect(screen.getByTestId("work-team-page")).toBeInTheDocument();
	});

	it("renders Team Board heading", () => {
		renderPage();
		expect(screen.getByText("Team Board")).toBeInTheDocument();
	});

	it("renders kanban columns", () => {
		renderPage();
		expect(screen.getByText("Planned")).toBeInTheDocument();
		expect(screen.getByText("Blocked")).toBeInTheDocument();
		expect(screen.getByText("In Progress")).toBeInTheDocument();
		expect(screen.getByText("Done")).toBeInTheDocument();
	});

	it("renders task cards in the kanban", () => {
		renderPage();
		expect(screen.getByText("Implement login endpoint")).toBeInTheDocument();
		expect(screen.getByText("Design signup form")).toBeInTheDocument();
	});

	it("composes Canvas (top) and Kanban (bottom) in DOM order", () => {
		renderPage();
		const canvas = screen.getByTestId("work-team-canvas");
		const kanban = screen.getByTestId("work-team-kanban");
		expect(canvas).toBeInTheDocument();
		expect(kanban).toBeInTheDocument();
		const order = canvas.compareDocumentPosition(kanban);
		expect(order & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});
});

describe("WorkTeam — L15 contract: COLUMN_TO_STATE is gone, new handlers wired", () => {
	it("Kanban no longer exports COLUMN_TO_STATE (legacy drag-mapping symbol removed)", async () => {
		// The previous test in this file asserted the OPPOSITE — that
		// COLUMN_TO_STATE existed and round-tripped. L15 strips it; this test
		// inversion is intentional and called out in the summary.
		const mod: Record<string, unknown> = await import("../shell/Kanban");
		expect(mod.COLUMN_TO_STATE).toBeUndefined();
	});
});

describe("WorkTeam — request state change posts to /api/tasks/:id/thread/messages (AC-2/AC-4)", () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url.includes("/api/tasks/") && url.endsWith("/thread/messages")) {
				return new Response(
					JSON.stringify({
						thread: {
							id: "thread-123",
							hostKind: "task",
							hostId: "t1",
							initiatorId: "u-founder",
							participants: ["u-founder"],
							pinned: false,
							resolvedAt: null,
							lastActiveAt: new Date().toISOString(),
							createdAt: new Date().toISOString(),
						},
						message: {
							id: "msg-1",
							threadId: "thread-123",
							senderId: "u-founder",
							type: "plain",
							payload: { text: "ok" },
							clientKey: "ck",
							deletedAt: null,
							redactedAt: null,
							resolvedAt: null,
							createdAt: new Date().toISOString(),
						},
					}),
					{ status: 201, headers: { "content-type": "application/json" } },
				);
			}
			if (url.includes("/api/tasks/") && url.endsWith("/thread")) {
				return new Response(
					JSON.stringify({
						thread: {
							id: "thread-123",
							hostKind: "task",
							hostId: "t1",
							initiatorId: "u-founder",
							participants: ["u-founder"],
							pinned: false,
							resolvedAt: null,
							lastActiveAt: new Date().toISOString(),
							createdAt: new Date().toISOString(),
						},
						messages: [],
						headMessageId: null,
						nextMessagesCursor: null,
					}),
					{ status: 200, headers: { "content-type": "application/json" } },
				);
			}
			return new Response("{}", { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("clicking trigger → 'Block' fires POST /api/tasks/:id/thread/messages with type=plain", async () => {
		const user = userEvent.setup();
		renderPage();

		// Open the request menu on the in_progress task ('Implement login endpoint').
		const card = screen
			.getByText("Implement login endpoint")
			.closest("[data-testid='task-card-with-menu']");
		expect(card).not.toBeNull();
		const trigger = card?.querySelector("button[aria-label*='Request a change']");
		expect(trigger).not.toBeNull();
		if (!(trigger instanceof HTMLButtonElement)) return;
		await user.click(trigger);

		await user.click(screen.getByRole("menuitem", { name: /Block/i }));

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalled();
		});
		const postCall = fetchMock.mock.calls.find(([url]) => {
			const u = typeof url === "string" ? url : url.toString();
			return u.includes("/api/tasks/t1/thread/messages");
		});
		expect(postCall).toBeDefined();
		const init: RequestInit | undefined = postCall?.[1];
		expect(init?.method).toBe("POST");
		const body = parsePostBody(JSON.parse(String(init?.body ?? "{}")));
		expect(body.type).toBe("plain");
		expect(body.payload.text).toMatch(/Implement login endpoint/);
		expect(body.payload.text).toMatch(/Block/);
		const stateRef = body.payload.refs?.find((r) => r.kind === "request_state_change");
		expect(stateRef).toBeDefined();
		expect(stateRef?.requestedState).toBe("blocked");
		expect(typeof body.clientKey).toBe("string");
		expect(body.clientKey.length).toBeGreaterThanOrEqual(8);
	});

	it("Adv-C3: rapid double-click on a state target dedupes (one POST, same clientKey)", async () => {
		const user = userEvent.setup();
		renderPage();
		const card = screen
			.getByText("Implement login endpoint")
			.closest("[data-testid='task-card-with-menu']");
		const trigger = card?.querySelector("button[aria-label*='Request a change']");
		expect(trigger).not.toBeNull();
		if (!(trigger instanceof HTMLButtonElement)) return;
		await user.click(trigger);

		// Fire two clicks back-to-back without awaiting the first to settle.
		const blockItem = screen.getByRole("menuitem", { name: /Block/i });
		const click1 = user.click(blockItem);
		const click2 = user.click(blockItem);
		await Promise.all([click1, click2]);

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalled();
		});

		const postCalls = fetchMock.mock.calls.filter(([url]) => {
			const u = typeof url === "string" ? url : url.toString();
			return u.includes("/api/tasks/t1/thread/messages");
		});
		// Adv-C3 acceptance: only ONE POST goes out, OR if two went out they
		// carry the same clientKey so server-side idempotency dedupes them.
		if (postCalls.length === 1) {
			expect(postCalls.length).toBe(1);
		} else {
			expect(postCalls.length).toBeGreaterThanOrEqual(2);
			const keys = postCalls.map(([, init]) => {
				const reqInit: RequestInit | undefined = init;
				const body = parsePostBody(JSON.parse(String(reqInit?.body ?? "{}")));
				return body.clientKey;
			});
			const unique = new Set(keys);
			expect(unique.size).toBe(1);
		}
	});

	it("clicking 'Open thread' navigates to /conversations?id=<thread.id>", async () => {
		const user = userEvent.setup();
		renderPage();
		const card = screen
			.getByText("Implement login endpoint")
			.closest("[data-testid='task-card-with-menu']");
		const trigger = card?.querySelector("button[aria-label*='Request a change']");
		expect(trigger).not.toBeNull();
		if (!(trigger instanceof HTMLButtonElement)) return;
		await user.click(trigger);
		await user.click(screen.getByRole("menuitem", { name: /Open thread/i }));

		await waitFor(() => {
			const probe = screen.queryByTestId("location-probe");
			expect(probe).not.toBeNull();
			expect(probe?.textContent).toContain("/conversations");
			expect(probe?.textContent).toContain("id=thread-123");
		});
	});
});
