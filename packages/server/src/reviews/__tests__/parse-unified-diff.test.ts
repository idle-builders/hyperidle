/**
 * AO3 RED — parseUnifiedDiff unit tests (AC2).
 *
 * Pure parser: unified diff text → CodeDiffPayload.
 * No git, no DB, no network — fully deterministic.
 */

import { describe, expect, test } from "vitest";
import { parseUnifiedDiff } from "../parse-unified-diff.js";

const THREE_FILE_PATCH = `diff --git a/src/index.ts b/src/index.ts
index abc1234..def5678 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,4 +1,6 @@
 import { foo } from "./foo.js";
+import { bar } from "./bar.js";
+import { baz } from "./baz.js";

 function main() {
-  foo();
+  foo();
+  bar();
 }
diff --git a/src/foo.test.ts b/src/foo.test.ts
index 1111111..2222222 100644
--- a/src/foo.test.ts
+++ b/src/foo.test.ts
@@ -1,3 +1,5 @@
 describe("foo", () => {
+  it("works", () => {
+    expect(foo()).toBeTruthy();
+  });
 });
diff --git a/package-lock.json b/package-lock.json
index 3333333..4444444 100644
--- a/package-lock.json
+++ b/package-lock.json
@@ -1,2 +1,2 @@
-  "version": "1.0.0",
+  "version": "1.0.1",
`;

describe("parseUnifiedDiff", () => {
	test("parses 3-file patch: correct file count and paths", () => {
		const payload = parseUnifiedDiff(THREE_FILE_PATCH, "add imports");
		expect(payload.prTitle).toBe("add imports");
		expect(payload.files).toHaveLength(3);
		const paths = payload.files.map((f) => f.path);
		expect(paths).toContain("src/index.ts");
		expect(paths).toContain("src/foo.test.ts");
		expect(paths).toContain("package-lock.json");
	});

	test("classifies bands: logic / test / trivia", () => {
		const payload = parseUnifiedDiff(THREE_FILE_PATCH, "x");
		const bands = Object.fromEntries(payload.files.map((f) => [f.path, f.band]));
		expect(bands["src/index.ts"]).toBe("logic");
		expect(bands["src/foo.test.ts"]).toBe("test");
		expect(bands["package-lock.json"]).toBe("trivia");
	});

	test("hunk header preserved verbatim, lines classified add/del/ctx", () => {
		const payload = parseUnifiedDiff(THREE_FILE_PATCH, "x");
		const indexFile = payload.files.find((f) => f.path === "src/index.ts");
		expect(indexFile).toBeDefined();
		expect(indexFile?.hunks).toHaveLength(1);
		const hunk = indexFile?.hunks?.[0];
		expect(hunk?.header).toBe("@@ -1,4 +1,6 @@");
		// Lines: 1 ctx, 2 add, 1 ctx, 1 del, 2 add, 1 ctx
		const kinds = hunk?.lines.map((l) => l.kind);
		expect(kinds).toContain("add");
		expect(kinds).toContain("del");
		expect(kinds).toContain("ctx");
	});

	test("added/removed counts per file", () => {
		const payload = parseUnifiedDiff(THREE_FILE_PATCH, "x");
		const idx = payload.files.find((f) => f.path === "src/index.ts");
		expect(idx?.added).toBeGreaterThan(0);
		expect(idx?.removed).toBeGreaterThan(0);
	});

	test("line numbers track correctly for ctx and add lines", () => {
		const payload = parseUnifiedDiff(THREE_FILE_PATCH, "x");
		const testFile = payload.files.find((f) => f.path === "src/foo.test.ts");
		const hunk = testFile?.hunks?.[0];
		expect(hunk).toBeDefined();
		// ctx line at old line 1 + new line 1
		const firstCtx = hunk?.lines.find((l) => l.kind === "ctx");
		expect(firstCtx?.oldNo).toBe(1);
		expect(firstCtx?.newNo).toBe(1);
		// add lines have no oldNo
		const addLines = hunk?.lines.filter((l) => l.kind === "add");
		expect(addLines).toBeDefined();
		for (const line of addLines ?? []) {
			expect(line.oldNo).toBeNull();
			expect(line.newNo).not.toBeNull();
		}
	});

	test("returns valid CodeDiffPayload shape: description, checks, triviaSummary", () => {
		const payload = parseUnifiedDiff(THREE_FILE_PATCH, "my PR");
		expect(typeof payload.description).toBe("string");
		expect(Array.isArray(payload.checks)).toBe(true);
		expect(typeof payload.triviaSummary).toBe("string");
	});

	test("empty patch returns empty files array", () => {
		const payload = parseUnifiedDiff("", "empty");
		expect(payload.files).toHaveLength(0);
	});
});
