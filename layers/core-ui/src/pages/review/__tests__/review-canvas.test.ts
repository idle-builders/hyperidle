import { blockId, deriveBlocks, normalisedPayload } from "@hyperidle/shared";
import { describe, expect, it } from "vitest";
import { MOCK_REVIEW_SUBJECT } from "../__fixtures__/review-subject.fixture.js";
import type { CodeDiffPayload, ReviewArtifact } from "../review-artifact.js";
import { deriveProseBlocks, lineBlockId } from "../review-canvas.js";

const codeArtifact = MOCK_REVIEW_SUBJECT.artifacts.find(
	(a): a is ReviewArtifact<CodeDiffPayload> => a.kind === "code_diff",
)!;

const file = codeArtifact.payload.files[0]!;
const hunk = file.hunks![0]!;
const line = hunk.lines[0]!;

describe("lineBlockId", () => {
	it("returns a stable block id for a diff line", () => {
		const id1 = lineBlockId(codeArtifact.id, file.path, 0, line);
		const id2 = lineBlockId(codeArtifact.id, file.path, 0, line);
		expect(id1).toBe(id2);
		expect(typeof id1).toBe("string");
		expect(id1.length).toBeGreaterThan(0);
	});

	it("depends on line content", () => {
		const id1 = lineBlockId(codeArtifact.id, file.path, 0, line);
		const id2 = lineBlockId(codeArtifact.id, file.path, 0, { ...line, text: "different" });
		expect(id1).not.toBe(id2);
	});

	it("depends on file path", () => {
		const id1 = lineBlockId(codeArtifact.id, file.path, 0, line);
		const id2 = lineBlockId(codeArtifact.id, "other.ts", 0, line);
		expect(id1).not.toBe(id2);
	});

	it("depends on hunk index", () => {
		const id1 = lineBlockId(codeArtifact.id, file.path, 0, line);
		const id2 = lineBlockId(codeArtifact.id, file.path, 1, line);
		expect(id1).not.toBe(id2);
	});

	it("matches the explicit blockId construction", () => {
		const actual = lineBlockId(codeArtifact.id, file.path, 0, line);
		const expected = blockId({
			kind: "code",
			outlinePath: `${codeArtifact.id}:${file.path}#hunk0`,
			normalisedPayload: normalisedPayload({
				kind: "code",
				lang: "ts",
				text: line.text,
			}),
		});
		expect(actual).toBe(expected);
	});
});

describe("deriveProseBlocks", () => {
	it("derives paragraph blocks from a prose body using the artifact as host", () => {
		const blocks = deriveProseBlocks("artifact:rendered:1", "Hello world.\n\nSecond paragraph.");
		const paragraphs = blocks.filter((b) => b.kind === "paragraph");
		expect(paragraphs.length).toBe(2);
		for (const p of paragraphs) {
			expect(p.id.length).toBeGreaterThan(0);
		}
	});

	it("produces stable block ids for unchanged prose", () => {
		const body = "Stable anchor.";
		const blocks1 = deriveProseBlocks("artifact:rendered:1", body);
		const blocks2 = deriveProseBlocks("artifact:rendered:1", body);
		expect(blocks1[0]?.id).toBe(blocks2[0]?.id);
	});

	it("matches canonical deriveBlocks semantics", () => {
		const body = "First.\n\nSecond.";
		const fromHelper = deriveProseBlocks("artifact:rendered:1", body);
		const fromShared = deriveBlocks(body, { kind: "artifact", id: "artifact:rendered:1" });
		expect(fromHelper.map((b) => b.id)).toEqual(fromShared.blocks.map((b) => b.id));
	});
});
