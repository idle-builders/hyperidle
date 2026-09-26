/**
 * J8 — axe-core accessibility audit.
 *
 * @lore Zero-tolerance for WCAG 2.1 A/AA violations on the primary routes.
 * The audit is scoped to rules tagged `wcag2a`, `wcag2aa`, and `wcag21aa` to
 * keep the assertion precise; best-practice-tagged rules are noisy on
 * DaisyUI-based layouts and are not part of the acceptance criterion.
 *
 * When this suite fails, fix the violation at the primitive level so every
 * consumer benefits — never annotate the DOM just to silence axe.
 */
import AxeBuilder from "@axe-core/playwright";
import {
	expect,
	makeTask,
	makeTaskNode,
	makeUserRow,
	mockAgents,
	mockSearchSessions,
	mockSearchUsers,
	mockTaskTree,
	mockTeamPage,
	test,
} from "./fixtures";

// L9: /conversations/review and /conversations/chat replaced by /conversations.
const ROUTES = [
	{ path: "/conversations", selector: "[data-testid='conversations-page']" },
	{ path: "/work/portfolio", selector: "[data-testid='work-overview-page']" },
	// @lore L13: /work/team was removed in L13; the route now redirects to
	// /work/portfolio. We replace it with a product drilldown to keep route
	// coverage. The team-page mocks are registered in beforeEach so this
	// test is hermetic on CI (no real DB needed).
	// @lore BC5 T9: /work/product/:id still redirects to /work/team/:id.
	{ path: "/work/product/p1", selector: "[data-testid='work-team-page']" },
	{ path: "/work/task/task-a11y-1", selector: "[data-testid='task-detail-page']" },
	{ path: "/documents", selector: "[data-testid='document-list-page']" },
	{ path: "/documents/k1", selector: "[data-testid='document-detail-page']" },
] as const;

const A11Y_ROSTER = [
	makeUserRow("agent-1", {
		kind: "ai",
		name: "Alice",
		role: "Lead Engineer",
		team: { id: "p1", name: "Alpha" },
	}),
	makeUserRow("agent-2", {
		kind: "ai",
		name: "Bob",
		role: "builder",
		team: { id: "p2", name: "Beta" },
	}),
];

test.describe("axe-core — zero WCAG 2.1 AA violations", () => {
	// @lore BB1: was a hand-rolled `/api/bets/b1` body. WorkTaskPage loads
	// `open_task`; the shared fixture owns that shape so this
	// route stays hermetic on CI where there is no DB.
	// @lore BC5 T9: `GET /api/teams/:id` is gone — `mockTeamPage` composes the
	// product-drilldown route's team page from search_users/search_tasks.
	test.beforeEach(async ({ page }) => {
		await mockTaskTree(page, {
			task: makeTask("task-a11y-1", {
				title: "User auth flow",
				description: "# Problem\n\nAuth is broken.\n",
			}),
			children: [
				makeTaskNode("t1", {
					parentTaskId: "task-a11y-1",
					title: "Implement login endpoint",
					ownerAgentId: "agent-dev-1",
					state: "done",
				}),
			],
		});
		await mockSearchUsers(page, { rows: A11Y_ROSTER });
		await mockTeamPage(page, {
			teamId: "p1",
			teamName: "Alpha",
			roster: A11Y_ROSTER,
			tasksInProgress: [
				makeTask("task-a11y-1", { teamId: "p1", title: "User auth flow", state: "in_progress" }),
			],
		});
		await mockAgents(page, { agents: [] });
		await mockSearchSessions(page, { rows: [] });
	});

	for (const route of ROUTES) {
		test(`no WCAG 2.1 AA violations on ${route.path}`, async ({ page }) => {
			await page.goto(route.path);
			await page.waitForSelector(route.selector);
			const results = await new AxeBuilder({ page })
				.withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
				.analyze();
			expect(results.violations).toEqual([]);
		});
	}
});
