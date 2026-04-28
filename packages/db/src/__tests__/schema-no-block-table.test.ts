/**
 * L2 AC-44: rejected list — no block_comments, blocks, or block_id columns.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const schemas = [resolve(__dirname, "../schema.ts"), resolve(__dirname, "../schema.pg.ts")];

describe("AC-44 — no block tables or block_id columns added by L2", () => {
	for (const path of schemas) {
		const src = readFileSync(path, "utf-8");
		const file = path.split("/").pop() ?? path;

		it(`${file} has no 'block_comments' table reference`, () => {
			expect(src).not.toMatch(/['"`]block_comments['"`]/);
			expect(src).not.toMatch(/sqliteTable\(\s*['"`]block_comments['"`]/);
			expect(src).not.toMatch(/pgTable\(\s*['"`]block_comments['"`]/);
		});

		it(`${file} has no top-level 'blocks' table`, () => {
			expect(src).not.toMatch(/sqliteTable\(\s*['"`]blocks['"`]/);
			expect(src).not.toMatch(/pgTable\(\s*['"`]blocks['"`]/);
		});

		it(`${file} has no 'block_id' column`, () => {
			expect(src).not.toMatch(/['"`]block_id['"`]/);
		});
	}
});
