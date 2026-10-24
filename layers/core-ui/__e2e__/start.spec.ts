/** First start on a fresh install: the programs found here, your names, and your first conversation. */
import { expect, test } from "@playwright/test";

test("a fresh install starts at first start, and Start talking lands in the first conversation", async ({
	page,
}) => {
	await page.goto("/conversations");
	await expect(page).toHaveURL(/\/start$/);
	const found = page.getByRole("region", { name: "Found on this computer" });
	await expect(found.getByText("Claude Code")).toBeVisible();
	await expect(found.getByText("signed in").first()).toBeVisible();

	await page.getByRole("button", { name: "Join a team on a server instead" }).click();
	await expect(page.getByText(/Joining happens in the HyperIdle desktop app/)).toBeVisible();
	await page.getByRole("button", { name: "Start a new team on this computer instead" }).click();

	await page.getByRole("textbox", { name: "Your name" }).fill("Ada Lovelace");
	await page.getByRole("textbox", { name: "Team name" }).fill("Product");
	await page.getByRole("button", { name: "Start talking" }).click();

	await expect(page).toHaveURL(/\/conversations\/[^/?]+\?first=1$/);
	await expect(page.getByRole("heading", { name: "Getting started" })).toBeVisible();
	const thread = page.getByRole("log", { name: "Messages" });
	await expect(thread.getByText("Builder", { exact: true })).toBeVisible();
	await expect(thread.getByText(/^Hi\. I run on .+ on this computer/)).toBeVisible();

	// "Not now" puts the offer away; "Connect a folder" opens the folder dialog on your page.
	const first = page.url();
	await thread.getByRole("button", { name: "Not now" }).click();
	await expect(thread.getByRole("button", { name: "Connect a folder" })).toHaveCount(0);
	await page.goto(first);
	await thread.getByRole("button", { name: "Connect a folder" }).click();
	await expect(page).toHaveURL(/\/people\/me/);
	await expect(page.getByRole("dialog", { name: "Where you and your agents work" })).toBeVisible();

	// Started once: first start sends you on.
	await page.goto("/start");
	await expect(page).toHaveURL(/\/conversations$/);
});
