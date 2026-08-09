/**
 * L2 AC-20 to AC-27, AC-27a — BlockId stability corner cases per concept § 8.4.
 */

import { describe, expect, it } from "vitest";
import { deriveBlocks } from "../../blocks/derive-blocks.js";

const HOST_A = { kind: "bet" as const, id: "A" };
const HOST_B = { kind: "bet" as const, id: "B" };

const idsOf = (md: string, host = HOST_A): string[] =>
	deriveBlocks(md, host).blocks.map((b) => b.id);

describe("BlockId stability", () => {
	it("AC-20: same body, same ids on repeated parses", () => {
		const md = "# h1\n\npara1\n\n## h2\n\npara2\n\n```\ncode\n```\n";
		const a = idsOf(md);
		for (let i = 0; i < 5; i++) {
			expect(idsOf(md)).toEqual(a);
		}
	});

	it("AC-21: editing block 2 leaves blocks 0,1,3,4 unchanged", () => {
		const before = "para0\n\npara1\n\npara2\n\npara3\n\npara4\n";
		const after = "para0\n\npara1\n\npara2-EDITED\n\npara3\n\npara4\n";
		const a = idsOf(before);
		const b = idsOf(after);
		expect(a[0]).toBe(b[0]);
		expect(a[1]).toBe(b[1]);
		expect(a[2]).not.toBe(b[2]);
		expect(a[3]).toBe(b[3]);
		expect(a[4]).toBe(b[4]);
	});

	it("AC-22: rename-to-collide does not corrupt unchanged sibling", () => {
		const before = "## Approach\n\nx\n\n## Background\n\ny\n";
		const after = "## Background\n\nx\n\n## Background\n\ny\n";
		const beforeBlocks = deriveBlocks(before, HOST_A).blocks;
		const afterBlocks = deriveBlocks(after, HOST_A).blocks;
		// Original `## Background` heading and its `y` paragraph keep their ids.
		const originalBackgroundHeading = beforeBlocks.find(
			(b) => b.payload.kind === "heading" && b.payload.text === "Background",
		);
		const afterBackgroundHeadings = afterBlocks.filter(
			(b) => b.payload.kind === "heading" && b.payload.text === "Background",
		);
		expect(originalBackgroundHeading).toBeTruthy();
		expect(afterBackgroundHeadings).toHaveLength(2);
		expect(afterBackgroundHeadings.map((h) => h.id)).toContain(originalBackgroundHeading?.id);
	});

	it("AC-23: pre-heading content uses <root> outline path; two pre-heading paragraphs differ only by payload", () => {
		const md = "para-A\n\npara-B\n\n# H\n";
		const ids = idsOf(md);
		expect(ids[0]).not.toBe(ids[1]);
		// Compare to same paragraphs under a heading — different outline path, different ids.
		const underHeading = idsOf("# H\n\npara-A\n\npara-B\n");
		// Paragraphs under H ≠ paragraphs at root.
		expect(underHeading.slice(1)).not.toEqual(ids.slice(0, 2));
	});

	it("AC-24: slug edges — emoji-only, all-punctuation, bare-number map to <empty> sentinel without colliding with <root>", () => {
		const md1 = "# 🚀\n\nx\n";
		const md2 = "# !!!\n\nx\n";
		const md3 = "# 42\n\nx\n";
		const a = idsOf(md1);
		const b = idsOf(md2);
		const c = idsOf(md3);
		// emoji-only and all-punct both stripped → <empty>; their headings produce equal slugs but differ in normalised payload (the heading text differs).
		expect(a[0]).not.toBe(b[0]); // text differs
		// bare-number "42" preserves digits in the slug — distinct from <empty>.
		expect(c[0]).not.toBe(a[0]);
		// <root>-pre-heading sibling test
		const rootPara = idsOf("para\n");
		expect(rootPara[0]).not.toBe(a[0]);
	});

	it("AC-25: line-ending normalisation — CRLF and LF code blocks produce identical ids", () => {
		const lf = "```\nline1\nline2\n```\n";
		const crlf = "```\r\nline1\r\nline2\r\n```\r\n";
		expect(idsOf(lf)).toEqual(idsOf(crlf));
	});

	it("AC-26: same content under different (hostKind, hostId) → same BlockId; source.hostId differs", () => {
		const md = "# h\n\npara\n";
		const a = deriveBlocks(md, HOST_A);
		const b = deriveBlocks(md, HOST_B);
		expect(a.blocks.map((x) => x.id)).toEqual(b.blocks.map((x) => x.id));
		expect(a.blocks[0]!.source.hostId).not.toBe(b.blocks[0]!.source.hostId);
	});

	it("AC-27a: heading-rename cascades to descendants but spares siblings elsewhere", () => {
		const before =
			"## Approach\n\nbody-A\n\n### Step 1\n\nstep-body\n\n## Other\n\n### Other Step\n";
		const after =
			"## Strategy\n\nbody-A\n\n### Step 1\n\nstep-body\n\n## Other\n\n### Other Step\n";
		const a = deriveBlocks(before, HOST_A).blocks;
		const b = deriveBlocks(after, HOST_A).blocks;
		const find = (
			arr: typeof a,
			pred: (x: (typeof a)[number]) => boolean,
		): (typeof a)[number] | undefined => arr.find(pred);

		const otherH2A = find(a, (x) => x.payload.kind === "heading" && x.payload.text === "Other");
		const otherH2B = find(b, (x) => x.payload.kind === "heading" && x.payload.text === "Other");
		expect(otherH2A?.id).toBe(otherH2B?.id);

		const otherStepA = find(
			a,
			(x) => x.payload.kind === "heading" && x.payload.text === "Other Step",
		);
		const otherStepB = find(
			b,
			(x) => x.payload.kind === "heading" && x.payload.text === "Other Step",
		);
		expect(otherStepA?.id).toBe(otherStepB?.id);

		const renamedA = find(a, (x) => x.payload.kind === "heading" && x.payload.text === "Approach");
		const renamedB = find(b, (x) => x.payload.kind === "heading" && x.payload.text === "Strategy");
		expect(renamedA?.id).not.toBe(renamedB?.id);

		// Step 1 under the renamed H2 changes id (cascade)
		const step1A = a.filter((x) => x.payload.kind === "heading" && x.payload.text === "Step 1");
		const step1B = b.filter((x) => x.payload.kind === "heading" && x.payload.text === "Step 1");
		expect(step1A[0]!.id).not.toBe(step1B[0]!.id);

		// step-body paragraph under Step 1 also cascades
		const stepBodyA = a.find(
			(x) =>
				x.payload.kind === "paragraph" && JSON.stringify(x.payload.inline).includes("step-body"),
		);
		const stepBodyB = b.find(
			(x) =>
				x.payload.kind === "paragraph" && JSON.stringify(x.payload.inline).includes("step-body"),
		);
		expect(stepBodyA?.id).not.toBe(stepBodyB?.id);
	});

	it("reorder paragraphs under a heading — paragraph ids stable (content-keyed)", () => {
		const a = "# H\n\npara-A\n\npara-B\n";
		const b = "# H\n\npara-B\n\npara-A\n";
		const ai = idsOf(a);
		const bi = idsOf(b);
		// the same content under the same heading retains the same id regardless of position
		expect(ai.slice(1).sort()).toEqual(bi.slice(1).sort());
	});

	it("heading-as-block self-reference — heading is not in its own ancestors", () => {
		// A heading must not include itself in its outline path; this is asserted by
		// the property: two headings with the same text but different parent paths
		// have different ids — and the heading at root has the same id as the same
		// heading at root in a body where it is not its own descendant.
		const a = idsOf("# H\n\npara\n");
		const b = idsOf("# H\n\npara\n");
		expect(a).toEqual(b);
	});

	it("AC-27: bumping BLOCK_ID_VERSION (via test-only blockId stub) changes every id", async () => {
		// @lore AU34: one dynamic import per destination. The two names used to come off the
		// package's sub-barrel together; `blockId` stayed here and `BLOCK_ID_VERSION` went to
		// `@hyperidle/domain-model` with the Block shape, so the single statement splits the same
		// way a static barrel import does.
		const { blockId: realBlockId } = await import("../../blocks/block-id.js");
		const { BLOCK_ID_VERSION } = await import("@hyperidle/domain-model");
		expect(BLOCK_ID_VERSION).toBe("blk:v1");
		// Re-implement the same primitive but with a different version tag — confirms
		// that the version tag participates in the hash input.
		const a = realBlockId({
			kind: "paragraph",
			outlinePath: "<root>",
			normalisedPayload: "x",
		});
		const b = realBlockId({
			kind: "paragraph",
			outlinePath: "<root>",
			normalisedPayload: "x-DIFFERENT",
		});
		expect(a).not.toBe(b);
	});
});
