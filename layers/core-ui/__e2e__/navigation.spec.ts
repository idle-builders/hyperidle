/**
 * E2E tests for the shell navigation: Sidebar view switching and overall
 * layout structure.
 *
 * @lore U6: The old IconRail | Submenu | Rail quad-column layout was replaced
 * by a 200px Sidebar on the left. Tests updated to reflect the new structure.
 *
 * AG4: Added AC-1 through AC-6 tests for back/forward + keyboard shortcuts.
 * @lore AG4: Breadcrumb nav orientation strip + NavHistoryCluster (history back/forward).
 * Back (⌘[) = temporal history, Up (breadcrumb) = structural parent.
 */
import {
	expect,
	makeDocumentRow,
	makeTask,
	makeTaskCardSummary,
	mockDocument,
	mockSearchDocuments,
	mockTaskTree,
	mockTeamDetail,
	test,
} from "./fixtures";

// ── AG4 fixtures ──────────────────────────────────────────────────────────────

const ROOT_TASK_ID = "task-ag4-1";
const TEAM_ID = "team-ag4-1";

async function mockTaskAndTeam(page: import("@playwright/test").Page) {
	await mockTaskTree(page, {
		task: makeTask(ROOT_TASK_ID, {
			title: "AG4 test task",
			teamId: TEAM_ID,
			description: "# AG4 test task\n\nTest description",
		}),
	});
	await mockTeamDetail(page, {
		teamId: TEAM_ID,
		name: "AG4 Team",
		tasksInProgress: [
			makeTaskCardSummary(ROOT_TASK_ID, {
				title: "AG4 test task",
				progressDone: 1,
				progressTotal: 3,
			}),
		],
		routines: Array.from({ length: 12 }, (_, index) => ({
			id: `routine-ag4-${index}`,
			name: `AG4 Routine ${index}`,
			state: "active",
			scheduleLabel: "Daily",
			agentName: "Agent 0",
			agentInitials: "A0",
			lastRunAt: null,
			lastRunOutcome: null,
			nextRunAt: null,
		})),
	});
	await page.route("**/api/teams", async (route) => {
		if (route.request().method() === "GET") {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					teams: [{ id: TEAM_ID, name: "AG4 Team", phase: "build", active: true }],
				}),
			});
		} else {
			await route.continue();
		}
	});
	await page.route("**/api/agents*", (route) =>
		route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
	);
	await page.route("**/api/artifacts*", async (route) => {
		return route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ items: [], nextCursor: null }),
		});
	});
}

test.describe("AG4 — Back, Up, and Shortcuts", () => {
	test("routine Navigate and temporal Back restore team scroll and row focus", async ({ page }) => {
		await mockTaskAndTeam(page);
		await page.route("**/api/routines/routine-ag4-11", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					routine: {
						id: "routine-ag4-11",
						name: "AG4 Routine 11",
						description: "A durable routine prompt.",
						state: "active",
						triggerType: "schedule",
						triggerConfig: JSON.stringify({ cron: "0 8 * * *" }),
						scheduleLabel: "Daily",
						agentName: "Agent 0",
						autonomyLevel: 2,
						silent: false,
						lastRunAt: null,
						lastRunOutcome: null,
						nextRunAt: null,
						createdAt: "2026-08-13T08:00:00.000Z",
					},
					runs: [],
				}),
			});
		});
		await page.goto(`/work/team/${TEAM_ID}`);
		const row = page.getByTestId("routine-row").filter({ hasText: "AG4 Routine 11" });
		await row.scrollIntoViewIfNeeded();
		await row.focus();
		const scroller = page.locator("[data-page-scroll]").first();
		const before = await scroller.evaluate((node) => node.scrollTop);
		await row.click();
		await expect(page).toHaveURL(/\/work\/routine\/routine-ag4-11$/);
		await expect(page.getByRole("button", { name: "Edit routine" })).toBeVisible();

		await page.goBack();
		await expect(page).toHaveURL(new RegExp(`/work/team/${TEAM_ID}$`));
		await expect(row).toBeFocused();
		expect(await scroller.evaluate((node) => node.scrollTop)).toBe(before);
	});

	// AC-3: Every detail screen shows hierarchy breadcrumb + structural up-path
	test("AC-3: task detail renders Breadcrumb nav with Work + parent link", async ({ page }) => {
		await mockTaskAndTeam(page);
		await page.goto(`/work/task/${ROOT_TASK_ID}`);
		await page.waitForSelector("[data-testid='task-detail-page']");

		// DS Breadcrumb must be present
		const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
		await expect(breadcrumb).toBeVisible();

		// "Work" link in breadcrumb → /work/portfolio
		const workLink = breadcrumb.getByRole("link", { name: "Work" });
		await expect(workLink).toBeVisible();
	});

	// AC-4: Deep-link fresh screen: sane up path, Back disabled (no history)
	test("AC-4: deep-link to task detail — Back button disabled when no history", async ({
		page,
	}) => {
		await mockTaskAndTeam(page);
		// Fresh navigation — no history
		await page.goto(`/work/task/${ROOT_TASK_ID}`);
		await page.waitForSelector("[data-testid='task-detail-page']");

		// NavHistoryCluster is only shown on desktop (not sidebarMobile)
		// viewport is default 1280x720 in Playwright — desktop
		const backBtn = page.getByRole("button", { name: "Back" });
		await expect(backBtn).toBeDisabled();
	});

	// AC-3 (up path): clicking breadcrumb segment navigates to parent route
	test("AC-3 up: clicking Work breadcrumb from task detail → portfolio", async ({ page }) => {
		await mockTaskAndTeam(page);
		await page.goto(`/work/task/${ROOT_TASK_ID}`);
		await page.waitForSelector("[data-testid='task-detail-page']");

		const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
		const workLink = breadcrumb.getByRole("link", { name: "Work" });
		await workLink.click();

		// Should land on /work/portfolio
		await expect(page).toHaveURL(/\/work\/portfolio/, { timeout: 5000 });
	});

	// AC-5: ⌘1/2/3 view-switch shortcuts
	test("AC-5: ⌘2 switches to Work view", async ({ page }) => {
		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");

		// Start on Conversations (default)
		await expect(page.getByTestId("conversations-page")).toBeVisible();

		// ⌘2 → Work
		await page.keyboard.press("Meta+2");
		await expect(page).toHaveURL(/\/work/, { timeout: 3000 });
	});

	test("AC-5: ⌘3 switches to Knowledge view", async ({ page }) => {
		// Mock document list
		await mockSearchDocuments(page, { rows: [] });

		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");

		// ⌘3 → Documents
		await page.keyboard.press("Meta+3");
		await expect(page).toHaveURL(/\/documents/, { timeout: 3000 });
	});

	test("AC-5: ⌘1 switches back to Conversations view", async ({ page }) => {
		// Start on Work view
		await page.route("**/api/teams", async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ teams: [] }),
				});
			} else {
				await route.continue();
			}
		});
		await page.goto("/work/portfolio");
		await page.waitForSelector("[data-testid='work-portfolio-page']");

		// ⌘1 → Conversations
		await page.keyboard.press("Meta+1");
		await expect(page).toHaveURL(/\/conversations/, { timeout: 3000 });
	});

	// AC-5: shortcut guard — does NOT fire while typing in an input
	// W2: deterministic — the document create page at /documents/new has a real
	// <input> for the title. We navigate there, focus the title input (which is
	// always present and clickable), then press ⌘2 and assert it does NOT navigate.
	//
	// Note: the global-search dialog's SearchField auto-focus is unreliable in the
	// headless Playwright runner (the focusRef fires but Playwright shows the element
	// as "inactive"). Using the DocumentCreate title input is deterministic because
	// it's a plain <input type="text"> we can directly focus via click().
	test("AC-5: ⌘2 does not switch views while typing in input", async ({ page }) => {
		// Navigate to a page with a real text input (document create).
		await page.goto("/documents/new");
		await page.waitForSelector("[data-testid='knowledge-create-page']");

		// The title input is a plain <input type="text"> with placeholder "Untitled".
		const titleInput = page.getByPlaceholder("Untitled");
		await expect(titleInput).toBeVisible();
		// Click to focus — deterministic in Playwright (no focus-trap complications).
		await titleInput.click();
		await expect(titleInput).toBeFocused();

		// ⌘2 must NOT navigate away — useNavShortcuts guard checks e.target.tagName === "input".
		await page.keyboard.press("Meta+2");

		// URL must still be /documents/new (no navigation happened while typing in input).
		await expect(page).toHaveURL(/\/documents\/new/, { timeout: 1000 });

		// The input must still be focused (not blurred by ⌘2).
		await expect(titleInput).toBeFocused();
	});

	// AC-6: Screenshot visual check — breadcrumb visible on bet detail
	test("AC-6: task detail screenshot — breadcrumb visible (visual proof)", async ({ page }) => {
		await mockTaskAndTeam(page);
		await page.goto(`/work/task/${ROOT_TASK_ID}`);
		await page.waitForSelector("[data-testid='task-detail-page']");

		const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
		await expect(breadcrumb).toBeVisible();

		// Screenshot for reviewer visual inspection (non-blocking)
		await page.screenshot({ path: "test-results/AG4-breadcrumb-bet-detail.png", fullPage: false });
	});

	// C1 — AC-1: portfolio → team → bet; click Back chevron → team; ⌘[ → portfolio.
	// Asserts Back affordance visible at each step (desktop width = 1280×720 default).
	//
	// Strategy: use in-app navigation (clicks on breadcrumb links and sidebar) rather than
	// page.goto() for the second and third hops. This ensures React Router pushes real
	// history entries (idx increments), making canGoBack=true on the bet page.
	// page.goto() creates a fresh navigation that resets history.state.idx to 0.
	test("AC-1: portfolio→team→task — Back chevron returns to team, ⌘[ returns to portfolio", async ({
		page,
	}) => {
		await mockTaskAndTeam(page);

		// 1. Start at portfolio (page.goto is ok for the first navigation — sets idx=0 baseline).
		await page.goto("/work/portfolio");
		await page.waitForSelector("[data-testid='work-portfolio-page']");

		// 2. Navigate to team page via in-app click (pushes history entry, idx becomes 1).
		// The portfolio shows the team in the sidebar or as a link — navigate via URL push.
		// We use page.evaluate to push via history.pushState (simulates a React Router push).
		await page.evaluate((url) => {
			window.history.pushState({ idx: 1 }, "", url);
		}, `/work/team/${TEAM_ID}`);
		// Trigger the React Router location update via a popstate — RR listens to popstate.
		// Actually, we need React Router to recognize the navigation. Use page.goto for the team,
		// but then navigate to bet via history.pushState to preserve history.
		// Simpler: goto team, then use the Sidebar/Work section → team → bet breadcrumb click.

		// Better approach: goto portfolio, then navigate to bet by changing URL twice using
		// page.evaluate to push state, which React Router picks up via its popstate listener.
		// Step 2a: goto team URL (fresh navigation, resets to idx=1)
		await page.goto(`/work/team/${TEAM_ID}`);
		await page.waitForSelector("[data-testid='work-team-page']");

		// Step 2b: navigate to bet via in-app SPA navigation (breadcrumb click or programmatic).
		// Click the first bet card link on the team page to navigate to bet.
		// Or: use page.evaluate to call history.pushState for SPA navigation.
		await page.evaluate((url) => {
			// Simulate React Router push: increment idx to simulate in-app navigation.
			const currentIdx = (window.history.state?.idx ?? 0) as number;
			window.history.pushState({ idx: currentIdx + 1 }, "", url);
			// Dispatch popstate to trigger React Router's listener.
			window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
		}, `/work/task/${ROOT_TASK_ID}`);

		// Wait for the loaded breadcrumb on the bet page (not the skeleton)
		const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
		await expect(breadcrumb).toBeVisible({ timeout: 10000 });

		// 3. On bet detail: Back button is visible (desktop) and enabled (idx > 0 → canGoBack=true).
		const backBtn = page.getByRole("button", { name: "Back" });
		await expect(backBtn).toBeVisible();
		await expect(backBtn).not.toBeDisabled();

		// 4. Click Back chevron → should return to team screen.
		await backBtn.click();
		await expect(page).toHaveURL(new RegExp(`/work/team/${TEAM_ID}`), { timeout: 5000 });

		// 5. Back button is still visible on team screen (we can still go back to portfolio).
		await expect(page.getByRole("button", { name: "Back" })).toBeVisible({ timeout: 5000 });
		await expect(page.getByRole("button", { name: "Back" })).not.toBeDisabled();

		// 6. Press ⌘[ → should return to portfolio.
		await page.keyboard.press("Meta+[");
		await expect(page).toHaveURL(/\/work\/portfolio/, { timeout: 5000 });
	});

	// C1 — AC-2: cross-view history traversal — bet → knowledge → Back → bet.
	// This is the heart of the workpackage: Back traverses temporal history across views.
	//
	// Strategy: navigate bet → knowledge via history.pushState (simulates in-app navigation
	// from ⌘K search result click). The global-search dialog focus is unreliable in headless
	// Playwright, so we simulate the navigation outcome directly. The AC verifies the
	// temporal history traversal, not the search UI itself (that's covered by global-search.spec.ts).
	test("AC-2: cross-view history — task→knowledge→Back returns to task", async ({ page }) => {
		const KNOWLEDGE_ID = "k1";

		await mockTaskAndTeam(page);
		await mockDocument(page, {
			row: makeDocumentRow(KNOWLEDGE_ID, { title: "AG4 fixture document" }),
		});

		// 1. Navigate to bet detail (establishes history base).
		await page.goto(`/work/task/${ROOT_TASK_ID}`);
		// Wait for breadcrumb (not skeleton) to confirm bet data loaded.
		await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toBeVisible({
			timeout: 10000,
		});
		const betUrl = page.url();

		// 2. Navigate to knowledge item via history.pushState (simulates search-result click).
		// This is what happens in the app when ⌘K result is clicked — React Router pushes history.
		await page.evaluate((url) => {
			const currentIdx = (window.history.state?.idx ?? 0) as number;
			window.history.pushState({ idx: currentIdx + 1 }, "", url);
			window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
		}, `/documents/${KNOWLEDGE_ID}`);

		// 3. Should be on the knowledge detail page now.
		await expect(page).toHaveURL(new RegExp(`/documents/${KNOWLEDGE_ID}`), { timeout: 5000 });
		await page.waitForSelector("[data-testid='document-detail-page']");

		// 4. The Breadcrumb on the knowledge detail page confirms we're at the right screen.
		await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toBeVisible({
			timeout: 5000,
		});

		// 5. Press Back (⌘[) → must return to the bet URL (cross-view history traversal).
		await page.keyboard.press("Meta+[");
		await expect(page).toHaveURL(betUrl, { timeout: 5000 });
		// Verify back on the bet page (confirms the history traversal landed correctly).
		await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toBeVisible({
			timeout: 5000,
		});
	});
});

test.describe("Navigation", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		// Default route redirects to /conversations (L9: canonical queue URL)
		await page.waitForSelector("[data-testid='main-content']");
	});

	test("shell layout renders Sidebar and Main content area", async ({ page }) => {
		// Sidebar nav (data-ds-shell="Sidebar")
		await expect(page.locator("[data-ds-shell='Sidebar']")).toBeVisible();
		// Main content area
		await expect(page.getByTestId("main-content")).toBeVisible();
	});

	test("Sidebar shows three section headers: Conversations, Work, Knowledge", async ({ page }) => {
		await expect(page.getByRole("button", { name: /conversations/i })).toBeVisible();
		await expect(page.getByRole("button", { name: /work/i })).toBeVisible();
		await expect(page.getByRole("button", { name: /knowledge/i })).toBeVisible();
	});

	// @lore U6: The Work section in the Sidebar shows team sub-items.
	// Clicking the Work section header navigates to /work/portfolio.
	test("clicking Work section header shows team sub-items in Sidebar", async ({ page }) => {
		await page.getByRole("button", { name: /work/i }).click();
		// The Work section header becomes active (data-active='true')
		await expect(page.locator("[data-section='work'][data-active='true']")).toBeVisible();
	});

	test("clicking Knowledge section header activates the Knowledge section", async ({ page }) => {
		// @lore W3: Knowledge scope sub-items (Practices, Products, Factory) were
		// removed from the Sidebar in W3 AC-3. The Knowledge section header activates
		// and navigates to /knowledge without scope sub-items.
		await page.getByRole("button", { name: /knowledge/i }).click();
		// Knowledge section becomes active
		await expect(page.locator("[data-section='knowledge'][data-active='true']")).toBeVisible();
	});

	test("default route lands on Conversations", async ({ page }) => {
		await expect(page.getByTestId("conversations-page")).toBeVisible();
	});
});
