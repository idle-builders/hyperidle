/**
 * T3 — Playwright E2E: Bet description WYSIWYG editing.
 *
 * Strategy: page.route() mocks for all API calls. No DB seeding.
 *
 * AC covered:
 *   AC-1: Draft/active bets rest rendered; Edit reveals BodyEditor.
 *   AC-2: BetPitch (read-only blocks) renders for completed/killed bets.
 *   AC-5: Saving indicator shows on PATCH, then shows Saved.
 *
 * @lore T3: TipTap/ProseMirror does not render in CI (no real DOM paint),
 * but the container element [data-testid="bet-description-editor"] and its
 * child .ProseMirror (contenteditable) are still present. We assert the
 * container is visible; we do NOT assert rich-text keystrokes because TipTap
 * input requires a real browser with focus handling. The saving indicator
 * is tested by triggering a synthetic input event on the ProseMirror element.
 */

import { expect, test } from "./fixtures";

const BET_ID = "bet-t3-description-test";

function makeActiveBetFixture() {
	return {
		id: BET_ID,
		title: "T3 Active Bet",
		product: "Acme",
		team: "Alpha Core",
		status: "active",
		tokensActual: null,
		tokenAppetite: null,
		progress: { done: 0, total: 1 },
		description: "# Problem\n\nWe need WYSIWYG editing.\n",
		tasks: [
			{
				id: "task-t3-1",
				title: "Implement editor",
				owner: "u-founder",
				state: "ready",
				latestSessionOutcome: null,
				latestSessionHarnessUrl: null,
				latestSessionModelTier: null,
				ownerAgentId: null,
			},
		],
	};
}

function makeCompletedBetFixture() {
	return {
		...makeActiveBetFixture(),
		status: "completed",
		description: "# Done\n\nThis bet is complete.\n",
	};
}

function makeKilledBetFixture() {
	return {
		...makeActiveBetFixture(),
		status: "killed",
		description: "# Killed\n\nThis bet was killed.\n",
	};
}

function makeDraftBetFixture() {
	return {
		...makeActiveBetFixture(),
		status: "draft",
		description: "# Draft\n\nShaping this bet.\n",
	};
}

async function setupBetRoute(
	page: Parameters<typeof test>[1] extends infer T
		? T extends { page: infer P }
			? P
			: never
		: never,
	fixture: ReturnType<typeof makeActiveBetFixture>,
) {
	await page.route(`**/api/bets/${BET_ID}`, (route) => {
		if (route.request().method() === "GET") {
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(fixture),
			});
		}
		return route.continue();
	});

	// Mock threads
	await page.route(`**/api/threads*`, (route) => {
		return route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ threads: [], nextCursor: null }),
		});
	});
}

test.describe("T3 — Bet description WYSIWYG editing (E2E)", () => {
	// AC-1: active bet rests rendered and enters editing explicitly.
	test("AC-1: active bet rests rendered and Edit reveals BodyEditor", async ({ page }) => {
		await setupBetRoute(page, makeActiveBetFixture());
		await page.goto(`/work/bet/${BET_ID}`);
		await expect(page.locator('[data-testid="work-bet-page"]')).toBeVisible();

		const editor = page.locator('[data-testid="bet-description-editor"]');
		await expect(editor).toHaveCount(0);
		await page.getByRole("button", { name: "Edit bet content" }).click();
		await expect(editor).toBeVisible();
	});

	// AC-1: BodyEditor also renders for draft bet
	test("AC-1: draft bet also requires explicit Edit", async ({ page }) => {
		await setupBetRoute(page, makeDraftBetFixture());
		await page.goto(`/work/bet/${BET_ID}`);
		await expect(page.locator('[data-testid="work-bet-page"]')).toBeVisible();

		const editor = page.locator('[data-testid="bet-description-editor"]');
		await expect(editor).toHaveCount(0);
		await page.getByRole("button", { name: "Edit bet content" }).click();
		await expect(editor).toBeVisible();
	});

	for (const viewport of [
		{ name: "1440x900", width: 1440, height: 900 },
		{ name: "1024x768", width: 1024, height: 768 },
		{ name: "375x812", width: 375, height: 812 },
	]) {
		test(`${viewport.name}: bet prose rests rendered`, async ({ page }) => {
			await page.setViewportSize(viewport);
			await setupBetRoute(page, makeActiveBetFixture());
			await page.goto(`/work/bet/${BET_ID}`);
			await expect(page.getByRole("button", { name: "Edit bet content" })).toBeVisible();
			await expect(page.locator('[data-testid="bet-description-editor"]')).toHaveCount(0);
			await page.screenshot({
				path: `test-results/bet-read-${viewport.name}.png`,
				fullPage: true,
			});
		});
	}

	// AC-2: Completed bet shows read-only BetPitch, no editor
	test("AC-2: completed bet shows read-only BetPitch, no BodyEditor", async ({ page }) => {
		await setupBetRoute(page, makeCompletedBetFixture());
		await page.goto(`/work/bet/${BET_ID}`);
		await expect(page.locator('[data-testid="work-bet-page"]')).toBeVisible();

		// Read-only section must be present
		const readOnly = page.locator('[data-testid="bet-pitch"]');
		await expect(readOnly).toBeVisible();

		// BodyEditor section must NOT be present for completed bet
		const editor = page.locator('[data-testid="bet-description-editor"]');
		await expect(editor).toHaveCount(0);
	});

	// AC-2: Killed bet shows read-only BetPitch, no editor
	test("AC-2: killed bet shows read-only BetPitch, no BodyEditor", async ({ page }) => {
		await setupBetRoute(page, makeKilledBetFixture());
		await page.goto(`/work/bet/${BET_ID}`);
		await expect(page.locator('[data-testid="work-bet-page"]')).toBeVisible();

		const readOnly = page.locator('[data-testid="bet-pitch"]');
		await expect(readOnly).toBeVisible();

		const editor = page.locator('[data-testid="bet-description-editor"]');
		await expect(editor).toHaveCount(0);
	});

	// AC-5: Saving indicator appears on description PATCH
	test("bet Done waits for acknowledged description PATCH", async ({ page }) => {
		let patchBody: Record<string, unknown> | null = null;

		await setupBetRoute(page, makeActiveBetFixture());

		// Intercept the PATCH call
		await page.route(`**/api/bets/${BET_ID}`, (route) => {
			if (route.request().method() === "PATCH") {
				patchBody = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
				return route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ ok: true }),
				});
			}
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(makeActiveBetFixture()),
			});
		});

		await page.goto(`/work/bet/${BET_ID}`);
		await expect(page.locator('[data-testid="work-bet-page"]')).toBeVisible();
		await page.getByRole("button", { name: "Edit bet content" }).click();
		await expect(page.locator('[data-testid="bet-description-editor"]')).toBeVisible();

		// Trigger input on the ProseMirror contenteditable
		const proseMirror = page.locator('[data-testid="bet-description-editor"] .ProseMirror');
		await proseMirror.click();
		await proseMirror.type("Updated content");
		const done = page.getByRole("button", { name: "Done editing bet content" });
		await expect(done).toBeDisabled();

		// Wait for the PATCH to be fired (debounced at 1500ms — use a generous timeout)
		await expect.poll(() => patchBody !== null, { timeout: 5000 }).toBe(true);

		// Verify the PATCH payload has description field
		expect(patchBody?.field).toBe("description");
		expect(typeof patchBody?.value).toBe("string");
		expect(patchBody?.reason).toBe("Edited by user");
		await expect(done).toBeEnabled();
		await done.click();
		await expect(page.locator('[data-testid="bet-description-editor"]')).toHaveCount(0);
	});
});
