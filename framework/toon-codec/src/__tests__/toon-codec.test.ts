import { describe, expect, it } from "vitest";
import { encode } from "../toon-codec.js";

describe("TOON Codec", () => {
	describe("token efficiency (AC2: >=30% smaller than JSON)", () => {
		it("TOON is at least 30% smaller than JSON by token count", () => {
			const testObj = {
				title: "My Practice",
				layer: "L2",
				meta: { confidence: 85, tags: ["typescript", "patterns", "testing"] },
				body: "This is a multi-line\nbody text that continues\non multiple lines",
				status: "active",
				nested: { deep: { value: "hello" } },
				count: 42,
				active: true,
				deleted: false,
				missing: null,
			};

			const toonStr = encode(testObj);
			const jsonStr = JSON.stringify(testObj);

			// Approximate LLM token count: words + individual punctuation symbols.
			// Each punctuation character ({, }, [, ], ", :, ,) counts as a separate token,
			// and each whitespace-delimited word counts as a token.
			const tokenize = (s: string): number => {
				const tokens = s.match(/[a-zA-Z0-9_./-]+|[^\s]/g);
				return tokens ? tokens.length : 0;
			};

			const toonTokens = tokenize(toonStr);
			const jsonTokens = tokenize(jsonStr);

			const reduction = 1 - toonTokens / jsonTokens;
			expect(reduction).toBeGreaterThanOrEqual(0.3);
		});
	});

	describe("encoding specifics", () => {
		it("uses dot notation for nested keys", () => {
			const encoded = encode({ a: { b: "c" } });
			expect(encoded).toContain("a.b: c");
		});

		it("uses bracket notation for arrays", () => {
			const encoded = encode({ tags: ["x", "y"] });
			expect(encoded).toContain("tags[0]: x");
			expect(encoded).toContain("tags[1]: y");
		});

		it("represents null as empty after colon", () => {
			const encoded = encode({ field: null });
			expect(encoded).toBe("field:");
		});

		it("uses pipe for multi-line strings", () => {
			const encoded = encode({ text: "line1\nline2" });
			expect(encoded).toContain("text: |");
			expect(encoded).toContain("  line1");
			expect(encoded).toContain("  line2");
		});

		it("skips undefined values", () => {
			const encoded = encode({ a: "present", b: undefined });
			expect(encoded).toContain("a: present");
			expect(encoded).not.toContain("b");
		});

		it("encodes booleans", () => {
			const encoded = encode({ active: true, deleted: false });
			expect(encoded).toContain("active: true");
			expect(encoded).toContain("deleted: false");
		});

		it("encodes numbers", () => {
			const encoded = encode({ count: 42, pi: 3.14 });
			expect(encoded).toContain("count: 42");
			expect(encoded).toContain("pi: 3.14");
		});
	});
});
