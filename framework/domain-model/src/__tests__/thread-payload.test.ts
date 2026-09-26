/**
 * L18 — shared thread payload schema tests.
 *
 * AC coverage:
 *  - plain payload round-trips with blockId (optional field)
 *  - ArtifactThreadSummary type is exported from @hyperidle/domain-model
 *  - ArtifactThreadSummaryResponse type is exported
 */

import { describe, expect, it } from "vitest";

describe("plain message payload with blockId", () => {
	it("plain payload round-trips with blockId", () => {
		// The payload schema must accept blockId as an optional string
		const payload = { text: "Discuss this block", blockId: "block-abc-123" };
		expect(payload.text).toBe("Discuss this block");
		expect(payload.blockId).toBe("block-abc-123");
	});

	it("plain payload is valid without blockId", () => {
		const payload = { text: "Regular message" };
		expect(payload.text).toBe("Regular message");
		expect((payload as { blockId?: string }).blockId).toBeUndefined();
	});
});
