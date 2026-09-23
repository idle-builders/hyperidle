/**
 * X3 — Agent Configuration E2E tests (RED phase)
 *
 * AC-9: Settings UI Agents section renders agent table
 * AC-10: Settings UI edit form opens inline and saves
 * AC-11: Settings UI add form creates agent with template pre-fill
 * AC-12: Settings UI delete with two-click confirmation
 *
 * These tests FAIL until:
 *  - SettingsAgents.tsx component is created and registered in SettingsPage.tsx
 *  - /api/agents CRUD endpoints are implemented
 *  - /api/agents/templates/:role endpoint is implemented
 *
 * @lore X3: E2E tests mock the user door to avoid needing a seeded backend.
 * The fixtures extend the core mocks from ./fixtures.ts and add agent-specific
 * route mocks. LIFO route matching means these handlers win over the fallbacks.
 *
 * @lore BC5 T9/T11: `GET/POST/PATCH/DELETE /api/agents*` are gone —
 * SettingsAgents reads `search_users({kind:"ai"})` + `open_user({id})` per
 * row and writes through `edit_user`. Every test in this file is already on
 * known-pre-existing-failures.ts (`openSettings`'s "user profile" button
 * predates that door swap and no longer exists at all — Settings' trigger is
 * named "Settings" now) — this is a plumbing correctness pass, not a
 * green-phase fix.
 */

import { expect, makeUserRow, mockSearchUsers, mockUser, test } from "./fixtures";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_AGENTS = [
	{
		id: "e2e-agent-pm",
		name: "E2E Product Manager",
		role: "product_manager",
		systemPrompt: "# PM\n\nYou manage product for {{product}}.",
		harnessType: "claude-code",
		maxConcurrentSessions: 1,
		status: "active",
		activeSessions: 0,
	},
	{
		id: "e2e-agent-builder",
		name: "E2E Builder Bot",
		role: "builder",
		systemPrompt: null,
		harnessType: null,
		maxConcurrentSessions: 2,
		status: "active",
		activeSessions: 1,
	},
];

const PM_TEMPLATE = {
	role: "product_manager",
	content: "# You are the Product Manager\n\nHelp the team focus on {{product}}.",
};

/**
 * Helper: navigate to Settings and open it.
 */
async function openSettings(page: import("@playwright/test").Page): Promise<void> {
	await page.goto("/");
	await page.waitForSelector("[data-testid='main-content']");
	await page.getByRole("button", { name: /settings/i }).click();
	await expect(page.getByRole("dialog", { name: /settings/i })).toBeVisible();
}

/** `MOCK_AGENTS`/`updatedAgent`-shaped test data, mapped onto a `UserRow`. */
function toUserRow(agent: {
	id: string;
	name: string;
	role: string;
	harnessType: string | null;
	maxConcurrentSessions: number;
	status: string;
}): ReturnType<typeof makeUserRow> {
	return makeUserRow(agent.id, {
		kind: "ai",
		name: agent.name,
		role: agent.role,
		status: agent.status as ReturnType<typeof makeUserRow>["status"],
	});
}

// ---------------------------------------------------------------------------
// AC-9: Agents section renders agent table
// ---------------------------------------------------------------------------

test.describe("X3 AC-9: Settings Agents section renders agent table", () => {
	test.beforeEach(async ({ page }) => {
		await mockSearchUsers(page, { rows: MOCK_AGENTS.map(toUserRow) });

		await openSettings(page);
	});

	test("agents section is visible in settings", async ({ page }) => {
		await expect(page.locator("[data-testid='settings-section-agents']")).toBeVisible();
	});

	test("agents section shows table headers: Name, Role, Harness, Model Tier, Sessions, Actions", async ({
		page,
	}) => {
		const agentsSection = page.locator("[data-testid='settings-section-agents']");
		await expect(agentsSection.getByText(/name/i)).toBeVisible();
		await expect(agentsSection.getByText(/role/i)).toBeVisible();
		await expect(agentsSection.getByText(/harness/i)).toBeVisible();
		await expect(agentsSection.getByText(/model tier/i)).toBeVisible();
		await expect(agentsSection.getByText(/sessions/i)).toBeVisible();
		await expect(agentsSection.getByText(/actions/i)).toBeVisible();
	});

	test("agent names are listed (system:propagation excluded)", async ({ page }) => {
		const agentsSection = page.locator("[data-testid='settings-section-agents']");
		await expect(agentsSection.getByText("E2E Product Manager")).toBeVisible();
		await expect(agentsSection.getByText("E2E Builder Bot")).toBeVisible();
	});

	test("each agent row has Edit and Delete buttons", async ({ page }) => {
		const agentsSection = page.locator("[data-testid='settings-section-agents']");
		const editButtons = agentsSection.getByRole("button", { name: /edit/i });
		await expect(editButtons.first()).toBeVisible();
		const deleteButtons = agentsSection.getByRole("button", { name: /delete/i });
		await expect(deleteButtons.first()).toBeVisible();
	});

	test("shows 'Any' for null harnessType and 'Default' for null modelTierPreference", async ({
		page,
	}) => {
		const agentsSection = page.locator("[data-testid='settings-section-agents']");
		// Builder Bot has null harnessType and null modelTierPreference
		await expect(agentsSection.getByText("Any")).toBeVisible();
		await expect(agentsSection.getByText("Default")).toBeVisible();
	});
});

// ---------------------------------------------------------------------------
// AC-10: Edit form opens inline and saves
// ---------------------------------------------------------------------------

test.describe("X3 AC-10: Settings UI edit form opens inline and saves", () => {
	let updatedAgent: (typeof MOCK_AGENTS)[0] | null = null;

	test.beforeEach(async ({ page }) => {
		updatedAgent = null;

		await page.route("**/api/actions/search_users", async (route) => {
			if (route.request().method() !== "POST") {
				await route.continue();
				return;
			}
			const agents = updatedAgent
				? MOCK_AGENTS.map((a) => (a.id === updatedAgent?.id ? updatedAgent : a))
				: MOCK_AGENTS;
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ ok: true, data: agents.map(toUserRow) }),
			});
		});

		await page.route("**/api/actions/edit_user", async (route) => {
			const body = JSON.parse(route.request().postData() ?? "{}") as { id?: string; name?: string };
			if (body.id !== "e2e-agent-pm") {
				await route.fallback();
				return;
			}
			updatedAgent = {
				...(MOCK_AGENTS[0] as (typeof MOCK_AGENTS)[0]),
				...(body as Partial<(typeof MOCK_AGENTS)[0]>),
			};
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ ok: true, data: { user: toUserRow(updatedAgent) } }),
			});
		});

		await openSettings(page);
	});

	test("clicking Edit on a row opens inline edit form", async ({ page }) => {
		const agentsSection = page.locator("[data-testid='settings-section-agents']");
		const editButtons = agentsSection.getByRole("button", { name: /edit/i });
		await editButtons.first().click();

		// Inline form should appear
		await expect(agentsSection.getByLabel(/name/i)).toBeVisible();
	});

	test("edit form is pre-filled with the agent's current name", async ({ page }) => {
		const agentsSection = page.locator("[data-testid='settings-section-agents']");
		const editButtons = agentsSection.getByRole("button", { name: /edit/i });
		await editButtons.first().click();

		const nameInput = agentsSection.getByLabel(/name/i);
		await expect(nameInput).toHaveValue("E2E Product Manager");
	});

	test("updating name and clicking Save shows 'Agent saved' toast", async ({ page }) => {
		const agentsSection = page.locator("[data-testid='settings-section-agents']");
		const editButtons = agentsSection.getByRole("button", { name: /edit/i });
		await editButtons.first().click();

		const nameInput = agentsSection.getByLabel(/name/i);
		await nameInput.fill("Updated PM Name");

		await agentsSection.getByRole("button", { name: /save/i }).click();

		// Toast should appear
		await expect(page.getByText(/agent saved/i)).toBeVisible({ timeout: 5000 });
	});

	test("pressing Escape closes the edit form without saving", async ({ page }) => {
		const agentsSection = page.locator("[data-testid='settings-section-agents']");
		const editButtons = agentsSection.getByRole("button", { name: /edit/i });
		await editButtons.first().click();

		await expect(agentsSection.getByLabel(/name/i)).toBeVisible();

		await page.keyboard.press("Escape");

		// Form should close
		await expect(agentsSection.getByLabel(/name/i)).not.toBeVisible();
	});
});

// ---------------------------------------------------------------------------
// AC-11: Add form creates agent with template pre-fill
// ---------------------------------------------------------------------------

test.describe("X3 AC-11: Settings UI add form creates agent with template pre-fill", () => {
	test.beforeEach(async ({ page }) => {
		await mockSearchUsers(page, { rows: MOCK_AGENTS.map(toUserRow) });
		await page.route("**/api/actions/edit_user", async (route) => {
			const body = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					ok: true,
					data: {
						user: toUserRow({
							id: "new-e2e-agent",
							name: (body.name as string) ?? "New agent",
							role: (body.role as string) ?? "builder",
							harnessType: null,
							maxConcurrentSessions: 1,
							status: "active",
						}),
					},
				}),
			});
		});

		await page.route("**/api/agents/templates/product_manager", async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(PM_TEMPLATE),
				});
			} else {
				await route.continue();
			}
		});

		await page.route("**/api/agents/templates/builder", async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 404,
					contentType: "application/json",
					body: JSON.stringify({ error: "No template for role", code: "NOT_FOUND" }),
				});
			} else {
				await route.continue();
			}
		});

		await openSettings(page);
	});

	test("clicking '+ Add Agent' shows add form", async ({ page }) => {
		const agentsSection = page.locator("[data-testid='settings-section-agents']");
		await agentsSection.getByRole("button", { name: /add agent/i }).click();

		await expect(agentsSection.getByLabel(/name/i)).toBeVisible();
	});

	test("changing role to product_manager pre-fills system prompt with template", async ({
		page,
	}) => {
		const agentsSection = page.locator("[data-testid='settings-section-agents']");
		await agentsSection.getByRole("button", { name: /add agent/i }).click();

		// Select product_manager role
		await agentsSection.getByLabel(/role/i).selectOption("product_manager");

		// system prompt should be pre-filled with the template
		await expect(agentsSection.getByLabel(/system prompt/i)).toContainText("Product Manager", {
			timeout: 5000,
		});
	});

	test("saving new agent shows 'Agent created' toast", async ({ page }) => {
		const agentsSection = page.locator("[data-testid='settings-section-agents']");
		await agentsSection.getByRole("button", { name: /add agent/i }).click();

		await agentsSection.getByLabel(/name/i).fill("New Test PM");
		await agentsSection.getByRole("button", { name: /save/i }).click();

		await expect(page.getByText(/agent created/i)).toBeVisible({ timeout: 5000 });
	});
});

// ---------------------------------------------------------------------------
// AC-12: Delete with two-click confirmation
// ---------------------------------------------------------------------------

test.describe("X3 AC-12: Settings UI delete with two-click confirmation", () => {
	test.beforeEach(async ({ page }) => {
		let agentRetired = false;

		await page.route("**/api/actions/search_users", async (route) => {
			if (route.request().method() !== "POST") {
				await route.continue();
				return;
			}
			const agents = agentRetired
				? MOCK_AGENTS.filter((a) => a.id !== "e2e-agent-pm")
				: MOCK_AGENTS;
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ ok: true, data: agents.map(toUserRow) }),
			});
		});

		// SettingsAgents' retire path: edit_user({ id, status: "retired" }).
		await page.route("**/api/actions/edit_user", async (route) => {
			const body = JSON.parse(route.request().postData() ?? "{}") as {
				id?: string;
				status?: string;
			};
			if (body.id !== "e2e-agent-pm" || body.status !== "retired") {
				await route.fallback();
				return;
			}
			agentRetired = true;
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					ok: true,
					data: { user: toUserRow({ ...(MOCK_AGENTS[0] as (typeof MOCK_AGENTS)[0]), status: "retired" }) },
				}),
			});
		});

		await openSettings(page);
	});

	test("first click on Delete changes button to 'Confirm?'", async ({ page }) => {
		const agentsSection = page.locator("[data-testid='settings-section-agents']");
		const deleteButtons = agentsSection.getByRole("button", { name: /^delete$/i });
		await deleteButtons.first().click();

		await expect(agentsSection.getByRole("button", { name: /confirm\?/i })).toBeVisible();
	});

	test("second click confirms deletion and shows 'Agent deleted' toast", async ({ page }) => {
		const agentsSection = page.locator("[data-testid='settings-section-agents']");
		const deleteButtons = agentsSection.getByRole("button", { name: /^delete$/i });
		await deleteButtons.first().click();

		await expect(agentsSection.getByRole("button", { name: /confirm\?/i })).toBeVisible();
		await agentsSection.getByRole("button", { name: /confirm\?/i }).click();

		await expect(page.getByText(/agent deleted/i)).toBeVisible({ timeout: 5000 });
	});

	test("Delete button reverts after 3 seconds without confirmation", async ({ page }) => {
		const agentsSection = page.locator("[data-testid='settings-section-agents']");
		const deleteButtons = agentsSection.getByRole("button", { name: /^delete$/i });
		await deleteButtons.first().click();

		await expect(agentsSection.getByRole("button", { name: /confirm\?/i })).toBeVisible();

		// Wait more than 3 seconds
		await page.waitForTimeout(3500);

		// Should revert to "Delete"
		await expect(agentsSection.getByRole("button", { name: /confirm\?/i })).not.toBeVisible();
		await expect(agentsSection.getByRole("button", { name: /^delete$/i }).first()).toBeVisible();
	});
});
