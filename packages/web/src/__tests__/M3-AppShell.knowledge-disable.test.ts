/**
 * M3 — Cluster F: AppShell no longer imports mock knowledge data.
 *
 * The fixture import (topicsForScope from knowledge-data.ts) was removed
 * in the v0.1.1 cleanup. These tests verify AppShell stays clean of
 * mock data references.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MOCK_IMPORT_RE = /from\s+["']\.\.\/fixtures\/knowledge-data["']/;

// @lore M3: worktree root is 4 levels up from this test file.
const REPO_ROOT = new URL("../../../..", import.meta.url).pathname.replace(/^\/@fs/, "");
const APP_SHELL_PATH = join(REPO_ROOT, "packages/web/src/layouts/AppShell.tsx");

describe("M3 F1 — AppShell has no mock knowledge data imports", () => {
	it("AppShell.tsx does not import from fixtures/knowledge-data", () => {
		let content: string;
		try {
			content = readFileSync(APP_SHELL_PATH, "utf8");
		} catch {
			throw new Error(`Cannot read AppShell.tsx at ${APP_SHELL_PATH}`);
		}

		expect(MOCK_IMPORT_RE.test(content)).toBe(false);
	});

	it("AppShell.tsx no longer has hardcoded count:12 in knowledge submenu", () => {
		let content: string;
		try {
			content = readFileSync(APP_SHELL_PATH, "utf8");
		} catch {
			throw new Error(`Cannot read AppShell.tsx at ${APP_SHELL_PATH}`);
		}

		const hasCountTwelve =
			/path:\s*["']\/knowledge["'][^}]*count:\s*12/.test(content) ||
			/count:\s*12[^}]*path:\s*["']\/knowledge["']/.test(content);

		expect(hasCountTwelve).toBe(false);
	});
});
