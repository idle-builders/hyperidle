/**
 * L2 AC-43: rejected list — no /permalink or /blocks routes.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROUTES_DIR = resolve(__dirname, "../routes");

const collectFiles = (dir: string, acc: string[] = []): string[] => {
	for (const entry of readdirSync(dir)) {
		const p = resolve(dir, entry);
		if (statSync(p).isDirectory()) collectFiles(p, acc);
		else if (p.endsWith(".ts")) acc.push(p);
	}
	return acc;
};

describe("AC-43 — server has no /permalink or /blocks route", () => {
	const files = collectFiles(ROUTES_DIR);

	it("no source file declares a /permalink route", () => {
		for (const f of files) {
			const src = readFileSync(f, "utf-8");
			expect(src, `unexpected /permalink route in ${f}`).not.toMatch(/['"`]\/permalink/);
		}
	});

	it("no source file declares a /blocks route", () => {
		for (const f of files) {
			const src = readFileSync(f, "utf-8");
			expect(src, `unexpected /blocks route in ${f}`).not.toMatch(
				/\.(get|post|put|patch|delete)\(\s*['"`]\/blocks/,
			);
		}
	});
});
