/**
 * L2 AC-27b: golden-ids snapshot enforces BLOCK_ID_VERSION.
 *
 * Loads framework/shared/src/__tests__/blocks/golden-ids.json (frozen corpus)
 * and asserts deriveBlocks() reproduces the expected ids byte-for-byte. Any
 * algorithm drift requires updating BOTH the snapshot AND the version tag.
 */

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { deriveBlocks } from "../../blocks/index.js";

const FIXTURES_DIR = resolve(__dirname, "fixtures/golden-corpus");
const SNAPSHOT_PATH = resolve(__dirname, "golden-ids.json");

interface Snapshot {
	[fixtureName: string]: string[];
}

const snapshot: Snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf-8"));

const HOST = { kind: "bet" as const, id: "golden-host" };

describe("BlockId golden snapshot", () => {
	it("snapshot contains entries for every fixture in the corpus", () => {
		const files = readdirSync(FIXTURES_DIR).filter((f: string) => f.endsWith(".md"));
		expect(files.length).toBeGreaterThanOrEqual(10);
		for (const f of files) {
			const name = f.replace(/\.md$/, "");
			expect(snapshot[name], `missing snapshot entry: ${name}`).toBeTruthy();
		}
	});

	const fixtures = (() => {
		try {
			return readdirSync(FIXTURES_DIR).filter((f: string) => f.endsWith(".md"));
		} catch {
			return [];
		}
	})();

	for (const f of fixtures) {
		const name = f.replace(/\.md$/, "");
		it(`fixture ${name} matches frozen ids`, () => {
			const body = readFileSync(resolve(FIXTURES_DIR, f), "utf-8");
			const ids = deriveBlocks(body, HOST).blocks.map((b) => b.id);
			expect(ids).toEqual(snapshot[name]);
		});
	}
});
