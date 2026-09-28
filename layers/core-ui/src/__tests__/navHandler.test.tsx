/**
 * Page-level navHandler: OpenTarget → real navigation.
 *
 * Proves REAL navigation wiring, not a format function. The page binds the
 * renderer's `onOpen` to a handler that resolves an OpenTarget to a path
 * (via the EXISTING `resolveHostRoute` for host targets) and calls
 * `navigate`. We test that handler with a SPIED `navigate` + the real
 * resolver, asserting `navigate` is CALLED with the resolved path.
 *
 * This targets an exported factory `createOpenHandler(navigate)` from
 * `../services/open-handler` to keep this a unit test (no full page mount /
 * data-fetch); if the binding moves inline into a page component instead,
 * this import path is the one line to retarget.
 */

import { describe, expect, it, vi } from "vitest";
import type { OpenHandler, OpenTarget } from "../components/parts";
import { createOpenHandler } from "../services/open-handler";

describe("navHandler — OpenTarget → navigate", () => {
	it("host + document → navigate('/documents/:id')", () => {
		const navigate = vi.fn();
		const handler: OpenHandler = createOpenHandler(navigate);
		handler({ route: "host", hostKind: "document", hostId: "k-1" });
		expect(navigate).toHaveBeenCalledWith("/documents/k-1");
	});

	it("host + task → navigate('/work/task/:hostId') — a non-document host", () => {
		const navigate = vi.fn();
		createOpenHandler(navigate)({ route: "host", hostKind: "task", hostId: "bet-9" });
		expect(navigate).toHaveBeenCalledWith("/work/task/bet-9");
	});

	it("host + task (any id) → navigate('/work/task/:id') — no longer a no-op", () => {
		const navigate = vi.fn();
		createOpenHandler(navigate)({ route: "host", hostKind: "task", hostId: "task-3" });
		expect(navigate).toHaveBeenCalledWith("/work/task/task-3");
	});

	it("review → navigate('/reviews/:reviewId?threadId=...') (flattened, no betId needed)", () => {
		const navigate = vi.fn();
		createOpenHandler(navigate)({ route: "review", reviewId: "rv1", threadId: "th-1" });
		expect(navigate).toHaveBeenCalledWith("/reviews/rv1?threadId=th-1");
	});

	it("host + user (no navigable host) does NOT call navigate (documented no-op)", () => {
		const navigate = vi.fn();
		const target = { route: "host", hostKind: "user", hostId: "u-1" } as OpenTarget;
		createOpenHandler(navigate)(target);
		expect(navigate).not.toHaveBeenCalled();
	});

	it("session route (no destination yet) does NOT navigate to a fabricated path", () => {
		const navigate = vi.fn();
		createOpenHandler(navigate)({ route: "session", sessionId: "s-1" });
		// The session route owns its own destination; this handler must not invent one.
		expect(navigate).not.toHaveBeenCalledWith(expect.stringContaining("/session"));
	});
});
