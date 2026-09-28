import { describe, expect, it, vi } from "vitest";
import { PRODUCT_OBJECT_KINDS, presentationFor } from "../object-presentation.js";
import { createOpenHandler } from "../open-handler.js";

describe("presentationFor: every product object kind maps to an opening intent", () => {
	it("maps every product object by opening intent", () => {
		for (const kind of PRODUCT_OBJECT_KINDS) {
			expect(presentationFor(kind, "navigate")).toBe("page");
			expect(presentationFor(kind, "inspect")).toBe("pane");
			expect(presentationFor(kind, "act")).toBe("overlay");
		}
	});
});

describe("createOpenHandler routing", () => {
	it("contextual references use the page-owned Inspect placement", () => {
		const nav = vi.fn();
		const inspect = vi.fn();
		const handler = createOpenHandler(nav, { onInspectPath: inspect });
		handler({ route: "host", hostKind: "document", hostId: "knowledge-1", blockId: "b 1" });
		handler({ route: "review", reviewId: "rev-1", threadId: "th-1", intent: "inspect" });
		expect(inspect.mock.calls.map(([path]) => path)).toEqual([
			"/documents/knowledge-1#block-b%201",
			"/reviews/rev-1?threadId=th-1",
		]);
		expect(nav).not.toHaveBeenCalled();
	});

	it("structural Open review still navigates to the review page (/reviews/:reviewId)", () => {
		const nav = vi.fn();
		const inspect = vi.fn();
		createOpenHandler(nav, { onInspectPath: inspect })({
			route: "review",
			reviewId: "rev-1",
			threadId: "th-1",
		});
		expect(nav).toHaveBeenCalledWith("/reviews/rev-1?threadId=th-1");
		expect(inspect).not.toHaveBeenCalled();
	});
});
