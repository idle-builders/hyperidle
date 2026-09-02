// AE6 RED — Kind registry and Kind Definition unit tests.
//
// These tests will FAIL until the green phase creates the implementation.

import { describe, expect, it } from "vitest";
import { codeKind } from "../kinds/registry.js";

// -------------------------------------------------------------------
// Read-time normalization of old preview shapes
// -------------------------------------------------------------------

// AM5 K4b: the {file,hunks} forward-compat is no longer needed — the pre-alpha purge
// removes the old shape entirely. The test is updated to document the new rejection behavior.
describe("read-time normalization: old preview shapes", () => {
	it("code kind REJECTS old code_diff-style preview with file + hunks (K4b purge)", () => {
		// After AM5 K4b, the old {file,hunks} shape is no longer accepted.
		// Existing code_diff artifacts are migrated; the schema is the pure content shape.
		const result = codeKind.previewSchema.safeParse({
			kind: "code",
			file: "src/index.ts",
			hunks: [],
		});
		expect(result.success).toBe(false);
	});
});
