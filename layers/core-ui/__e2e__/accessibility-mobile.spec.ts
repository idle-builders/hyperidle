/**
 * Real-browser check: zero WCAG 2.1 AA violations on the design-system
 * primitives at a mobile viewport (≤ 1024px), where contrast and touch
 * density both change from desktop.
 *
 * Scoped to `[data-ds-component]` (the design-system primitives this sweep
 * owns) rather than the whole page — page-level chrome is a separate,
 * tracked gap (see accessibility.spec.ts's own note).
 */
import AxeBuilder from "@axe-core/playwright";
import {
	expect,
	makeDocumentRow,
	makeTask,
	makeTaskNode,
	makeUserRow,
	mockAgents,
	mockDocument,
	mockSearchDocuments,
	mockSearchSessions,
	mockSearchUsers,
	mockTaskTree,
	mockTeamPage,
	test,
} from "./fixtures";

const MOBILE = { width: 1024, height: 900 };

const ROUTES = [
	{ path: "/conversations", selector: "[data-testid='conversations-page']" },
	{ path: "/work/portfolio", selector: "[data-testid='work-overview-page']" },
	{ path: "/work/team/p1", selector: "[data-testid='work-team-page']" },
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

test.describe("zero WCAG 2.1 AA violations at mobile viewport", () => {
	test.use({ viewport: MOBILE });

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
		// No active sessions — both roster agents fall back to the idle/"paused"
		// default (DEFAULT_ROSTER_RUN_STATE), which is what actually renders the
		// paused StatusChip this suite must be able to catch a contrast
		// regression on. The team-level header chip renders healthy
		// independently, so both StatusChip tones are on screen together.
		await mockSearchSessions(page, { rows: [] });
		await mockSearchDocuments(page, { rows: [makeDocumentRow("k1", { title: "Doc one" })] });
		await mockDocument(page, { row: makeDocumentRow("k1", { title: "Doc one", body: "# Hi" }) });
		await page.route("**/api/artifacts*", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ items: [], nextCursor: null }),
			}),
		);
	});

	for (const route of ROUTES) {
		test(`no violations on ${route.path}`, async ({ page }) => {
			await page.goto(route.path);
			await page.waitForSelector(route.selector);
			const results = await new AxeBuilder({ page })
				.include("[data-ds-component]")
				.withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
				.analyze();
			expect(results.violations).toEqual([]);
		});
	}
});
