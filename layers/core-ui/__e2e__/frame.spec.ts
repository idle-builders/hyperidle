/** The app's frame on the demo world: one sidebar on real data, and an address per screen. */
import { expect, test } from "@playwright/test";

test("the sidebar lists the demo world and every row is an address you can go back to", async ({
	page,
}) => {
	await page.goto("/");
	const sidebar = page.getByRole("navigation", { name: "Sidebar" });
	const handOff = sidebar.getByRole("button", { name: /^Trial-end confusion, three tickets/ });

	await expect(handOff).toBeVisible();
	await handOff.click();
	await expect(page).toHaveURL(/\/conversations\/demo-thread-trial-end$/);
	await expect(
		page.getByRole("heading", { name: "Trial-end confusion, three tickets" }),
	).toBeVisible();

	await expect(sidebar.getByRole("button", { name: "Notifications, 2 new" })).toBeVisible();

	await sidebar.getByRole("button", { name: /^Work/ }).click();
	const trials = sidebar.getByRole("button", { name: /^Trials that convert without a call/ });
	await expect(trials).toBeVisible();

	await sidebar.getByRole("button", { name: "All teams" }).click();
	await page.getByRole("menuitem", { name: /^Support/ }).click();
	await expect(trials).toHaveCount(0);
	const refunds = sidebar.getByRole("button", { name: /^Refund wording/ });
	await expect(refunds).toBeVisible();

	await refunds.click();
	await expect(page).toHaveURL(/\/work\/demo-task-refund-wording$/);
	await page.reload();
	await expect(page).toHaveURL(/\/work\/demo-task-refund-wording$/);
	await expect(sidebar.getByRole("button", { name: /^Refund wording/ })).toHaveAttribute(
		"aria-current",
		"true",
	);

	await page.goBack();
	await expect(page).toHaveURL(/\/conversations\/demo-thread-trial-end$/);
	await expect(
		page.getByRole("heading", { name: "Trial-end confusion, three tickets" }),
	).toBeVisible();
});
