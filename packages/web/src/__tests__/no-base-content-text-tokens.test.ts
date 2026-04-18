import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * I4 D3: Color system must be standardised on design-token CSS variables
 * (`var(--text-lo)`, `var(--text-hi)`, `var(--text-mid)`). The `text-base-content/40`,
 * `/50`, `/60`, and `/70` Tailwind opacity utilities must NOT appear in
 * `.tsx` source (excluding `*.stories.tsx` and comment lines).
 */

// @lore Use import.meta.url + fileURLToPath, not __dirname (undefined in ESM).
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SRC_ROOT = join(__dirname, "..");

const TARGET_DIRS = ["components", "shell", "pages", "layouts"];

const BAD_PATTERN = /text-base-content\/(40|50|60|70)/;

function listTsx(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		const st = statSync(full);
		if (st.isDirectory()) {
			if (entry === "__tests__" || entry === "node_modules") continue;
			out.push(...listTsx(full));
		} else if (full.endsWith(".tsx")) {
			// Exclude stories — they are design-system fixtures, not production UI.
			if (full.endsWith(".stories.tsx")) continue;
			out.push(full);
		}
	}
	return out;
}

function filterNonCommentLines(src: string): string {
	// Strip block comments and line comments so grep only inspects real code.
	const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, "");
	const noLine = noBlock
		.split("\n")
		.filter((line) => !line.trim().startsWith("//"))
		.join("\n");
	return noLine;
}

describe("no base-content opacity text tokens in production .tsx", () => {
	it("no .tsx file under components/shell/pages/layouts uses text-base-content/{40,50,60,70}", () => {
		const offenders: string[] = [];
		for (const sub of TARGET_DIRS) {
			const dir = join(SRC_ROOT, sub);
			for (const file of listTsx(dir)) {
				const src = filterNonCommentLines(readFileSync(file, "utf8"));
				if (BAD_PATTERN.test(src)) {
					offenders.push(file.replace(SRC_ROOT, ""));
				}
			}
		}
		expect(offenders).toEqual([]);
	});
});
