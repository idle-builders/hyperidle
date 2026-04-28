/**
 * L2 AC-34: HTML reference files exist for the three L2 components.
 *
 * Kept in a separate file from html-components.test.ts (which is on the
 * protected list — only the EXPECTED_COMPONENTS array may be extended).
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const HTML_DIR = resolve(__dirname, "../../html");
const NEW_COMPONENTS = ["Block", "BlockHandle", "BlockActionsPopover"];

describe("AC-34 — L2 HTML reference files", () => {
	for (const name of NEW_COMPONENTS) {
		describe(`${name}.html`, () => {
			const filePath = resolve(HTML_DIR, `${name}.html`);

			it("exists", () => {
				expect(existsSync(filePath)).toBe(true);
			});

			it("is valid HTML (doctype + tokens.css link + lowercase data-ds-component)", () => {
				const html = readFileSync(filePath, "utf-8");
				expect(html).toContain("<!doctype html>");
				expect(html).toContain("_tokens.css");
				const lower =
					name === "Block"
						? "block"
						: name === "BlockHandle"
							? "block-handle"
							: "block-actions-popover";
				expect(html).toContain(`data-ds-component="${lower}"`);
			});
		});
	}
});
