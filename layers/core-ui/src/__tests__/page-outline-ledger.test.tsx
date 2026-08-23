// biome-ignore-all lint/correctness/useJsxKeyInIterable: ledger entries render independently
import { render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../hooks/useArtifacts.js", () => ({ useArtifact: () => ({ isLoading: true }) }));
vi.mock("../hooks/useBet.js", () => ({
	useBet: () => ({ data: null, loading: true, error: null }),
}));
vi.mock("../hooks/useTeams", () => ({
	useTeams: () => ({ data: null, loading: true, error: null, refetch: vi.fn() }),
}));
vi.mock("../hooks/useKnowledge.js", () => ({ useKnowledgeItem: () => ({ data: null }) }));
vi.mock("../hooks/useFetch.js", () => ({
	useFetch: () => ({ data: null, isLoading: true, error: null }),
}));
vi.mock("../services/api-fetch.js", () => ({
	apiFetch: () => new Promise<Response>(() => undefined),
}));
vi.mock("../ds", async (importOriginal) => ({
	...(await importOriginal<typeof import("../ds")>()),
	BodyEditor: () => <div data-testid="body-editor" />,
}));

import { AgentProfile } from "../pages/AgentProfile.js";
import { ArtifactPermalink } from "../pages/ArtifactPermalink.js";
import { Conversations } from "../pages/Conversations.js";
import { KnowledgeCreate } from "../pages/KnowledgeCreate.js";
import { KnowledgeDetail } from "../pages/KnowledgeDetail.js";
import { KnowledgeList } from "../pages/KnowledgeList.js";
import { NotFound } from "../pages/NotFound.js";
import { ReviewPage } from "../pages/review/ReviewPage.js";
import { SettingsPage } from "../pages/SettingsPage.js";
import { SetupFlow } from "../pages/SetupFlow.js";
import { WorkBet } from "../pages/WorkBet.js";
import { WorkBetCreate } from "../pages/WorkBetCreate.js";
import { WorkOverviewView } from "../pages/WorkOverview.js";
import { WorkRoutine } from "../pages/WorkRoutine.js";
import { WorkTask } from "../pages/WorkTask.js";
import { WorkTeam } from "../pages/WorkTeam.js";
import { ToastRegion } from "../shell/ToastRegion.js";

const noop = (): void => undefined;
const pendingReview = (): Promise<never> => new Promise(() => undefined);

function assertOutline(element: ReactElement, path: string, title?: string): void {
	const route = path.startsWith("/conversations/") ? "/conversations/:threadId" : "*";
	render(
		<MemoryRouter initialEntries={[path]}>
			<Routes>
				<Route path={route} element={element} />
			</Routes>
		</MemoryRouter>,
	);
	const scaffold = document.querySelector('[data-ds-component="PageScaffold"]');
	const header = scaffold?.querySelector('[data-ds-component="PageHeader"]');
	expect(scaffold?.firstElementChild?.contains(header ?? null)).toBe(true);
	expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
	if (title) expect(screen.getByRole("heading", { level: 1 })).toHaveAccessibleName(title);
	for (const crumb of screen.queryAllByRole("navigation", { name: "Breadcrumb" })) {
		expect(within(crumb).getAllByText("/", { selector: "[aria-hidden]" }).length).toBeGreaterThan(
			0,
		);
		expect(crumb.querySelectorAll("[aria-current='page']")).toHaveLength(1);
		expect(crumb.lastElementChild).toHaveAttribute("aria-current", "page");
	}
	if (path === "/setup")
		expect(scaffold?.querySelector("[data-page-scroll]")).toContainElement(
			screen.getByRole("button", { name: /start hyperidle/i }),
		);
}

describe("real route outline ledger", () => {
	afterEach(() => document.body.replaceChildren());

	for (const [name, path, title, element] of [
		["Setup", "/setup", "Setup", <SetupFlow />],
		["Conversations queue", "/conversations", "Conversations", <Conversations />],
		["Conversation detail", "/conversations/thread-1", undefined, <Conversations />],
		["Work Team", "/work/team/t", "Team", <WorkTeam overrideLoading />],
		["Work Routine", "/work/routine/r", "Routine", <WorkRoutine overrideLoading />],
		["New Bet", "/work/bet/new", "Untitled bet", <WorkBetCreate />],
		["Work Bet", "/work/bet/b", "Bet", <WorkBet loading />],
		["Work Task", "/work/bet/b/task/t", "Task", <WorkTask />],
		["Review", "/work/bet/b/review/r", "Review", <ReviewPage loader={pendingReview} />],
		["Agent", "/agents/a", "Agent", <AgentProfile overrideLoading />],
		["Knowledge list", "/knowledge", "Knowledge", <KnowledgeList loading />],
		["New Knowledge", "/knowledge/new", undefined, <KnowledgeCreate />],
		["Knowledge detail", "/knowledge/k1", undefined, <KnowledgeDetail overrideKnowledgeId="k1" />],
		["Artifact", "/artifacts/a", "Artifact", <ArtifactPermalink />],
		[
			"Settings",
			"/settings",
			"Settings",
			<ToastRegion>
				<SettingsPage />
			</ToastRegion>,
		],
		["NotFound", "/missing", "Page not found", <NotFound />],
	] as const) {
		it(name, () => assertOutline(element, path, title));
	}

	it("Work overview covers loading, error, and empty branches", () => {
		const props = {
			teams: [],
			onSelectTeam: noop,
			onNewBet: noop,
			onFinishSetup: noop,
			onRetry: noop,
		};
		for (const state of [
			{ loading: true },
			{ loading: false, error: new Error("x") },
			{ loading: false },
		]) {
			assertOutline(<WorkOverviewView {...props} error={null} {...state} />, "/work", "Teams");
			document.body.replaceChildren();
		}
	});
});
