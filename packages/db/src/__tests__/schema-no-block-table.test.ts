/**
 * L2 AC-44: rejected list — no block_comments or standalone blocks table.
 *
 * Note: T5 intentionally added a `block_id` column to the `messages` table
 * for queryable block-anchored discussions (T5 AC-19/AC-20). The block_id
 * column guard has been removed as of T5. The guards against a separate
 * `block_comments` table and a top-level `blocks` table still hold.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const schemas = [resolve(__dirname, "../schema.ts")];

describe("AC-44 — no block tables added by L2", () => {
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
	}
});
