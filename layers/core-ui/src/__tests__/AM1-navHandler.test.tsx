/**
 * AM1 — page-level navHandler: OpenTarget → real navigation (N1, AC8). RED phase.
 *
 * N1 (architecture §AC8): prove REAL navigation wiring, not a format function.
 * The page binds the renderer's `onOpen` to a handler that resolves an
 * OpenTarget to a path (via the EXISTING `resolveHostRoute` for host targets)
 * and calls `navigate`. We test that handler with a SPIED `navigate` + the real
 * resolver, asserting `navigate` is CALLED with the resolved path.
 *
 * CONFUSION-A (flagged for review): the plan (§6, task 8) places the binding in
 * `Conversations.tsx` but does not name the exported symbol. To keep this a unit
 * test (no full page mount / data-fetch), this targets an exported factory
 * `createOpenHandler(navigate)` from `../services/open-handler`. The green phase
 * owns the exact home; if it lives inline in Conversations.tsx instead, this
 * import path is the one line to retarget.
 *
 * RED until `../services/open-handler` exists (green-phase task 8).
 */

import { describe, expect, it, vi } from "vitest";
import type { OpenHandler, OpenTarget } from "../components/parts";
import { createOpenHandler } from "../services/open-handler";

describe("AM1 navHandler — OpenTarget → navigate (N1, AC8)", () => {
	it("host + knowledge_item → navigate('/knowledge/:id')", () => {
		const navigate = vi.fn();
		const handler: OpenHandler = createOpenHandler(navigate);
		handler({ route: "host", hostKind: "knowledge_item", hostId: "k-1" });
		expect(navigate).toHaveBeenCalledWith("/knowledge/k-1");
	});

	// @lore BB1: task host now navigates to /work/task/:hostId (was /work/bet/:betId)
	it("host + task → navigate('/work/task/:hostId') (BB1: C1 non-knowledge host)", () => {
		const navigate = vi.fn();
		createOpenHandler(navigate)({ route: "host", hostKind: "task", hostId: "bet-9" });
		expect(navigate).toHaveBeenCalledWith("/work/task/bet-9");
	});

	// @lore BB1: task now navigates — was a no-op (AM5 H5/BLOCKER-1)
	it("host + task (any id) → navigate('/work/task/:id') (BB1: no longer a no-op)", () => {
		const navigate = vi.fn();
		createOpenHandler(navigate)({ route: "host", hostKind: "task", hostId: "task-3" });
		expect(navigate).toHaveBeenCalledWith("/work/task/task-3");
	});

	it("artifact → navigate('/artifacts/:id')", () => {
		const navigate = vi.fn();
		createOpenHandler(navigate)({ route: "artifact", artifactId: "art-1" });
		expect(navigate).toHaveBeenCalledWith("/artifacts/art-1");
	});

	it("review → navigate('/reviews/:reviewId') (flattened, no betId needed)", () => {
		const navigate = vi.fn();
		createOpenHandler(navigate)({ route: "review", reviewId: "rv1" });
		expect(navigate).toHaveBeenCalledWith("/reviews/rv1");
	});

	it("host + user (no navigable host) does NOT call navigate (documented no-op)", () => {
		const navigate = vi.fn();
		const target = { route: "host", hostKind: "user", hostId: "u-1" } as OpenTarget;
		createOpenHandler(navigate)(target);
		expect(navigate).not.toHaveBeenCalled();
	});

	it("session route (no destination yet — AM3) does NOT navigate to a fabricated path", () => {
		const navigate = vi.fn();
		createOpenHandler(navigate)({ route: "session", sessionId: "s-1" });
		// AM3 owns the destination; AM1 must not invent one.
		expect(navigate).not.toHaveBeenCalledWith(expect.stringContaining("/session"));
	});
});
