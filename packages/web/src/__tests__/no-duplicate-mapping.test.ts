import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * I4 S4/S5: Status mapping must be the single source of truth. Duplicate
 * `betStatusToChipStatus` in Rail.tsx and `knowledgeStatusToChipStatus` in
 * KnowledgeDetail.tsx must be removed — those call sites must import from
 * `status-mapping.ts`.
 *
 * We enforce this structurally by reading the source files and asserting
 * the duplicate function names appear ONLY in `status-mapping.ts` (if at
 * all; the canonical name there is `betStatusToStatus` / `knowledgeStatusToStatus`).
 */

// @lore Use import.meta.url + fileURLToPath (not __dirname, undefined in ESM).
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SRC_ROOT = join(__dirname, "..");

function walkTsx(dir: string, acc: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		const st = statSync(full);
		if (st.isDirectory()) {
			if (entry === "__tests__" || entry === "node_modules") continue;
			walkTsx(full, acc);
		} else if (full.endsWith(".tsx") || full.endsWith(".ts")) {
			acc.push(full);
		}
	}
	return acc;
}

const ALL_SOURCE_FILES = walkTsx(SRC_ROOT);

describe("no duplicate status mapping helpers", () => {
	it("betStatusToChipStatus is not defined anywhere in web source", () => {
		// I4 S4: the duplicate in Rail.tsx must be deleted. The canonical
		// helper is `betStatusToStatus` in status-mapping.ts.
		const offenders: string[] = [];
		for (const file of ALL_SOURCE_FILES) {
			const src = readFileSync(file, "utf8");
			if (/function\s+betStatusToChipStatus\b/.test(src)) {
				offenders.push(file);
			}
		}
		expect(offenders).toEqual([]);
	});

	it("knowledgeStatusToChipStatus is not defined anywhere in web source", () => {
		// I4 S5: the duplicate in KnowledgeDetail.tsx must be deleted.
		const offenders: string[] = [];
		for (const file of ALL_SOURCE_FILES) {
			const src = readFileSync(file, "utf8");
			if (/function\s+knowledgeStatusToChipStatus\b/.test(src)) {
				offenders.push(file);
			}
		}
		expect(offenders).toEqual([]);
	});

	it("canonical betStatusToStatus lives in components/status-mapping.ts", () => {
		const canonical = join(SRC_ROOT, "components", "status-mapping.ts");
		const src = readFileSync(canonical, "utf8");
		expect(src).toMatch(/export function betStatusToStatus\b/);
	});

	it("canonical knowledgeStatusToStatus lives in components/status-mapping.ts", () => {
		const canonical = join(SRC_ROOT, "components", "status-mapping.ts");
		const src = readFileSync(canonical, "utf8");
		expect(src).toMatch(/export function knowledgeStatusToStatus\b/);
	});
});
