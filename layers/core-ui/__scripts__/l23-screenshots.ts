/**
 * L23 visual proof script — capture screenshots of KnowledgeBody states.
 * Run: npx tsx __scripts__/l23-screenshots.ts
 */

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const BASE_URL = "http://localhost:5179";
const PROOF_DIR = join(import.meta.dirname, "../../../../plans/L23/proof");

async function run(): Promise<void> {
	await mkdir(PROOF_DIR, { recursive: true });

	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

	// Screenshot 1 — k1 (single-paragraph belief, no chrome)
	await page.goto(`${BASE_URL}/knowledge/k1`);
	await page.waitForSelector("[data-testid='knowledge-body']");
	await page.screenshot({
		path: join(PROOF_DIR, "k1-belief-body.png"),
		fullPage: false,
	});
	console.log("Saved k1-belief-body.png");

	// Screenshot 2 — inject multi-section playbook then screenshot
	await page.goto(`${BASE_URL}/knowledge/k1`);
	await page.waitForSelector("[data-testid='knowledge-detail-page']");
	await page.getByRole("button", { name: /edit/i }).click();
	await page
		.getByTestId("knowledge-edit-textarea")
		.fill(
			[
				"# Onboarding playbook",
				"",
				"Quick reference for new agent provisioning.",
				"",
				"## Provisioning",
				"",
				"Follow the runbook in /docs/runbooks/agent-provision.md.",
				"",
				"## Permissions",
				"",
				"Grant via the role-template, never ad hoc.",
				"",
				"### Edge cases",
				"",
				"Read-only routines need only `routines:run`.",
				"",
				"## Verification",
				"",
				"Confirm with `bun run check` and the smoke test.",
				"",
				"## Rollback",
				"",
				"`git revert` then re-run provisioning.",
			].join("\n"),
		);
	await page.getByRole("button", { name: /save/i }).click();
	await page.waitForSelector("[data-testid='knowledge-body']");
	await page.screenshot({
		path: join(PROOF_DIR, "k1-playbook-body.png"),
		fullPage: false,
	});
	console.log("Saved k1-playbook-body.png");

	// Screenshot 3 — empty state
	await page.goto(`${BASE_URL}/knowledge/k1`);
	await page.waitForSelector("[data-testid='knowledge-detail-page']");
	await page.getByRole("button", { name: /edit/i }).click();
	await page.getByTestId("knowledge-edit-textarea").fill("");
	await page.getByRole("button", { name: /save/i }).click();
	await page.waitForSelector("[data-testid='knowledge-body']");
	await page.screenshot({
		path: join(PROOF_DIR, "k1-empty-body.png"),
		fullPage: false,
	});
	console.log("Saved k1-empty-body.png");

	await browser.close();
	console.log(`All screenshots saved to ${PROOF_DIR}`);
}

run().catch((err: unknown) => {
	console.error(err);
	process.exit(1);
});
