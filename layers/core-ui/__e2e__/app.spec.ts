/** Apps on the demo world: a card where space is tight, the whole app beside the work or as a page, and the box it runs in. */
import { expect, type FrameLocator, type Page, test } from "@playwright/test";

const PRICE_APP = "demo-doc-app-trial-end-price";

/** The app's own document: two frames down, inside the box. */
const appIn = (page: Page, title: string): FrameLocator =>
	page.frameLocator(`iframe[title="${title}"]`).frameLocator("iframe");

test("an app made in a thread is a card there; it runs beside the thread and opens as a page", async ({
	page,
}) => {
	await page.goto("/conversations/demo-thread-trial-end");
	const card = page.getByRole("button", { name: /^Trial-end price/ });
	await expect(card).toContainText("App");
	await expect(card).toContainText("What someone pays on the day their trial ends");

	await card.click();
	await expect(page).toHaveURL(new RegExp(`\\?app=${PRICE_APP}$`));
	const pane = page.getByRole("complementary", { name: "Trial-end price" });
	await expect(pane).toBeVisible();
	await expect(
		page.getByRole("heading", { name: "Trial-end confusion, three tickets" }),
	).toBeVisible();

	const app = appIn(page, "Trial-end price");
	await app.getByRole("button", { name: "Team" }).click();
	await expect(app.getByText("On day 15 you pay £29")).toBeVisible();

	await pane.getByRole("button", { name: "Close" }).click();
	await expect(pane).toBeHidden();
	await expect(page).toHaveURL(/\/conversations\/demo-thread-trial-end$/);

	await card.click();
	await page
		.getByRole("complementary", { name: "Trial-end price" })
		.getByRole("button", { name: "Open as a page" })
		.click();
	await expect(page).toHaveURL(new RegExp(`/knowledge/${PRICE_APP}$`));
	await appIn(page, "Trial-end price").getByRole("button", { name: "Team" }).click();
	await expect(appIn(page, "Trial-end price").getByText("On day 15 you pay £29")).toBeVisible();
});

test("an app a task made says so in the task's box and opens beside the task", async ({ page }) => {
	await page.goto("/work/demo-task-trials?part=demo-task-trials-numbers");
	const box = page.getByRole("complementary", { name: "About this task" });
	await box.getByRole("button", { name: "Trial length calculator" }).click();
	await expect(page).toHaveURL(/[?&]app=demo-doc-app-trial-length$/);
	await expect(page.getByRole("complementary", { name: "Trial length calculator" })).toBeVisible();
	await expect(appIn(page, "Trial length calculator").getByText(/people pay/)).toBeVisible();
});

test("an app in the knowledge tree says so, and runs as its page", async ({ page }) => {
	await page.goto("/knowledge/demo-doc-app-which-plan");
	const tree = page.getByRole("region", { name: "All documents" });
	await expect(tree.getByRole("button", { name: "Which plan fits", exact: true })).toBeVisible();
	await expect(tree.getByText("app", { exact: true })).toBeVisible();
	const app = appIn(page, "Which plan fits");
	await app.getByLabel("Needs single sign-on").selectOption("yes");
	await expect(app.getByText("Plan: Business, £79 a month")).toBeVisible();
});

test("an app's script runs, but cannot reach the app around it, its storage, or the network", async ({
	page,
}) => {
	const probe = `<!doctype html><meta name="description" content="Tries every way out of its box">
<p id="out">waiting</p>
<script>
const tries = {
	parent: () => parent.document.title,
	storage: () => localStorage.length,
};
const said = Object.entries(tries).map(([name, run]) => {
	try { run(); return name + ": reached"; } catch { return name + ": blocked"; }
});
fetch("/api/actions/open_user", { method: "POST" })
	.then(() => "network: reached", () => "network: blocked")
	.then((net) => { document.getElementById("out").textContent = [...said, net].join(" · "); });
</script>`;
	const made = await page.request.post("/api/actions/edit_document", {
		headers: { "X-API-Key": "hyperidle-dev-local" },
		data: {
			title: "Escape probe",
			body: probe,
			format: "html",
			status: "active",
			as: "artifact",
			parent: { kind: "thread", id: "demo-thread-trial-end" },
		},
	});
	const result = (await made.json()) as { ok: boolean; data: { document: { id: string } } };
	expect(result.ok).toBe(true);

	await page.goto(`/knowledge/${result.data.document.id}`);
	await expect(appIn(page, "Escape probe").locator("#out")).toHaveText(
		"parent: blocked · storage: blocked · network: blocked",
	);
});
