/**
 * Real-browser check: zero WCAG 2.1 A/AA violations on the primary routes.
 *
 * When this suite fails, fix the violation at the primitive level so every
 * consumer benefits — never annotate the DOM just to silence axe. Scoped to
 * rules tagged wcag2a/wcag2aa/wcag21aa; best-practice-tagged rules are noisy
 * on DaisyUI-based layouts and are not part of the acceptance bar.
 */
import AxeBuilder from "@axe-core/playwright";
import {
	expect,
	makeSessionRow,
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

const ROUTES = [
	{ path: "/conversations", selector: "[data-testid='conversations-page']" },
	{ path: "/work/portfolio", selector: "[data-testid='work-overview-page']" },
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

test.describe("zero WCAG 2.1 AA violations", () => {
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
		await mockSearchSessions(page, {
			rows: [makeSessionRow("a11y-session-1", { agentId: "agent-1", state: "active" })],
		});
	});

	for (const route of ROUTES) {
		test(`no violations on ${route.path}`, async ({ page }) => {
			await page.goto(route.path);
			await page.waitForSelector(route.selector);
			const results = await new AxeBuilder({ page })
				.withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
				.analyze();
			expect(results.violations).toEqual([]);
		});
	}
});
