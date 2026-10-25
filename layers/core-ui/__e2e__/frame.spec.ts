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

	// "You" counts what your page lists as waiting for you, no more and no less.
	await sidebar.getByText("4 waiting for you").click();
	await expect(page).toHaveURL(/\/people\/me$/);
	await expect(page.getByRole("heading", { name: /^Waiting for you\s*4$/ })).toBeVisible();
	await page.goBack();
	await expect(page).toHaveURL(/\/conversations\/demo-thread-trial-end$/);

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
	await page.goBack();
	await expect(page).toHaveURL(/\/conversations\/demo-thread-trial-end$/);
	await expect(
		page.getByRole("heading", { name: "Trial-end confusion, three tickets" }),
	).toBeVisible();
});

test("switching Conversations, Work and Knowledge opens the page you last had there, else the first one", async ({
	page,
}) => {
	const sidebar = page.getByRole("navigation", { name: "Sidebar" });
	const spine = (name: string) => sidebar.getByRole("button", { name: new RegExp(`^${name}`) });
	const firstRow = sidebar.locator(".nav-list .nrow").first();

	await page.goto("/");
	await expect(page).toHaveURL(/\/conversations\/[^/]+$/);
	await expect(firstRow).toHaveAttribute("aria-current", "true");

	await sidebar.getByRole("button", { name: /^Trial-end confusion, three tickets/ }).click();
	await spine("Work").click();
	await expect(page).toHaveURL(/\/work\/[^/]+$/);
	await expect(firstRow).toHaveAttribute("aria-current", "true");
	await sidebar.getByRole("button", { name: /^Refund wording/ }).click();

	await spine("Knowledge").click();
	await expect(page).toHaveURL(/\/knowledge\/[^/]+$/);
	await expect(sidebar.locator('.nav-list [aria-current="true"]').first()).toBeVisible();

	await spine("Conversations").click();
	await expect(page).toHaveURL(/\/conversations\/demo-thread-trial-end$/);
	await spine("Work").click();
	await expect(page).toHaveURL(/\/work\/demo-task-refund-wording$/);
});

test("a page whose id does not exist says it did not load, and Try again asks once more", async ({
	page,
}) => {
	for (const [address, what] of [
		["/conversations/no-such-thread", "This thread"],
		["/conversations/demo-thread-trial-end?review=no-such-review", "This review"],
		["/work/no-such-task", "This task"],
		["/knowledge/no-such-document", "This document"],
		["/people/no-such-person", "This page"],
		["/teams/No such team", "This team"],
		["/plugins/no-such-plugin", "This plugin"],
	]) {
		await page.goto(address);
		const failed = page.getByRole("alert");
		await expect(failed).toContainText(`${what} did not load.`);
		await failed.getByRole("button", { name: "Try again" }).click();
		await expect(failed).toContainText("Tried again just now.");
	}
});
