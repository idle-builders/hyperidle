import { describe, expect, it } from "vitest";
import { err, ok, type ToolResult } from "../tool-result.js";

describe("ToolResult helpers", () => {
	describe("ok()", () => {
		it("wraps data in success envelope", () => {
			const result = ok({ count: 3 });
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data).toEqual({ count: 3 });
			}
		});

		it("supports primitive payloads", () => {
			const result = ok(42);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data).toBe(42);
			}
		});

		it("supports null payload", () => {
			const result = ok(null);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data).toBeNull();
			}
		});
	});

	describe("err()", () => {
		it("wraps code and message in failure envelope", () => {
			const result = err("INVALID_INPUT", "limit must be positive");
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.code).toBe("INVALID_INPUT");
				expect(result.error).toBe("limit must be positive");
			}
		});
	});

	describe("discriminated union narrowing", () => {
		it("narrows by success flag", () => {
			const results: ToolResult<{ id: string }>[] = [ok({ id: "x" }), err("NOT_FOUND", "missing")];

			let okCount = 0;
			let errCount = 0;
			for (const r of results) {
				if (r.success) {
					expect(r.data.id).toBe("x");
					okCount++;
				} else {
					expect(r.code).toBe("NOT_FOUND");
					expect(r.error).toBe("missing");
					errCount++;
				}
			}
			expect(okCount).toBe(1);
			expect(errCount).toBe(1);
		});
	});
});
