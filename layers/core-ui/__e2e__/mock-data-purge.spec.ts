/**
 * Journey: no page renders leftover demo/mock literals from a fixture that
 * has since been deleted (e.g. a hardcoded founder id or seeded product name).
 */

import { expect, test } from "./fixtures";

const FORBIDDEN_LITERALS = ["u-founder", "agent-unassigned", "founder@hyperidle.com"];
const PRODUCTION_PATHS = ["/", "/work", "/work/portfolio", "/conversations", "/documents"];

test.describe("M4 AC-3a — DOM literal sweep: no forbidden strings on production paths", () => {
	for (const path of PRODUCTION_PATHS) {
		test(`no forbidden literals on ${path}`, async ({ page }) => {
			await page.goto(path);
			await page.waitForSelector("[data-testid='main-content']");
			const text = await page.evaluate(() => document.body.innerText);
			for (const literal of FORBIDDEN_LITERALS) {
				expect(
					text,
					`Forbidden literal "${literal}" found on path "${path}". ` +
						"This indicates a hardcoded mock-data string is leaking into the rendered page.",
				).not.toContain(literal);
			}
		});
	}
});
