/**
 * W3 — Task Detail Page AC-26 through AC-32: Red phase tests.
 *
 * AC-26: Route /work/bet/:betId/task/:taskId renders task detail page.
 * AC-27: Breadcrumb: Work / [Team] / [Bet] / [Task title].
 * AC-28: Metadata strip: Owner, Status, Started, Session.
 *   (AU21 Increment 14a: Cost HARD-DELETED from the metadata strip, no replacement.)
 * AC-29: Sessions section (title, agent, tokens, status).
 * AC-30: Discussion section.
 * AC-31: Artifacts section.
 * AC-32: Content max-width 800px, centered.
 *
 * Also validates critique mandates: loading state, error state, not-found state.
 */

import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

// Mock useBet to return bet fixture
vi.mock("../../hooks/useBet", () => ({
	useBet: (betId: string) => {
		if (betId === "b1") {
			return {
				data: {
					id: "b1",
					title: "User Auth Flow",
					team: "Alpha Core",
					status: "active",
					tasks: [
						{
							id: "t1",
							title: "Implement login endpoint",
							owner: "Dev Agent 1",
							state: "in_progress",
							startedAt: "2026-01-01T10:00:00.000Z",
						},
					],
				},
				loading: false,
				error: null,
			};
		}
		if (betId === "error-bet") {
			return { data: null, loading: false, error: new Error("Not found") };
		}
		if (betId === "loading-bet") {
			return { data: null, loading: true, error: null };
		}
		return { data: null, loading: false, error: new Error("Not found") };
	},
}));

vi.mock("../../hooks/useTaskSessions", () => ({
	useTaskSessions: (taskId: string) => {
		if (taskId === "t1") {
			return {
				data: {
					sessions: [
						{
							id: "s1",
							title: "Session 1",
							agent: "Dev Agent 1",
							tokens: 12000,
							status: "completed",
							harnessUrl: null,
						},
					],
				},
				loading: false,
				error: null,
			};
		}
		return { data: null, loading: false, error: null };
	},
}));

vi.mock("../../shell/HostThreadSection", () => ({
	HostThreadSection: ({ hostKind, hostId }: { hostKind: string; hostId: string }) => (
		<div data-testid="host-thread-section" data-host-kind={hostKind} data-host-id={hostId} />
	),
}));

vi.mock("../../components/ArtifactSection", () => ({
	ArtifactSection: ({ filter }: { filter: unknown }) => (
		<div data-testid="artifact-section" data-filter={JSON.stringify(filter)} />
	),
	useArtifactOpen: () => vi.fn(),
}));

import { WorkTask } from "../../pages/WorkTask";

function renderTaskPage(
	betId = "b1",
	taskId = "t1",
	overrides: { overrideBetId?: string; overrideTaskId?: string } = {},
): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[`/work/bet/${betId}/task/${taskId}`]}>
			<Routes>
				<Route
					path="/work/bet/:betId/task/:taskId"
					element={
						<WorkTask
							overrideBetId={overrides.overrideBetId}
							overrideTaskId={overrides.overrideTaskId}
						/>
					}
				/>
			</Routes>
		</MemoryRouter>,
	);
}

// ---------------------------------------------------------------------------
// AC-26: Route existence
// ---------------------------------------------------------------------------
describe("W3 AC-26 — Task detail route renders", () => {
	it("renders without crashing when route params are valid", () => {
		expect(() => renderTaskPage()).not.toThrow();
	});

	it("has data-testid='task-detail-page'", () => {
		renderTaskPage();
		// Fails until WorkTask is implemented — placeholder has 'worktask-not-implemented'
		expect(screen.getByTestId("task-detail-page")).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// AC-27: Breadcrumb
// ---------------------------------------------------------------------------
describe("W3 AC-27 — Breadcrumb", () => {
	it("renders 'Work' breadcrumb segment", () => {
		renderTaskPage();
		const breadcrumb = screen.getByTestId("task-breadcrumb");
		expect(breadcrumb).toBeInTheDocument();
		expect(breadcrumb).toHaveTextContent(/work/i);
	});

	it("renders team name in breadcrumb", () => {
		renderTaskPage();
		const breadcrumb = screen.getByTestId("task-breadcrumb");
		expect(breadcrumb).toHaveTextContent("Alpha Core");
	});

	it("renders bet title in breadcrumb", () => {
		renderTaskPage();
		const breadcrumb = screen.getByTestId("task-breadcrumb");
		expect(breadcrumb).toHaveTextContent("User Auth Flow");
	});

	it("renders task title in breadcrumb", () => {
		renderTaskPage();
		const breadcrumb = screen.getByTestId("task-breadcrumb");
		expect(breadcrumb).toHaveTextContent("Implement login endpoint");
	});
});

// ---------------------------------------------------------------------------
// AC-28: Metadata strip
// ---------------------------------------------------------------------------
describe("W3 AC-28 — Metadata strip", () => {
	it("renders a metadata strip", () => {
		renderTaskPage();
		expect(screen.getByTestId("task-meta-strip")).toBeInTheDocument();
	});

	it("metadata strip shows owner", () => {
		renderTaskPage();
		const strip = screen.getByTestId("task-meta-strip");
		expect(strip).toHaveTextContent(/dev agent 1/i);
	});

	it("metadata strip shows status", () => {
		renderTaskPage();
		const strip = screen.getByTestId("task-meta-strip");
		expect(strip).toHaveTextContent(/in progress|in_progress/i);
	});
});

// ---------------------------------------------------------------------------
// AC-29: Sessions section
// ---------------------------------------------------------------------------
describe("W3 AC-29 — Sessions section", () => {
	it("renders a sessions section", () => {
		renderTaskPage();
		expect(screen.getByTestId("task-sessions-section")).toBeInTheDocument();
	});

	it("sessions section lists session rows", () => {
		renderTaskPage();
		const section = screen.getByTestId("task-sessions-section");
		const sessionRows = section.querySelectorAll("[data-testid='session-row']");
		expect(sessionRows.length).toBeGreaterThan(0);
	});

	it("session row shows title and agent name", () => {
		renderTaskPage();
		const section = screen.getByTestId("task-sessions-section");
		expect(section).toHaveTextContent(/session 1/i);
		expect(section).toHaveTextContent(/dev agent 1/i);
	});
});

// ---------------------------------------------------------------------------
// AC-30: Discussion section
// ---------------------------------------------------------------------------
describe("W3 AC-30 — Discussion section", () => {
	it("renders HostThreadSection with hostKind='task'", () => {
		renderTaskPage();
		const threadSection = screen.getByTestId("host-thread-section");
		expect(threadSection).toBeInTheDocument();
		expect(threadSection).toHaveAttribute("data-host-kind", "task");
	});

	it("HostThreadSection receives correct hostId", () => {
		renderTaskPage();
		const threadSection = screen.getByTestId("host-thread-section");
		expect(threadSection).toHaveAttribute("data-host-id", "t1");
	});
});

// ---------------------------------------------------------------------------
// AC-31: Artifacts section
// ---------------------------------------------------------------------------
describe("W3 AC-31 — Artifacts section", () => {
	it("renders ArtifactSection", () => {
		renderTaskPage();
		expect(screen.getByTestId("artifact-section")).toBeInTheDocument();
	});

	it("ArtifactSection receives task filter", () => {
		renderTaskPage();
		const artifactSection = screen.getByTestId("artifact-section");
		const filterAttr = artifactSection.getAttribute("data-filter");
		expect(filterAttr).toContain("task");
		expect(filterAttr).toContain("t1");
	});
});

// ---------------------------------------------------------------------------
// AC-32: Content max-width 800px, centered
// ---------------------------------------------------------------------------
describe("W3 AC-32 — Task detail max-width 800px", () => {
	it("detail body keeps 800px measure and starts in the page frame", () => {
		renderTaskPage();
		const body = document.querySelector("[data-testid='task-detail-body']");
		expect(body).not.toBeNull();
		expect(body?.className).toMatch(/max-w-\[800px\]/);
		expect(body?.className).not.toMatch(/mx-auto/);
		expect(body?.closest("[data-page-frame]")).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Critique mandates: loading / error / not-found states
// ---------------------------------------------------------------------------
describe("W3 WorkTask — loading state (critique CRITICAL-3)", () => {
	it("renders skeleton while bet data is loading", () => {
		renderTaskPage("loading-bet", "t1");
		// Should show loading skeleton, not crash
		const skeleton = document.querySelector(
			"[data-testid='task-detail-loading'], [aria-label*='loading' i]",
		);
		expect(skeleton).not.toBeNull();
	});
});

describe("W3 WorkTask — error state (critique CRITICAL-3)", () => {
	it("renders error state when bet fetch fails", () => {
		renderTaskPage("error-bet", "t1");
		const errorEl = screen.queryByTestId("task-detail-error");
		expect(errorEl).not.toBeNull();
	});
});

describe("W3 WorkTask — not-found state (critique CRITICAL-3)", () => {
	it("renders not-found when taskId is invalid", () => {
		renderTaskPage("b1", "nonexistent-task");
		const notFound = screen.queryByTestId("task-detail-not-found");
		const heading = screen.queryByText(/not found|task not found/i);
		expect(notFound ?? heading).not.toBeNull();
	});
});
