/**
 * L16 — Playwright e2e: bet pitch renders as L2 blocks.
 *
 * Strategy: hermetic page.route() mock for GET /api/bets/:id.
 * No DB seeding required — dev server serves only the SPA bundle.
 *
 * Flow:
 *   1. Navigate to /work/bet/seed-bet-daily-digest.
 *   2. Intercept GET /api/bets/seed-bet-daily-digest → return a rich pitch fixture.
 *   3. Wait for [data-testid="bet-pitch"] to appear.
 *   4. Assert heading text is rendered as a real <h1>/<h2> with no leading "#".
 *   5. Assert no visible line-leading "# " text exists outside code/unknown regions.
 *   6. Assert at least one [data-ds-component="block"] exists inside the section.
 *   7. Assert the legacy <pre data-testid="bet-pitch-body"> is NOT present.
 *
 * AC covered: AC-1 (no raw markdown markers), AC-5 (no # symbols visible),
 * structural removal of legacy <pre>.
 */

import { expect, test } from "./fixtures";

const BET_ID = "seed-bet-daily-digest";

const RICH_BET_FIXTURE = {
	id: BET_ID,
	title: "Daily Digest",
	product: "Acme",
	team: "Alpha Core",
	status: "completed",
	tokensActual: null,
	progress: { done: 0, total: 1 },
	description: `# Problem
The daily digest is missing.

## Appetite
One week.

A paragraph with context.

- First item
- Second item

> A blockquote note.

\`\`\`ts
const digest = true;
\`\`\`
`,
	tasks: [
		{
			id: "seed-task-daily-digest",
			betId: BET_ID,
			title: "Daily digest anchor task",
			ownerAgentId: "seed-agent-cos",
			state: "ready",
			latestSessionOutcome: null,
			latestSessionTokensInput: null,
			latestSessionTokensOutput: null,
			latestSessionHarnessUrl: null,
		},
	],
};

test.describe("L16 — Bet pitch as L2 blocks (e2e)", () => {
	test.beforeEach(async ({ page }) => {
		// Intercept the bets API before navigation so no real fetch fires.
		await page.route(`**/api/bets/${BET_ID}`, (route) => {
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(RICH_BET_FIXTURE),
			});
		});

		await page.goto(`/work/bet/${BET_ID}`);
	});

	test("bet-pitch section is visible with L2 block elements", async ({ page }) => {
		const pitchSection = page.locator("[data-testid='bet-pitch']");
		await expect(pitchSection).toBeVisible();

		// At least one L2 Block element must be present.
		const blocks = pitchSection.locator("[data-ds-component='block']");
		await expect(blocks.first()).toBeVisible();
	});

	test("heading renders as a real h1 or h2 with no leading '#'", async ({ page }) => {
		const pitchSection = page.locator("[data-testid='bet-pitch']");
		await expect(pitchSection).toBeVisible();

		const heading = pitchSection.locator("h1, h2").first();
		await expect(heading).toBeVisible();

		const headingText = await heading.textContent();
		expect(headingText).not.toBeNull();
		expect(headingText?.trimStart()).not.toMatch(/^#/);
		expect(headingText).toContain("Problem");
	});

	test("no visible line-leading '# ' text outside code/unknown regions", async ({ page }) => {
		const pitchSection = page.locator("[data-testid='bet-pitch']");
		await expect(pitchSection).toBeVisible();

		// Get the text content of the pitch section, excluding code and unknown blocks.
		const textOutsideCode = await pitchSection.evaluate((el: HTMLElement) => {
			const clone = el.cloneNode(true) as HTMLElement;
			for (const node of clone.querySelectorAll(
				"[data-ds-kind='code'], [data-ds-kind='unknown']",
			)) {
				node.remove();
			}
			return clone.textContent ?? "";
		});

		// No line should start with "# " (markdown heading syntax).
		const lines = textOutsideCode.split("\n");
		for (const line of lines) {
			expect(line.trimStart()).not.toMatch(/^#\s/);
		}
	});

	test("legacy <pre data-testid='bet-pitch-body'> is NOT present", async ({ page }) => {
		// Wait for the page to finish loading (pit the bet-pitch OR an error state).
		await page.waitForSelector("[data-testid='bet-pitch'], [data-testid='error-state']");

		const legacy = page.locator("pre[data-testid='bet-pitch-body']");
		await expect(legacy).toHaveCount(0);
	});

	test("multiple block kinds render (heading, paragraph, list, code)", async ({ page }) => {
		const pitchSection = page.locator("[data-testid='bet-pitch']");
		await expect(pitchSection).toBeVisible();

		// Heading block.
		await expect(pitchSection.locator("[data-ds-kind='heading']").first()).toBeVisible();
		// Paragraph block.
		await expect(pitchSection.locator("[data-ds-kind='paragraph']").first()).toBeVisible();
		// List block.
		await expect(pitchSection.locator("[data-ds-kind='list']").first()).toBeVisible();
		// Code block.
		await expect(pitchSection.locator("[data-ds-kind='code']").first()).toBeVisible();
	});
});
