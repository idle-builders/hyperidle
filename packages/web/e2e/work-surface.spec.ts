/**
 * J5 — Work Surface E2E flows.
 *
 * Flow 1: Portfolio page structure — product cards carry lead avatar,
 * active-bet count, shipped count, and a cycle-management stripe
 * renders below the grid.
 *
 * Flow 2: Team Board → Select Pitches → Click a pitch → the inline
 * detail pane appears with problem / solution / rabbit holes and the
 * "Add to canvas" button.
 */
import { expect, test } from "@playwright/test";

test.describe("J5 — Work Surface", () => {
	test("Portfolio renders 4 product cards with lead + bets + shipped + cycle stripe", async ({
		page,
	}) => {
		await page.goto("/work/portfolio");
		await page.waitForSelector("[data-testid='work-portfolio-page']");

		const cards = page.getByTestId("product-card");
		await expect(cards).toHaveCount(4);

		// The first card must expose a lead-agent avatar.
		const leadAvatar = cards.first().getByLabel(/Lead agent:/);
		await expect(leadAvatar).toBeVisible();

		// "Active bets" / "Shipped" labels appear on every card.
		await expect(cards.first().getByText(/Active bets?/i)).toBeVisible();
		await expect(cards.first().getByText(/Shipped/i)).toBeVisible();

		// Cycle-management stripe below the grid with current cycle +
		// days remaining.
		const stripe = page.getByTestId("cycle-stripe");
		await expect(stripe).toBeVisible();
		await expect(stripe).toContainText(/cycle/i);
		await expect(stripe).toContainText(/days? remaining/i);
	});

	test("Team Board → Select Pitches → pitch detail pane exposes Add to canvas", async ({
		page,
	}) => {
		await page.goto("/work/team");
		await page.waitForSelector("[data-testid='work-team-page']");

		// Before opening the selector, there's no Add to canvas button.
		await expect(page.getByRole("button", { name: /add to canvas/i })).toHaveCount(0);

		await page.getByRole("button", { name: "Select Pitches" }).click();
		await expect(page.getByText("Select Pitch")).toBeVisible();

		// Click a pitch title → inline detail pane becomes visible.
		await page.getByText("Mobile responsive layout").click();
		const pane = page.getByTestId("pitch-detail-pane");
		await expect(pane).toBeVisible();
		await expect(pane).toContainText(/problem/i);
		await expect(pane).toContainText(/appetite/i);
		await expect(pane).toContainText(/solution/i);
		await expect(pane).toContainText(/rabbit holes?/i);

		// Add to canvas lives inside the detail pane only.
		const addButton = pane.getByRole("button", { name: /add to canvas/i });
		await expect(addButton).toBeVisible();

		// The selector REPLACES the Kanban; the kanban testid is not in
		// the DOM while the overlay is open.
		await expect(page.getByTestId("work-team-kanban")).toHaveCount(0);
	});
});
