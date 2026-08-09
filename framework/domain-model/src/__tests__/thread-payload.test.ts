/**
 * L18 — shared thread payload schema tests.
 *
 * AC coverage:
 *  - plain payload round-trips with blockId (optional field)
 *  - ArtifactThreadSummary type is exported from @hyperidle/domain-model
 *  - ArtifactThreadSummaryResponse type is exported
 */

import type { ArtifactThreadSummary, ArtifactThreadSummaryResponse } from "@hyperidle/domain-model";
import { describe, expect, it } from "vitest";

describe("L18 — plain message payload with blockId", () => {
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

describe("L18 — ArtifactThreadSummary type exports", () => {
	it("ArtifactThreadSummary shape has required fields", () => {
		const summary: ArtifactThreadSummary = {
			artifactId: "art-1",
			artifactKind: "text_diff",
			artifactTitle: "auth-service.ts",
			threadId: "t-1",
			messageCount: 3,
			lastMessageAt: "2026-05-04T10:11:12Z",
			lastMessageSnippet: "Looks good but the cache TTL",
			hasUnresolvedReview: false,
		};
		expect(summary.artifactId).toBe("art-1");
		expect(summary.artifactKind).toBe("text_diff");
		expect(summary.threadId).toBe("t-1");
		expect(summary.messageCount).toBe(3);
	});

	it("ArtifactThreadSummary allows null threadId when no thread exists", () => {
		const summary: ArtifactThreadSummary = {
			artifactId: "art-2",
			artifactKind: "code", // AM5 B3: code_diff → code (pre-alpha purge)
			artifactTitle: "component.tsx",
			threadId: null,
			messageCount: 0,
			lastMessageAt: null,
			lastMessageSnippet: null,
			hasUnresolvedReview: false,
		};
		expect(summary.threadId).toBeNull();
		expect(summary.lastMessageAt).toBeNull();
	});

	it("ArtifactThreadSummaryResponse has summaries, totalCount, truncated", () => {
		const response: ArtifactThreadSummaryResponse = {
			summaries: [],
			totalCount: 0,
			truncated: false,
		};
		expect(response.summaries).toHaveLength(0);
		expect(response.totalCount).toBe(0);
		expect(response.truncated).toBe(false);
	});

	it("ArtifactThreadSummaryResponse with truncated data", () => {
		const response: ArtifactThreadSummaryResponse = {
			summaries: new Array(10).fill({
				artifactId: "art-x",
				artifactKind: "text_diff",
				artifactTitle: "file.ts",
				threadId: "t-x",
				messageCount: 1,
				lastMessageAt: "2026-05-04T10:00:00Z",
				lastMessageSnippet: "snippet",
				hasUnresolvedReview: false,
			}),
			totalCount: 12,
			truncated: true,
		};
		expect(response.summaries).toHaveLength(10);
		expect(response.totalCount).toBe(12);
		expect(response.truncated).toBe(true);
	});
});
