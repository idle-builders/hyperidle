// AM5 T8 — Block-anchored open.
// RED phase: proves AC2 — host with blockId navigates to #block-<id>,
// without blockId navigates to bare path.
// Also proves the OpenTarget type accepts blockId + inlineRefToEmbed threads it.

import { describe, expect, it, vi } from "vitest";
import { createOpenHandler } from "../services/open-handler.js";

// ── 1. open-handler: host(document, id, blockId) → /documents/:id#block-:blockId ───
describe("AC2: open-handler block anchor", () => {
	it("host with blockId → path#block-<encodeURIComponent(blockId)>", () => {
		const nav = vi.fn();
		const handler = createOpenHandler(nav, {});
		handler({
			route: "host",
			hostKind: "document",
			hostId: "ki-1",
			blockId: "block-abc",
		});
		expect(nav).toHaveBeenCalledWith("/documents/ki-1#block-block-abc");
	});

	it("host without blockId → bare path (no fragment)", () => {
		const nav = vi.fn();
		const handler = createOpenHandler(nav, {});
		handler({ route: "host", hostKind: "document", hostId: "ki-1" });
		expect(nav).toHaveBeenCalledWith("/documents/ki-1");
	});

	it("blockId with special chars → encodeURIComponent applied", () => {
		const nav = vi.fn();
		const handler = createOpenHandler(nav, {});
		handler({
			route: "host",
			hostKind: "document",
			hostId: "ki-2",
			blockId: "block with spaces",
		});
		expect(nav).toHaveBeenCalledWith(
			`/documents/ki-2#block-${encodeURIComponent("block with spaces")}`,
		);
	});
});
// @lore artifacts-become-knowledge: test for hostKind:"artifact" with blockId removed —
// "artifact" is no longer a valid HostKind; the /artifacts/:id page is deleted.

// ── 2. AC6: same target from two contexts → identical path ────────────────────
describe("AC6: block-anchored target → same path from any context", () => {
	it("host+blockId resolves identically regardless of context", () => {
		const nav1 = vi.fn();
		const nav2 = vi.fn();
		const target = {
			route: "host" as const,
			hostKind: "document" as const,
			hostId: "ki-5",
			blockId: "block-123",
		};
		createOpenHandler(nav1, {})(target);
		createOpenHandler(nav2, { onOpenSession: vi.fn() })(target);
		expect(nav1.mock.calls[0]![0]).toBe(nav2.mock.calls[0]![0]);
		expect(nav1).toHaveBeenCalledWith("/documents/ki-5#block-block-123");
	});
});
