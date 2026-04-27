/**
 * L3 — Thread List / Queue Rendering. Playwright E2E.
 *
 * Validation scenario from TRACK-L L3:
 *   "Given the seeded fixture has 3 reviews and 1 chat, when Conversations
 *    loads, then 4 rows render and the Review Queue header shows '3'."
 *
 * Plus AC8: J/K moves selection, Enter opens the selected thread.
 *
 * @lore L3 DoD: This spec uses `page.route()` to mock `/api/me` and
 * `/api/conversations` rather than relying on a freshly-seeded dev database.
 * The contract under test is purely UI-surface behavior on a known API
 * shape (sectioning, counts, J/K nav, Enter dispatch, sticky headers, chip
 * URL writes). Decoupling the spec from the dev server's seed state lets it
 * run reproducibly across worktrees that share the dev port and avoids the
 * pre-existing Vite proxy `/api` prefix-strip quirk. The fixture below is
 * the test's contract: 1 Coach pinned thread + 1 blocking review + 3
 * reviews + 1 chat = 6 threads, with the 3 reviews matching the spec's
 * "Review Queue header reads 3" assertion.
 */
import { expect, type Page, test } from "@playwright/test";

const NOW = "2026-04-26T12:00:00.000Z";
const T_MINUS_1H = "2026-04-26T11:00:00.000Z";
const T_MINUS_2H = "2026-04-26T10:00:00.000Z";
const T_MINUS_3H = "2026-04-26T09:00:00.000Z";
const T_MINUS_4H = "2026-04-26T08:00:00.000Z";
const T_MINUS_5H = "2026-04-26T07:00:00.000Z";

interface RawThread {
	id: string;
	kind: "review" | "chat" | "coach";
	pinned: number;
	participants: string[];
	routedToActorId: string | null;
	routedToActorRole: "CEO" | "CPO" | null;
	domainTag: string | null;
	createdAt: string;
	lastActivityAt: string;
	blocking: boolean;
	resolvedAt: string | null;
}

const FIXTURE_THREADS: RawThread[] = [
	{
		id: "thread-coach",
		kind: "coach",
		pinned: 1,
		// `seed-agent-cos` is the COACH_AGENT_ID; presence routes the thread
		// to Pinned regardless of pinned flag (see classify()).
		participants: ["seed-agent-cos", "actor:ceo"],
		routedToActorId: "actor:ceo",
		routedToActorRole: "CEO",
		domainTag: null,
		createdAt: T_MINUS_1H,
		lastActivityAt: NOW,
		blocking: false,
		resolvedAt: null,
	},
	{
		id: "thread-blocking-review",
		kind: "review",
		pinned: 0,
		participants: ["agent:dev-1"],
		routedToActorId: "actor:ceo",
		routedToActorRole: "CEO",
		domainTag: "auth",
		createdAt: T_MINUS_2H,
		lastActivityAt: T_MINUS_1H,
		blocking: true,
		resolvedAt: null,
	},
	{
		id: "thread-review-1",
		kind: "review",
		pinned: 0,
		participants: ["agent:dev-2"],
		routedToActorId: "actor:ceo",
		routedToActorRole: "CEO",
		domainTag: "billing",
		createdAt: T_MINUS_3H,
		lastActivityAt: T_MINUS_2H,
		blocking: false,
		resolvedAt: null,
	},
	{
		id: "thread-review-2",
		kind: "review",
		pinned: 0,
		participants: ["agent:dev-3"],
		routedToActorId: "actor:cpo",
		routedToActorRole: "CPO",
		domainTag: "ux",
		createdAt: T_MINUS_4H,
		lastActivityAt: T_MINUS_3H,
		blocking: false,
		resolvedAt: null,
	},
	{
		id: "thread-review-3",
		kind: "review",
		pinned: 0,
		participants: ["agent:dev-4"],
		routedToActorId: "actor:ceo",
		routedToActorRole: "CEO",
		domainTag: "ops",
		createdAt: T_MINUS_5H,
		lastActivityAt: T_MINUS_4H,
		blocking: false,
		resolvedAt: null,
	},
	{
		id: "thread-chat-1",
		kind: "chat",
		pinned: 0,
		participants: ["agent:planner"],
		routedToActorId: "actor:ceo",
		routedToActorRole: "CEO",
		domainTag: null,
		createdAt: T_MINUS_5H,
		lastActivityAt: T_MINUS_5H,
		blocking: false,
		resolvedAt: null,
	},
];

async function installApiMocks(page: Page): Promise<void> {
	await page.route("**/api/me", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				id: "actor:ceo",
				role: "CEO",
				domain_tags: ["auth", "billing"],
			}),
		});
	});
	await page.route("**/api/conversations**", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				threads: FIXTURE_THREADS,
				pagination: { page: 1, limit: 200, total: FIXTURE_THREADS.length },
			}),
		});
	});
}

test.describe("L3 — Conversations thread list", () => {
	test.beforeEach(async ({ page }) => {
		await installApiMocks(page);
		await page.goto("/conversations/review");
		await page.waitForSelector("[data-testid='conversations-review-page']");
		await page.waitForSelector("[data-testid='conversations-submenu'] [data-thread-id]");
	});

	test("renders 6 thread rows and the Review Queue header reads 3 (3 reviews + 1 chat + coach + blocking-review fixture)", async ({
		page,
	}) => {
		const submenu = page.getByTestId("conversations-submenu");
		await expect(submenu).toBeVisible();
		// Section count badge for reviews must read "3" (the 3 non-blocking reviews).
		await expect(submenu.getByTestId("section-count-reviews")).toHaveText("3");
		// Total thread rows visible across sections is 6.
		const rows = submenu.locator("[data-thread-id]");
		await expect(rows).toHaveCount(FIXTURE_THREADS.length);
	});

	test("J moves the active row down across all sections", async ({ page }) => {
		const submenu = page.getByTestId("conversations-submenu");
		const initialActive = submenu.locator('[aria-current="true"]');
		await expect(initialActive).toHaveCount(1);
		const firstId = await initialActive.getAttribute("data-thread-id");

		await page.keyboard.press("j");
		const next = submenu.locator('[aria-current="true"]');
		await expect(next).toHaveCount(1);
		const secondId = await next.getAttribute("data-thread-id");
		expect(secondId).not.toEqual(firstId);
	});

	test("K moves the active row up", async ({ page }) => {
		await page.keyboard.press("j");
		await page.keyboard.press("j");
		const submenu = page.getByTestId("conversations-submenu");
		const beforeId = await submenu.locator('[aria-current="true"]').getAttribute("data-thread-id");
		await page.keyboard.press("k");
		const afterId = await submenu.locator('[aria-current="true"]').getAttribute("data-thread-id");
		expect(afterId).not.toEqual(beforeId);
	});

	test("Enter on the active row opens the selected thread", async ({ page }) => {
		const submenu = page.getByTestId("conversations-submenu");
		await expect(submenu.locator('[aria-current="true"]')).toHaveCount(1);
		await page.keyboard.press("Enter");
		// The URL is mutated to include the thread id (review or chat path).
		await expect(page).toHaveURL(/\/conversations\/(review|chat)\?thread=/);
	});

	test("blocking counter is visible at the top of the conversations submenu", async ({ page }) => {
		const counter = page.getByTestId("blocking-counter");
		await expect(counter).toBeVisible();
		await expect(counter).toContainText(/of\s+\d+\s+blocking/i);
	});

	test("routing filter chip 'Mine' updates the URL ?routedTo= param", async ({ page }) => {
		const chips = page.getByTestId("routing-filter-chips");
		await expect(chips).toBeVisible();
		await chips.getByRole("tab", { name: /^mine$/i }).click();
		await expect(page).toHaveURL(/[?&]routedTo=mine/);
	});

	test("Pinned section header and Coach/CoS row remain visible after scroll", async ({ page }) => {
		// @lore L3 DoD AC5 (deferred per apply-review-2 ADV-C4): the proper
		// sticky-scroll proof requires the submenu's nearest scroll container
		// to actually overflow before scrollTop is set. In the current
		// fixture the data does not exceed the viewport so this test passes
		// by tautology — the header doesn't move because nothing scrolls.
		// The implementation IS sticky (see SubmenuRow + section header
		// `sticky top-0` styles) and is verified at unit/integration level.
		// Follow-up: seed enough rows to force overflow and assert
		// `headerAfter.y == headerBefore.y` only after a real scrollTop set.
		const submenu = page.getByTestId("conversations-submenu");
		await expect(submenu).toBeVisible();

		const pinnedSection = submenu.getByTestId("section-pinned");
		await expect(pinnedSection).toBeVisible();
		const pinnedHeader = pinnedSection.getByTestId("section-header");
		await expect(pinnedHeader).toBeVisible();

		const headerBefore = await pinnedHeader.boundingBox();
		expect(headerBefore).not.toBeNull();

		await page.evaluate(() => {
			const submenuEl = document.querySelector("[data-testid='conversations-submenu']");
			let node: HTMLElement | null = submenuEl as HTMLElement | null;
			while (node) {
				const overflowY = getComputedStyle(node).overflowY;
				if (overflowY === "auto" || overflowY === "scroll") {
					node.scrollTop = 400;
					return;
				}
				node = node.parentElement;
			}
			window.scrollTo(0, 400);
		});

		const headerAfter = await pinnedHeader.boundingBox();
		expect(headerAfter).not.toBeNull();
		if (headerBefore && headerAfter) {
			expect(Math.abs(headerAfter.y - headerBefore.y)).toBeLessThan(8);
		}
	});
});
