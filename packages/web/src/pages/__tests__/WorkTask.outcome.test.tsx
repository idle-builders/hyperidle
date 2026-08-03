/**
 * AC1 RED — WorkTask outcome display component tests.
 *
 * AC-6: Outcome data visible on task detail (meta-strip Outcome cell + session effectiveness)
 */

import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { WorkTask } from "../WorkTask";

// Mock useBet to return task fixture with optional outcome verdict
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
							outcomeVerdict: null,
						},
					],
				},
				loading: false,
				error: null,
			};
		}
		if (betId === "b-with-outcome") {
			return {
				data: {
					id: "b-with-outcome",
					title: "Bet with Outcome",
					team: "Alpha Core",
					status: "completed",
					tasks: [
						{
							id: "t-with-outcome",
							title: "Task with outcome verdict",
							owner: "Dev Agent 1",
							state: "done",
							startedAt: "2026-01-01T10:00:00.000Z",
							outcomeVerdict: "met_with_rework",
						},
					],
				},
				loading: false,
				error: null,
			};
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
							cost: { minor: 420, currency: "USD" },
							tokens: 12000,
							status: "completed",
							harnessUrl: null,
							// No effectivenessScore
						},
					],
				},
				loading: false,
				error: null,
			};
		}
		if (taskId === "t-with-outcome") {
			return {
				data: {
					sessions: [
						{
							id: "s2",
							title: "Session with effectiveness",
							agent: "Dev Agent 1",
							cost: { minor: 200, currency: "USD" },
							tokens: 5000,
							status: "completed",
							harnessUrl: null,
							effectivenessScore: 0.87,
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
	ArtifactSection: () => <div data-testid="artifact-section-mock" />,
	useArtifactOpen: () => vi.fn(),
}));

function renderTask(betId: string, taskId: string): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[`/work/bet/${betId}/task/${taskId}`]}>
			<Routes>
				<Route
					path="/work/bet/:betId/task/:taskId"
					element={<WorkTask overrideBetId={betId} overrideTaskId={taskId} />}
				/>
			</Routes>
		</MemoryRouter>,
	);
}

describe("WorkTask — Outcome meta-strip cell (AC-6)", () => {
	it("AC-6: meta-strip shows Outcome cell with '--' when outcomeVerdict is null", () => {
		renderTask("b1", "t1");
		// Outcome cell should be present in the meta-strip
		expect(screen.getByTestId("task-outcome-cell")).toBeInTheDocument();
		// Shows em-dash when not evaluated
		const cell = screen.getByTestId("task-outcome-cell");
		expect(cell).toHaveTextContent("--");
	});

	it("AC-6: meta-strip shows verdict label when outcomeVerdict is populated", () => {
		renderTask("b-with-outcome", "t-with-outcome");
		const cell = screen.getByTestId("task-outcome-cell");
		// met_with_rework maps to "Met with rework"
		expect(cell).toHaveTextContent(/met with rework/i);
	});
});

describe("WorkTask — Session effectiveness score (AC-6)", () => {
	it("AC-6: session row does NOT show effectiveness score when null", () => {
		renderTask("b1", "t1");
		// No effectiveness score — should not be rendered
		expect(screen.queryByTestId("session-effectiveness-score")).not.toBeInTheDocument();
	});

	it("AC-6: session row shows effectiveness score when set", () => {
		renderTask("b-with-outcome", "t-with-outcome");
		// Effectiveness score should be visible
		expect(screen.getByTestId("session-effectiveness-score")).toBeInTheDocument();
		// Score displayed to 2 decimal places
		expect(screen.getByTestId("session-effectiveness-score")).toHaveTextContent("0.87");
	});
});
