/** A team's page, a user's page and the set-up dialogs on the demo world: everything saved is read back. */
import { expect, type Page, test } from "@playwright/test";

const BUILDER = "/people/demo-agent-builder";
const GROWTH = "/people/demo-agent-growth";
const box = (page: Page, name: string) =>
	page.getByRole("complementary", { name: `How ${name} is set up` });
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name });

test("the team page lists each person with their agents, and the agents of every team", async ({
	page,
}) => {
	await page.goto("/teams/Product");
	await expect(page.getByRole("heading", { name: "Product", level: 1 })).toBeVisible();
	const finn = page.getByRole("region", { name: "You and their agents" });
	await expect(finn.getByRole("button", { name: /^FO Finn Olsen/ })).toBeVisible();
	await expect(finn.getByRole("button", { name: /^BU Builder/ })).toBeVisible();
	await expect(finn.getByRole("button", { name: /^GR Growth/ })).toBeVisible();
	const every = page.getByRole("region", { name: "Works for every team" });
	await expect(every.getByRole("button", { name: /^FA Facilitation/ })).toBeVisible();
	await expect(box(page, "Product")).toContainText("Team habits");

	await finn.getByRole("button", { name: /^BU Builder/ }).click();
	await expect(page).toHaveURL(new RegExp(`${BUILDER}$`));
	await expect(page.getByRole("heading", { name: "On now" })).toBeVisible();
	await expect(box(page, "Builder")).toContainText("Agent · works for you");
	await expect(box(page, "Builder")).toContainText("~/code/northwind");
});

test("editing an agent saves what it does and its discipline; pausing it says so", async ({
	page,
}) => {
	await page.goto(BUILDER);
	await box(page, "Builder").getByRole("button", { name: "Edit", exact: true }).click();
	const edit = dialog(page, "Edit Builder");
	await edit.getByLabel("What it does").fill("Builds, tests and ships.");
	await edit.getByLabel("Discipline").fill("Platform");
	await edit.getByRole("button", { name: "Save" }).click();
	await expect(edit).toHaveCount(0);
	await page.reload();
	await expect(page.getByText("Builds, tests and ships.")).toBeVisible();
	await expect(box(page, "Builder")).toContainText("Discipline Platform");

	await box(page, "Builder").getByRole("button", { name: "Pause" }).click();
	await expect(box(page, "Builder")).toContainText("Paused");
	await expect(page.getByText("Paused. It takes no new work until you let it.")).toBeVisible();
	await box(page, "Builder").getByRole("button", { name: "Let it work" }).click();
	await expect(box(page, "Builder").getByRole("button", { name: "Pause" })).toBeVisible();
});

test("a folder added on one agent's page goes to every agent of yours", async ({ page }) => {
	await page.goto(BUILDER);
	await box(page, "Builder").getByRole("button", { name: "Add a folder" }).click();
	const where = dialog(page, "Where Builder works");
	await where.getByLabel("Where").fill("~/code/northwind-billing");
	await where.getByRole("button", { name: "Save" }).click();
	await expect(where).toHaveCount(0);
	await expect(box(page, "Builder")).toContainText("~/code/northwind-billing");
	await page.goto(GROWTH);
	await expect(box(page, "Growth")).toContainText("~/code/northwind-billing");
});

test("a service unticked for Growth no longer reaches it, and still reaches Builder", async ({
	page,
}) => {
	await page.goto(GROWTH);
	await expect(box(page, "Growth")).toContainText("Zendesk");
	await box(page, "Growth").getByRole("button", { name: "Connect a service" }).click();
	const reach = dialog(page, "What Growth can reach");
	await reach.getByRole("checkbox", { name: "Zendesk" }).uncheck();
	await reach.getByRole("button", { name: "Save" }).click();
	await expect(reach).toHaveCount(0);
	await expect(box(page, "Growth")).not.toContainText("Zendesk");
	await page.reload();
	await expect(box(page, "Growth")).toContainText("Stripe");
	await expect(box(page, "Growth")).not.toContainText("Zendesk");
	await page.goto(BUILDER);
	await expect(box(page, "Builder")).toContainText("Zendesk");
});

test("a new reason to start opens what it should do as a document to write", async ({ page }) => {
	await page.goto(GROWTH);
	await box(page, "Growth").getByRole("button", { name: "Add a time or an event" }).click();
	const start = dialog(page, "When Growth starts working");
	await start.getByRole("button", { name: "Add a time" }).click();
	await start.getByLabel("Day", { exact: true }).selectOption("Thursday");
	await start.getByLabel("Name").fill("Pricing page check");
	await start.getByRole("button", { name: "Add", exact: true }).click();
	await expect(page).toHaveURL(/\/knowledge\/doc_sp_[^?]+\?edit$/);
	await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue("Pricing page check");
	await page.goto(GROWTH);
	await expect(box(page, "Growth")).toContainText("Every Thursday at 08:00");
	await expect(box(page, "Growth")).toContainText("it starts a run of Pricing page check");
});

test("adding an agent opens its page, where its instructions are written next", async ({
	page,
}) => {
	await page.goto("/teams/Product");
	await page.getByRole("button", { name: "Add someone to Product" }).click();
	const add = dialog(page, "Add someone");
	await add.getByLabel("Name").fill("Researcher");
	await add.getByLabel("What it does").fill("Reads what competitors ship and writes it down.");
	await add.getByRole("button", { name: "Add", exact: true }).click();
	await expect(page.getByRole("heading", { name: "Researcher", level: 1 })).toBeVisible();
	await expect(page.getByText("New. It has no instructions yet.")).toBeVisible();
	await page.getByRole("button", { name: "Write its instructions" }).click();
	await expect(page).toHaveURL(/\/knowledge\/doc_af_[^?]+\?edit$/);
	await page.goto("/teams/Product");
	await expect(
		page.getByRole("region", { name: "You and their agents" }).getByRole("button", {
			name: /^RE Researcher/,
		}),
	).toBeVisible();
});

test("your page: a reason switched off stays off; Dark changes the looks; Look again looks", async ({
	page,
}) => {
	await page.goto("/people/me");
	const you = box(page, "Finn Olsen");
	const mentions = you.getByRole("switch", { name: "Someone mentions me" });
	await expect(mentions).toHaveAttribute("aria-checked", "true");
	await mentions.click();
	await expect(mentions).toHaveAttribute("aria-checked", "false");
	await page.reload();
	await expect(mentions).toHaveAttribute("aria-checked", "false");

	const paper = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
	await you.getByRole("button", { name: "Light" }).click();
	const light = await paper();
	await you.getByRole("button", { name: "Dark" }).click();
	await expect.poll(paper).not.toBe(light);
	await page.reload();
	await expect.poll(paper).not.toBe(light);
	await you.getByRole("button", { name: "Light" }).click();
	await expect.poll(paper).toBe(light);

	await you.getByRole("button", { name: "Look again" }).click();
	await expect(you.getByRole("button", { name: /^Looked just now/ })).toBeVisible();
});

test("the bell's 'Change what you are told about' opens the dialog on your page", async ({
	page,
}) => {
	await page.goto("/people/me");
	await page.getByRole("button", { name: /^Notifications/ }).click();
	await page.getByRole("button", { name: "Change what you are told about" }).first().click();
	await expect(dialog(page, "What you are told about")).toBeVisible();
});

test("opening what a notification is about reads it, and the bell counts one fewer", async ({
	page,
}) => {
	await page.goto("/people/me");
	const address = await page.evaluate(async () => {
		const res = await fetch("/api/actions/open_user", {
			method: "POST",
			headers: { "X-API-Key": "hyperidle-dev-local", "Content-Type": "application/json" },
			body: "{}",
		});
		const { data } = (await res.json()) as {
			data: { inbox: { change: { object: string; objectId: string }; readAt: string | null }[] };
		};
		const unread = data.inbox.filter((r) => r.readAt === null);
		const route = { thread: "conversations", task: "work", document: "knowledge" } as const;
		const first = unread.find((r) => r.change.object in route);
		const where = first && route[first.change.object as keyof typeof route];
		return { count: unread.length, to: first ? `/${where}/${first.change.objectId}` : "" };
	});
	expect(address.to).not.toBe("");
	const sidebar = page.getByRole("navigation", { name: "Sidebar" });
	await expect(
		sidebar.getByRole("button", { name: `Notifications, ${address.count} new` }),
	).toBeVisible();

	await page.goto(address.to);
	await expect(
		sidebar.getByRole("button", { name: `Notifications, ${address.count - 1} new` }),
	).toBeVisible();
});
