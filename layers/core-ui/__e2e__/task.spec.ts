/** The task page on the demo world: the parts graph, a picked part, the box's actions, and the small and recurring tasks. */
import { expect, type Page, test } from "@playwright/test";

const TRIALS = "/work/demo-task-trials";

const graph = (page: Page) => page.getByRole("region", { name: "Parts of this task" });
const box = (page: Page) => page.getByRole("complementary", { name: "About this task" });
const chip = (page: Page, name: string) =>
	graph(page).getByRole("button", { name: new RegExp(`^${name}`) });

test("the whole task shows its parts and their subtasks; a picked part is in the address", async ({
	page,
}) => {
	await page.goto(TRIALS);
	await expect(
		page.getByRole("heading", { name: "Trials that convert without a call" }),
	).toBeVisible();
	await expect(graph(page)).toContainText("Parts 6 of 12 done · 1 needs input · 1 needs review");
	for (const part of [
		"Understand today",
		"Pull last quarter's trial-to-paid numbers",
		"Build the day-12 path",
		"Self-serve checkout at day 12",
		"Reminder email three days before",
		"Run the test for two weeks",
		"Write up what we learned",
	])
		await expect(chip(page, part)).toBeVisible();
	// Its last session ended and none runs now, so it is under way, not "on it".
	await expect(chip(page, "Reminder email three days before")).toContainText("Under way");

	await chip(page, "Build the day-12 path").click();
	await expect(page).toHaveURL(/\/work\/demo-task-trials\?part=demo-task-trials-build$/);
	const part = page.getByRole("heading", { level: 2, name: "Build the day-12 path" });
	await expect(part).toBeVisible();
	await expect(box(page)).toContainText("4 of 8 done");
	await page.reload();
	await expect(part).toBeVisible();

	await page.goBack();
	await expect(page).toHaveURL(/\/work\/demo-task-trials$/);
	await expect(part).toHaveCount(0);
	await expect(box(page)).toContainText("Trials that convert without a call");
});

test("the card part waits for an answer, and its question opens at the card", async ({ page }) => {
	await page.goto(TRIALS);
	await chip(page, "Self-serve checkout at day 12").click();
	await chip(page, "Decide when the card is taken").click();
	await expect(page).toHaveURL(/\?part=demo-task-trials-card$/);
	await expect(
		page.getByText("Builder stopped to ask a question, and waits for the answer."),
	).toBeVisible();
	await expect(box(page)).toContainText("Needs input");

	await box(page).getByRole("button", { name: "When do we take the card?" }).click();
	await expect(page.getByRole("button", { name: /^Ask on day 12/ })).toBeInViewport();
});

test("asking for a review adds a line to done when, and the button goes", async ({ page }) => {
	await page.goto(`${TRIALS}?part=demo-task-trials-build`);
	const ask = box(page).getByRole("button", { name: "Ask for a review" });
	await ask.click();
	await expect(page.getByText("A person looked at it before it counts as done.")).toBeVisible();
	await expect(ask).toHaveCount(0);
	await page.reload();
	await expect(page.getByText("A person looked at it before it counts as done.")).toBeVisible();
	await expect(ask).toHaveCount(0);
});

test("following a task toggles and survives a reload", async ({ page }) => {
	await page.goto(TRIALS);
	const following = box(page).getByRole("button", { name: "Following" });
	await expect(following).toHaveAttribute("aria-pressed", "true");
	await following.click();
	const follow = box(page).getByRole("button", { name: "Follow", exact: true });
	await expect(follow).toHaveAttribute("aria-pressed", "false");
	await page.reload();
	await expect(follow).toBeVisible();
	await follow.click();
	await expect(following).toBeVisible();
	await page.reload();
	await expect(following).toBeVisible();
});

test("on hold and off again; stopped, every part not done says so, and it starts again", async ({
	page,
}) => {
	await page.goto(TRIALS);
	await box(page).getByRole("button", { name: "Put on hold" }).click();
	await expect(
		page.getByText("On hold. The agents finish what they are doing, then wait."),
	).toBeVisible();
	await box(page).getByRole("button", { name: "Take off hold" }).click();
	await expect(box(page).getByRole("button", { name: "Put on hold" })).toBeVisible();

	await box(page).getByRole("button", { name: "Stop" }).click();
	await expect(page.getByText(/^Stopped\. The agents stopped where they were/)).toBeVisible();
	await expect(chip(page, "Reminder email three days before")).toContainText("Stopped");
	await expect(chip(page, "Run the test for two weeks")).toContainText("Stopped");
	await expect(chip(page, "Understand today")).toContainText("Done");
	await expect(
		page
			.getByRole("navigation", { name: "Sidebar" })
			.getByRole("button", { name: /^Trials that convert without a call/ }),
	).toContainText("Stopped");
	await expect(box(page).getByRole("button", { name: "Stop" })).toHaveCount(0);

	await box(page).getByRole("button", { name: "Start again" }).click();
	await expect(page.getByText(/^Six of twelve parts are done\./)).toBeVisible();
	await expect(chip(page, "Run the test for two weeks")).toContainText("Waits");
	await expect(box(page).getByRole("button", { name: "Stop" })).toBeVisible();
});

test("the small fix has no graph and links to the conversation it came from", async ({ page }) => {
	await page.goto("/work/demo-task-utc");
	await expect(page.getByRole("heading", { name: "Trial dates normalised to UTC" })).toBeVisible();
	await expect(box(page)).toContainText("Closed by itself");
	await expect(graph(page)).toHaveCount(0);
	await box(page)
		.getByRole("button", { name: "Thread · Trial-end confusion, three tickets" })
		.click();
	await expect(page).toHaveURL(/\/conversations\/demo-thread-trial-end$/);
});

test("the weekly task folds its finished runs into one chip that opens in place", async ({
	page,
}) => {
	await page.goto("/work/demo-task-weekly-themes");
	const folded = graph(page).getByRole("button", { name: /^11 earlier, done/ });
	await expect(folded).toBeVisible();
	await expect(graph(page).getByRole("button", { name: /^Week of/ })).toHaveCount(2);
	await folded.click();
	await expect(graph(page).getByRole("button", { name: /^Week of/ })).toHaveCount(13);
});
