/**
 * E2E tests for the Knowledge Information Architecture (J6): scope browser,
 * topic grouping, and the Triage/Curated tab switcher.
 *
 * Skipped: depends on seeded knowledge data that no longer ships as fixtures.
 * Re-enable once a proper E2E seed layer exists.
 *
 * @lore U6: Knowledge scope switching previously used a `knowledge-submenu`
 * testid on a separate Submenu component. The Submenu is deleted in U6 and
 * replaced by static scope sub-items in the Sidebar. The tests below reference
 * the old testid and need a rewrite once the seed layer is available.
 */
import { expect, test } from "./fixtures";

test.describe
	.skip("Knowledge IA (J6)", () => {
		test("scope switching re-scopes the list and topic nav", async ({ page }) => {
			await page.goto("/knowledge");
			await page.waitForSelector("[data-testid='knowledge-list-page']");

			// Practice is the default scope — indicator shows "practice".
			await expect(page.getByTestId("knowledge-scope-indicator")).toHaveText("practice");

			// The Practice scope has an Architecture topic; Factory should not.
			await expect(
				page.getByTestId("knowledge-submenu").getByTestId("knowledge-topic-nav-Architecture"),
			).toBeVisible();

			// Switch to Factory via the submenu scope browser.
			await page.getByTestId("knowledge-submenu").getByRole("tab", { name: "Factory" }).click();

			// Scope indicator updates and topic list swaps to factory topics.
			await expect(page.getByTestId("knowledge-scope-indicator")).toHaveText("factory");
			await expect(
				page.getByTestId("knowledge-submenu").getByTestId("knowledge-topic-nav-Governance"),
			).toBeVisible();
			await expect(
				page.getByTestId("knowledge-submenu").getByTestId("knowledge-topic-nav-Architecture"),
			).toHaveCount(0);

			// Factory list only shows factory items.
			await expect(page.getByText("Agent Autonomy Policy")).toBeVisible();
			await expect(page.getByText("Architecture Decision: Auth Strategy")).toHaveCount(0);
		});

		test("Triage tab is default when items have needs_human and shows reason lines", async ({
			page,
		}) => {
			await page.goto("/knowledge");
			await page.waitForSelector("[data-testid='knowledge-list-page']");

			// Triage is the default because practice has a needs_human item.
			await expect(page.getByRole("tab", { name: "Triage" })).toHaveAttribute(
				"aria-selected",
				"true",
			);
			await expect(page.getByTestId("knowledge-triage-view")).toBeVisible();

			// The top-attention item's reason line is rendered under its title.
			await expect(page.getByText("3 new observations since review")).toBeVisible();

			// A distinct curation suggestion card is visible in triage.
			await expect(page.getByText("Merge these 3 items?")).toBeVisible();

			// Switching to Curated reveals topic group headers with counts.
			await page.getByRole("tab", { name: "Curated" }).click();
			await expect(page.getByTestId("knowledge-curated-view")).toBeVisible();
			const archGroup = page.getByTestId("topic-group-Architecture");
			await expect(archGroup.getByText("Architecture", { exact: true })).toBeVisible();
			await expect(archGroup.getByLabel("3 items")).toBeVisible();
			await expect(archGroup.getByLabel("1 stale")).toBeVisible();
		});
	});
