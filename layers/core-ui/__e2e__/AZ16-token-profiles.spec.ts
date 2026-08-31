import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { Page, Route } from "@playwright/test";
import { REVIEW_COMPOSITION_SUBJECT } from "../src/pages/review/__fixtures__/review-composition.fixture.js";
import { expect, test } from "./fixtures";

// Screenshots are review artifacts, not pixel-diff assertions (AG1/U11 naming convention).
const SCREENSHOTS = resolve(process.cwd(), "test-results");

const THREAD = {
	id: "t-az16",
	title: "AZ16 profile review",
	hostKind: "task",
	hostId: "az16-proof",
	initiatorId: "test-founder",
	participants: ["test-founder", "agent-az16"],
	pinned: false,
	resolvedAt: null,
	lastActiveAt: "2026-08-14T09:00:00.000Z",
	kind: "chat",
	status: "open",
	participantIds: ["test-founder", "agent-az16"],
	hasUnresolvedReview: false,
	blocking: false,
	createdAt: "2026-08-14T08:00:00.000Z",
	betId: null,
	taskId: null,
};

const BET = {
	id: "bet-az16",
	title: "Semantic design profiles",
	team: "Hearth",
	teamId: "team-az16",
	description: "Make every authored value consume one complete, named profile.",
	status: "active",
	atRisk: false,
	progress: { done: 8, total: 9 },
	tasks: [],
};

const TEAM = {
	product: {
		id: "team-az16",
		name: "Hearth",
		phase: "build",
		status: "healthy",
		leadAgentId: "agent-az16",
	},
	team: {
		id: "team-az16",
		name: "Hearth",
		phase: "build",
		status: "healthy",
		formedAt: "2026-08-14T08:00:00.000Z",
		dissolvedAt: null,
	},
	roster: [{ agentId: "agent-az16", name: "Atlas", role: "builder", isLead: true }],
	burn: { capacity: 5 },
	tasksInProgress: [
		{
			id: "bet-az16",
			title: "Semantic design profiles",
			status: "active",
			progressDone: 8,
			progressTotal: 9,
		},
	],
};

const KNOWLEDGE = {
	id: "k-az16",
	topic: "Design system",
	title: "Semantic profile contract",
	body: "# Semantic profile contract\n\n## Typography\n\n### Complete definitions\n\n#### Labels\n\n##### Motion\n\n###### Borders\n\nUse `TYPE_STYLE` for generated content.",
	format: "markdown",
	status: "active",
	version: 1,
	updatedBy: "agent-az16",
	originAgent: "Atlas",
	confidence: 0.98,
	scope: "practices",
	createdAt: "2026-08-14T08:00:00.000Z",
	updatedAt: "2026-08-14T09:00:00.000Z",
	signals: null,
};

async function json(route: Route, body: unknown): Promise<void> {
	await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
}

async function installAz16Mocks(page: Page): Promise<void> {
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one hermetic router owns the exact AZ16 route matrix.
	await page.route("**/api/**", async (route) => {
		const { pathname } = new URL(route.request().url());
		if (pathname === "/api/auth/me") {
			return json(route, {
				id: "test-founder",
				name: "Test Founder",
				email: "test@hyperidle.dev",
				role: "founder",
			});
		}
		if (pathname === "/api/settings") {
			return json(route, {
				profile: { name: "Test Founder", email: "test@hyperidle.dev", avatarUrl: null },
				teams: [],
				users: [],
				notifications: {
					reviewAlerts: true,
					blockerAlerts: true,
					quietHoursEnabled: false,
					quietHoursStart: "22:00",
					quietHoursEnd: "08:00",
					mutedTeams: [],
				},
			});
		}
		if (pathname === "/api/threads/t-az16/messages") {
			return json(route, {
				messages: [
					{
						id: "m-az16",
						threadId: "t-az16",
						authorId: "agent-az16",
						content: "All semantic profile gates are green.",
						createdAt: "2026-08-14T09:00:00.000Z",
						blocks: [],
					},
				],
				nextCursor: null,
			});
		}
		if (pathname === "/api/threads/t-az16") {
			return json(route, {
				thread: THREAD,
				messages: [],
				headMessageId: null,
				nextMessagesCursor: null,
			});
		}
		if (pathname === "/api/threads") return json(route, { threads: [THREAD], nextCursor: null });
		if (pathname === "/api/teams/team-az16") return json(route, TEAM);
		if (pathname === "/api/teams") {
			return json(route, { teams: [{ id: "team-az16", name: "Hearth", phase: "build" }] });
		}
		if (pathname === "/api/bets/bet-az16/artifact-thread-summary") {
			return json(route, { summaries: [], totalCount: 0, truncated: false });
		}
		if (pathname === "/api/bets/bet-az16") return json(route, BET);
		if (pathname === "/api/bets")
			return json(route, { draft: [], active: [BET], completed: [], killed: [] });
		if (pathname === "/api/knowledge/k-az16") return json(route, KNOWLEDGE);
		if (pathname === "/api/knowledge") return json(route, { items: [KNOWLEDGE], nextCursor: null });
		if (pathname === "/api/org") {
			return json(route, {
				edges: [],
				users: [{ id: "test-founder", kind: "human", name: "Test Founder", role: "founder" }],
				teams: [{ id: "team-az16", name: "Hearth" }],
			});
		}
		if (pathname === "/api/harnesses") return json(route, []);
		if (pathname === "/api/agents") return json(route, []);
		if (pathname === "/api/connections") return json(route, []);
		if (pathname === "/api/credentials") return json(route, []);
		if (pathname === "/api/settings/agent-behavior/config") return json(route, { items: [] });
		if (pathname === "/api/filesystems") return json(route, { filesystems: [] });
		if (pathname === "/api/reviews/review-az16") {
			return json(route, { ...REVIEW_COMPOSITION_SUBJECT, id: "review-az16", betId: "bet-az16" });
		}
		if (pathname === "/api/sessions") return json(route, { sessions: [] });
		if (pathname === "/api/artifacts") return json(route, { items: [], nextCursor: null });
		if (pathname.includes("/routines")) return json(route, { routines: [] });
		if (pathname.includes("/agents")) return json(route, { agents: [] });
		return json(route, {});
	});
}

const TYPE_EXPECTED = {
	label: ["11px", "600", "13.75px", "0.66px"],
	metadata: ["12px", "500", "16.8px", "normal"],
	small: ["13px", "400", "18.2px", "normal"],
	copy: ["15px", "400", "23.25px", "normal"],
	control: ["13px", "500", "16.25px", "normal"],
	input: ["13px", "400", "18.2px", "normal"],
	"avatar-initial": ["12px", "600", "12px", "normal"],
	subheading: ["15px", "600", "21px", "normal"],
	lead: ["17px", "600", "21.25px", "-0.17px"],
	title: ["20px", "600", "28px", "-0.2px"],
	display: ["24px", "600", "30px", "-0.24px"],
	metric: ["24px", "600", "24px", "-0.24px"],
	data: ["12px", "500", "16.8px", "normal"],
	"inline-code": ["13px", "400", "20.15px", "normal"],
} as const;

const MOTION_EXPECTED = {
	feedback: { property: "opacity, filter", duration: "0.12s" },
	move: { property: "transform", duration: "0.24s" },
	spring: { property: "transform", duration: "0.24s" },
} as const;

const ANIMATION_EXPECTED = {
	enter: { name: "hearth-enter", duration: "0.12s", iterations: "1" },
	activity: { name: "hearth-activity", duration: "1.4s", iterations: "infinite" },
	loading: { name: "hearth-loading", duration: "1.8s", iterations: "infinite" },
	busy: { name: "hearth-busy", duration: "0.75s", iterations: "infinite" },
} as const;

async function addProfilePanel(page: Page): Promise<void> {
	await page.evaluate(
		({ typeRoles, transitionProfiles, animationProfiles }) => {
			const panel = document.createElement("section");
			panel.id = "az16-profile-proof";
			panel.setAttribute("aria-label", "AZ16 semantic profile proof");
			panel.style.cssText =
				"position:relative;z-index:1;margin:18px;padding:18px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;background:var(--surface-page);color:var(--text-primary)";
			for (const role of typeRoles) {
				const node = document.createElement("div");
				node.className = `type-${role}`;
				node.dataset.az16Profile = role;
				node.textContent = role === "metric" ? "47 / 47" : role;
				panel.append(node);
			}
			for (const profile of transitionProfiles) {
				const node = document.createElement("div");
				node.className = `motion-${profile}`;
				node.dataset.az16Profile = profile;
				node.textContent = profile;
				panel.append(node);
			}
			for (const profile of animationProfiles) {
				const node = document.createElement("div");
				node.className = `motion-${profile}`;
				node.dataset.az16Profile = profile;
				node.textContent = profile;
				panel.append(node);
			}
			for (const [profile, width] of [
				["thin", "var(--bw-thin)"],
				["default", "var(--bw-default)"],
				["strong", "var(--bw-strong)"],
			] as const) {
				const node = document.createElement("div");
				node.dataset.az16Profile = profile;
				node.textContent = `${profile} border`;
				node.style.border = `${width} solid var(--border-default)`;
				panel.append(node);
			}
			document.querySelector("main")?.prepend(panel);
		},
		{
			typeRoles: Object.keys(TYPE_EXPECTED),
			transitionProfiles: Object.keys(MOTION_EXPECTED),
			animationProfiles: Object.keys(ANIMATION_EXPECTED),
		},
	);
}

test.beforeAll(async () => mkdir(SCREENSHOTS, { recursive: true }));

test("AZ16 complete profiles resolve exactly and paint in both Hearth themes", async ({ page }) => {
	await installAz16Mocks(page);
	await page.goto("/conversations");
	await expect(page.getByTestId("conversations-page")).toBeVisible();
	await addProfilePanel(page);

	for (const [role, [fontSize, fontWeight, lineHeight, letterSpacing]] of Object.entries(
		TYPE_EXPECTED,
	)) {
		const styles = await page
			.locator(`[data-az16-profile="${role}"]`)
			.first()
			.evaluate((node) => {
				const style = getComputedStyle(node);
				return {
					fontFamily: style.fontFamily,
					fontSize: style.fontSize,
					fontWeight: style.fontWeight,
					letterSpacing: style.letterSpacing,
					lineHeight: style.lineHeight,
					fontVariantNumeric: style.fontVariantNumeric,
				};
			});
		expect(styles.fontSize).toBe(fontSize);
		expect(styles.fontWeight).toBe(fontWeight);
		expect(styles.lineHeight).toBe(lineHeight);
		expect(styles.letterSpacing).toBe(letterSpacing);
		expect(styles.fontFamily).toContain(
			role === "data" || role === "inline-code" ? "monospace" : "system-ui",
		);
		if (role === "metric") expect(styles.fontVariantNumeric).toContain("tabular-nums");
	}

	for (const [profile, expected] of Object.entries(MOTION_EXPECTED)) {
		const style = await page
			.locator(`[data-az16-profile="${profile}"]`)
			.first()
			.evaluate((node) => {
				const computed = getComputedStyle(node);
				return {
					transitionProperty: computed.transitionProperty,
					transitionDuration: computed.transitionDuration,
				};
			});
		expect(style.transitionProperty).toBe(expected.property);
		expect(style.transitionDuration).toBe(expected.duration);
	}
	for (const [profile, expected] of Object.entries(ANIMATION_EXPECTED)) {
		const style = await page
			.locator(`[data-az16-profile="${profile}"]`)
			.first()
			.evaluate((node) => {
				const computed = getComputedStyle(node);
				return {
					animationName: computed.animationName,
					animationDuration: computed.animationDuration,
					animationIterationCount: computed.animationIterationCount,
				};
			});
		expect(style.animationName).toBe(expected.name);
		expect(style.animationDuration).toBe(expected.duration);
		expect(style.animationIterationCount).toBe(expected.iterations);
	}
	for (const [profile, { token, painted }] of Object.entries({
		thin: { token: "1px", painted: "1px" },
		// Chromium at DPR 1 paints half-pixel borders on one device pixel.
		default: { token: "1.5px", painted: "1px" },
		strong: { token: "2px", painted: "2px" },
	})) {
		const tokenValue = await page.evaluate(
			(name) => getComputedStyle(document.documentElement).getPropertyValue(`--bw-${name}`).trim(),
			profile,
		);
		expect(tokenValue).toBe(token);
		await expect(page.locator(`[data-az16-profile="${profile}"]`).first()).toHaveCSS(
			"border-top-width",
			painted,
		);
	}

	await page.screenshot({ path: resolve(SCREENSHOTS, "AZ16-profiles-light.png"), fullPage: true });
	await page.evaluate(() => document.documentElement.setAttribute("data-theme", "hearth-dark"));
	await page.screenshot({ path: resolve(SCREENSHOTS, "AZ16-profiles-dark.png"), fullPage: true });
});

test("AZ16 representative route matrix paints loaded application states", async ({ page }) => {
	await installAz16Mocks(page);
	const routes = [
		["conversations", "/conversations/t-az16", "conversations-page"],
		["team", "/work/team/team-az16", "work-team-page"],
		["bet", "/work/task/bet-az16", "task-detail-page"],
		["knowledge", "/knowledge/k-az16", "knowledge-detail-page"],
		["settings", "/conversations?settings=open", "settings-page"],
		["review", "/reviews/review-az16", null],
	] as const;
	for (const [name, route, testId] of routes) {
		await page.goto(route);
		if (testId) {
			await expect(page.getByTestId(testId).first()).toBeVisible();
		} else {
			await expect(page.getByText(REVIEW_COMPOSITION_SUBJECT.title).first()).toBeVisible();
		}
		await page.screenshot({
			path: resolve(SCREENSHOTS, `AZ16-route-${name}.png`),
			fullPage: false,
		});
	}
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto("/conversations?settings=open");
	const input = page.locator('[data-az16-profile~="input"]').first();
	await expect(input).toHaveCSS("font-size", "16px");
	await page.screenshot({
		path: resolve(SCREENSHOTS, "AZ16-settings-mobile-input.png"),
		fullPage: false,
	});
});

test("AZ16 reduced motion disables authored and foreign motion globally", async ({ page }) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await installAz16Mocks(page);
	await page.goto("/conversations?settings=open");
	await addProfilePanel(page);
	await page.evaluate(() => {
		const foreign = document.createElement("div");
		foreign.dataset.tokenSubject = "foreign";
		foreign.dataset.az16Profile = "foreign-motion";
		foreign.className = "motion-busy";
		foreign.style.scrollBehavior = "smooth";
		foreign.innerHTML = '<span class="motion-feedback">foreign preview</span>';
		document.body.append(foreign);
	});
	await expect
		.poll(() =>
			page.locator("body *").evaluateAll((nodes) =>
				nodes.flatMap((node) => {
					const base = getComputedStyle(node);
					const before = getComputedStyle(node, "::before");
					const after = getComputedStyle(node, "::after");
					return [base, before, after].some(
						(style) =>
							style.animationName !== "none" ||
							style.transitionProperty !== "none" ||
							style.scrollBehavior !== "auto",
					)
						? [node.outerHTML.slice(0, 160)]
						: [];
				}),
			),
		)
		.toEqual([]);
});
