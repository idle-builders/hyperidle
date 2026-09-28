// biome-ignore-all lint/correctness/useJsxKeyInIterable: ledger entries render independently
import { render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/call.js", () => ({
	call: () => new Promise(() => undefined),
}));
vi.mock("../hooks/useTeams", () => ({
	useTeams: () => ({ data: null, loading: true, error: null, refetch: vi.fn() }),
}));
vi.mock("../services/api-fetch.js", () => ({
	apiFetch: () => new Promise<Response>(() => undefined),
}));
vi.mock("../ds", async (importOriginal) => ({
	...(await importOriginal<typeof import("../ds")>()),
	BodyEditor: () => <div data-testid="body-editor" />,
}));

import { AgentProfile } from "../pages/AgentProfile.js";
import { Conversations } from "../pages/Conversations.js";
import { DocumentCreate } from "../pages/DocumentCreate.js";
import { DocumentDetail } from "../pages/DocumentDetail.js";
import { DocumentList } from "../pages/DocumentList.js";
import { NotFound } from "../pages/NotFound.js";
import { ReviewPage } from "../pages/review/ReviewPage.js";
import { SettingsPage } from "../pages/SettingsPage.js";
import { SetupFlow } from "../pages/SetupFlow.js";
import { WorkOverviewView } from "../pages/WorkOverview.js";
import { WorkTaskCreate } from "../pages/WorkTaskCreate.js";
import { WorkTaskPage } from "../pages/WorkTaskPage.js";
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
		["New Task", "/work/task/new", "New task", <WorkTaskCreate />],
		["Work Task (loading)", "/work/task/t", "Task", <WorkTaskPage />],
		["Review", "/reviews/r", "Review", <ReviewPage loader={pendingReview} />],
		["Agent", "/agents/a", "Agent", <AgentProfile overrideLoading />],
		["Document list", "/documents", "Documents", <DocumentList loading />],
		["New Document", "/documents/new", undefined, <DocumentCreate />],
		["Document detail", "/documents/k1", undefined, <DocumentDetail overrideDocumentId="k1" />],
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
