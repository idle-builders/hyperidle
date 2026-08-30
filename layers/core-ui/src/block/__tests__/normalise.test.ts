/**
 * L2 normalise() — the per-kind payload normaliser feeds the BlockId hash.
 * Concept § 8.4: bold-vs-plain edits change the hash; trailing whitespace
 * does not; CRLF is normalised before hashing.
 */

import { describe, expect, it } from "vitest";
import { normalisedPayload } from "../normalise.js";

describe("normalisedPayload()", () => {
	it("paragraph: bold-vs-plain produces different normalisations", () => {
		const a = normalisedPayload({
			kind: "paragraph",
			inline: [{ type: "text", value: "hello" }],
		});
		const b = normalisedPayload({
			kind: "paragraph",
			inline: [{ type: "strong", children: [{ type: "text", value: "hello" }] }],
		});
		expect(a).not.toBe(b);
	});

	it("paragraph: trailing whitespace does not change the normalisation", () => {
		const a = normalisedPayload({
			kind: "paragraph",
			inline: [{ type: "text", value: "hello" }],
		});
		const b = normalisedPayload({
			kind: "paragraph",
			inline: [{ type: "text", value: "hello   " }],
		});
		expect(a).toBe(b);
	});

	it("code: CRLF is normalised to LF before hashing", () => {
		const a = normalisedPayload({ kind: "code", lang: null, text: "a\nb\n" });
		const b = normalisedPayload({ kind: "code", lang: null, text: "a\r\nb\r\n" });
		expect(a).toBe(b);
	});

	it("divider: a single canonical normalisation", () => {
		expect(normalisedPayload({ kind: "divider" })).toBe(normalisedPayload({ kind: "divider" }));
	});

	it("normalisedPayload alone does not determine identity — outline path matters", async () => {
		// A divider's normalisedPayload is "" (empty). Two dividers under different
		// headings must therefore receive different ids — proving that the BlockId
		// hash mixes (kind, outlinePath, normalisedPayload), not normalisedPayload alone.
		const { deriveBlocks } = await import("..");
		const md = "# A\n\n---\n\n# B\n\n---\n";
		const { blocks } = deriveBlocks(md, { kind: "task", id: "x" });
		const dividers = blocks.filter((b) => b.kind === "divider");
		expect(dividers).toHaveLength(2);
		expect(dividers[0]!.id).not.toBe(dividers[1]!.id);
	});
});
