/** A plugin's page and the Add a plugin dialog on the demo world: every change is read back from the server. */
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";

const RELEASE_NOTES = fileURLToPath(new URL("./__fixtures__/release-notes", import.meta.url));
const pluginBox = (page: Page, name: string) =>
	page.getByRole("complementary", { name: `The plugin ${name}` });
const teamBox = (page: Page) => page.getByRole("complementary", { name: "How Product is set up" });

async function openTeamHabits(page: Page): Promise<void> {
	await page.goto("/teams/Product");
	await teamBox(page)
		.getByRole("button", { name: /^Team habits/ })
		.click();
	await expect(page).toHaveURL(/\/plugins\/team-habits\?team=Product$/);
	await expect(page.getByRole("heading", { name: "Team habits", level: 1 })).toBeVisible();
}

test("Team habits lists its agent, skills and reasons, and what the team changed since", async ({
	page,
}) => {
	await openTeamHabits(page);
	await expect(
		page.getByText("On. It added 1 agent, 2 skills and 2 reasons to start."),
	).toBeVisible();
	await expect(page.getByRole("button", { name: /^FA Facilitation/ })).toBeVisible();
	await expect(page.getByText("Read how a task went")).toBeVisible();
	await expect(page.getByText("Every Friday at 16:00")).toBeVisible();
	await expect(page.getByText("A task finishes with a note on how it went")).toBeVisible();
	const box = pluginBox(page, "Team habits");
	await expect(box).toContainText("Facilitation's instructions");
	await expect(box).toContainText("Maya edited them 2 weeks ago");
	await expect(box).toContainText("You edited this skill last week");

	await page.getByRole("button", { name: /^FA Facilitation/ }).click();
	await expect(page.getByRole("heading", { name: "Facilitation", level: 1 })).toBeVisible();
	await expect(
		page.getByRole("complementary", { name: "How Facilitation is set up" }),
	).toContainText("Came with the plugin Team habits");
});

test("putting the plugin's version back takes the row away and brings back the plugin's text", async ({
	page,
}) => {
	await openTeamHabits(page);
	const box = pluginBox(page, "Team habits");
	await box
		.getByRole("button", { name: "Put the plugin's version back: Facilitation's instructions" })
		.click();
	await expect(box).not.toContainText("Facilitation's instructions");
	await expect(box).toContainText("Changed by the team 1");

	await page.getByRole("button", { name: /^FA Facilitation/ }).click();
	await page
		.getByRole("complementary", { name: "How Facilitation is set up" })
		.getByRole("button", { name: /^Instructions/ })
		.click();
	await expect(page.getByText("Change one thing at a time.")).toBeVisible();
	await expect(page.getByText("Keep a proposal short enough to read in two minutes.")).toHaveCount(
		0,
	);
});

test("switching Team habits off pauses its agent; switching it on lets it work", async ({
	page,
}) => {
	await openTeamHabits(page);
	const box = pluginBox(page, "Team habits");
	await box.getByRole("button", { name: "Switch off" }).click();
	await expect(page.getByText("Off. What it added is paused, not gone.")).toBeVisible();
	await expect(page.getByRole("button", { name: /^FA Facilitation/ })).toContainText(
		"Paused with the plugin",
	);
	await page.getByRole("button", { name: /^FA Facilitation/ }).click();
	await expect(
		page.getByRole("complementary", { name: "How Facilitation is set up" }),
	).toContainText("Paused");

	await openTeamHabits(page);
	await box.getByRole("button", { name: "Switch on" }).click();
	await expect(page.getByText(/^On\. It added 1 agent/)).toBeVisible();
});

test("removing Team habits goes to the team page, and Undo brings it back as it was", async ({
	page,
}) => {
	await openTeamHabits(page);
	await pluginBox(page, "Team habits").getByRole("button", { name: "Remove" }).click();
	await expect(page).toHaveURL(/\/teams\/Product$/);
	await expect(teamBox(page)).toContainText("Team habits is removed.");
	await expect(teamBox(page).getByRole("button", { name: /^Team habits/ })).toHaveCount(0);

	await teamBox(page).getByRole("button", { name: "Undo" }).click();
	await expect(teamBox(page)).not.toContainText("is removed");
	await expect(teamBox(page).getByRole("button", { name: /^Team habits On/ })).toBeVisible();
	await page.reload();
	await expect(teamBox(page).getByRole("button", { name: /^Team habits On/ })).toBeVisible();
	await expect(
		page.getByRole("region", { name: "Works for every team" }).getByRole("button", {
			name: /^FA Facilitation/,
		}),
	).toBeVisible();
});

test("Role personas comes with HyperIdle; installing it puts its agents in the team", async ({
	page,
}) => {
	await page.goto("/teams/Product");
	await teamBox(page)
		.getByRole("button", { name: /^Role personas/ })
		.click();
	await expect(page.getByText("Not installed. Installing adds 7 agents.")).toBeVisible();
	const box = pluginBox(page, "Role personas");
	await expect(box).toContainText("Comes with HyperIdle");
	await expect(box).toContainText("For the Product team");
	await expect(page.getByRole("button", { name: /^QE QA Engineer/ })).toBeDisabled();

	await box.getByRole("button", { name: "Install" }).click();
	await expect(page).toHaveURL(/\/plugins\/role-personas%40[^?]+\?team=Product$/);
	await expect(page.getByText("On. It added 7 agents.")).toBeVisible();
	await expect(box).toContainText("Installed");
	await page.getByRole("button", { name: /^QE QA Engineer/ }).click();
	await expect(page.getByRole("heading", { name: "QA Engineer", level: 1 })).toBeVisible();

	await page.goto("/teams/Product");
	await expect(
		page.getByRole("region", { name: "Works for the whole team" }).getByRole("button", {
			name: /^QE QA Engineer/,
		}),
	).toBeVisible();
});

test("a plugin added from a folder opens its page", async ({ page }) => {
	await page.goto("/teams/Product");
	await teamBox(page).getByRole("button", { name: "Add a plugin" }).click();
	const add = page.getByRole("dialog", { name: "Add a plugin" });
	await add.getByRole("button", { name: "A folder" }).click();
	await add.getByLabel("Where").fill(RELEASE_NOTES);
	await expect(add.getByRole("button", { name: "Product" })).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	await add.getByRole("button", { name: "Add", exact: true }).click();

	await expect(page).toHaveURL(/\/plugins\/release-notes%40[^?]+\?team=Product$/);
	await expect(page.getByRole("heading", { name: "Release notes", level: 1 })).toBeVisible();
	await expect(
		page.getByText("On. It added 1 agent, 1 skill and 1 reason to start."),
	).toBeVisible();
	const box = pluginBox(page, "Release notes");
	await expect(box).toContainText(`From the folder ${RELEASE_NOTES}`);
	await expect(box).toContainText("For the Product team");
	await expect(box).toContainText("by you");
	await expect(page.getByRole("button", { name: /^RW Release writer/ })).toContainText(
		"Writes what shipped, for customers.",
	);
});
