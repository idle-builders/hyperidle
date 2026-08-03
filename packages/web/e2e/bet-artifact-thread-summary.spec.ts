/**
 * L18 — Bet artifact thread summary Playwright e2e tests.
 *
 * AC coverage:
 *  - bet detail with artifacts that have messages renders summary section
 *  - clicking a row navigates to /artifacts/:id
 *  - empty state renders when no artifact threads exist
 *  - +N more affordance appears when truncated
 */

import { expect, test } from "./fixtures";

const NOW = "2026-05-05T09:00:00.000Z";
const BET_ID = "bet-summary-e2e";
const ARTIFACT_ID_1 = "art-summary-001";
const ARTIFACT_ID_2 = "art-summary-002";

function makeBetResponse() {
	return {
		id: BET_ID,
		title: "Summary Test Bet",
		product: "Alpha",
		team: "Alpha Core",
		status: "in_progress",
		tokensActual: null,
		progress: { done: 1, total: 3 },
		description: "# Problem\n\nThis bet has artifact threads.",
		tasks: [],
	};
}

function makeArtifactSummaryResponse(
	summaries: Array<Record<string, unknown>>,
	totalCount: number,
	truncated: boolean,
) {
	return { summaries, totalCount, truncated };
}

test.describe("L18 — Bet artifact thread summary section", () => {
	test("renders summary section with artifact rows; clicking navigates to artifact", async ({
		page,
	}) => {
		const summaries = [
			{
				artifactId: ARTIFACT_ID_1,
				artifactKind: "text_diff",
				artifactTitle: "auth-service.ts",
				threadId: "t-sum-001",
				messageCount: 3,
				lastMessageAt: "2026-05-05T10:00:00Z",
				lastMessageSnippet: "Looks good but the cache TTL is too long",
				hasUnresolvedReview: false,
			},
			{
				artifactId: ARTIFACT_ID_2,
				artifactKind: "code_diff",
				artifactTitle: "component.tsx",
				threadId: "t-sum-002",
				messageCount: 1,
				lastMessageAt: "2026-05-05T09:00:00Z",
				lastMessageSnippet: "Minor fix needed",
				hasUnresolvedReview: true,
			},
		];

		await page.route(`**/api/bets/${BET_ID}`, async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(makeBetResponse()),
			});
		});

		await page.route(`**/api/bets/${BET_ID}/artifact-thread-summary`, async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(makeArtifactSummaryResponse(summaries, 2, false)),
			});
		});

		// Mock thread list (no threads for bet itself for simplicity)
		await page.route(`**/api/threads?**host_kind=bet**`, async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ threads: [], nextCursor: null }),
			});
		});

		await page.goto(`/work/bet/${BET_ID}`);

		// Artifact threads summary section should be visible
		await expect(page.getByTestId("artifact-threads-summary")).toBeVisible();

		// Both artifact rows should be visible
		await expect(page.getByText("auth-service.ts")).toBeVisible();
		await expect(page.getByText("component.tsx")).toBeVisible();

		// Snippet text should appear
		await expect(page.getByText(/Looks good but the cache TTL/)).toBeVisible();

		// Clicking the first row navigates to the artifact permalink
		await page.click(`[data-artifact-id="${ARTIFACT_ID_1}"]`);
		await expect(page).toHaveURL(`/artifacts/${ARTIFACT_ID_1}`);
	});

	test("empty state renders when bet has no artifact thread messages", async ({ page }) => {
		await page.route(`**/api/bets/${BET_ID}`, async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(makeBetResponse()),
			});
		});

		await page.route(`**/api/bets/${BET_ID}/artifact-thread-summary`, async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(makeArtifactSummaryResponse([], 0, false)),
			});
		});

		await page.route(`**/api/threads?**host_kind=bet**`, async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ threads: [], nextCursor: null }),
			});
		});

		await page.goto(`/work/bet/${BET_ID}`);

		await expect(page.getByTestId("artifact-threads-summary-empty")).toBeVisible();
	});

	test("renders +N more affordance when truncated", async ({ page }) => {
		const summaries = new Array(10).fill({
			artifactId: "art-x",
			artifactKind: "text_diff",
			artifactTitle: "file.ts",
			threadId: "t-x",
			messageCount: 1,
			lastMessageAt: NOW,
			lastMessageSnippet: "snippet",
			hasUnresolvedReview: false,
		});

		await page.route(`**/api/bets/${BET_ID}`, async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(makeBetResponse()),
			});
		});

		await page.route(`**/api/bets/${BET_ID}/artifact-thread-summary`, async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(makeArtifactSummaryResponse(summaries, 12, true)),
			});
		});

		await page.route(`**/api/threads?**host_kind=bet**`, async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ threads: [], nextCursor: null }),
			});
		});

		await page.goto(`/work/bet/${BET_ID}`);

		await expect(page.getByTestId("artifact-threads-summary-more")).toBeVisible();
		await expect(page.getByText(/\+2 more/i)).toBeVisible();
	});
});
