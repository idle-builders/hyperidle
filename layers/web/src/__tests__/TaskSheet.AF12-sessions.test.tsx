/**
 * AF12 — AC4: TaskSheet renders a Sessions section with active/completed/stopped
 * indicators, a loading line, and a non-blank empty state.
 *
 * Locked copy/behavior from design/approved.md Surface 4:
 *  - Loading → "Loading sessions…"
 *  - Empty → "No sessions yet." (never blank)
 *  - Active session → live dot + "Active"
 *  - Stopped session → non-blank label "stopped" (raw-status fallback)
 *
 * @lore AF12 RED: TaskSheet has no Sessions section yet, so every assertion here
 * fails until the green phase inserts `TaskSheetSessions` + a `SessionRow`.
 */

import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FetchState } from "../hooks/useFetch";
import type { TaskSessionsData } from "../hooks/useTaskSessions";

// Drive the sessions section through the hook.
const useTaskSessionsMock = vi.fn();
vi.mock("../hooks/useTaskSessions", () => ({
	useTaskSessions: (...args: unknown[]) => useTaskSessionsMock(...args),
}));

// TaskSheet renders HostThreadSection + ArtifactSection — stub them out.
vi.mock("../hooks/useHostThread", () => ({
	useHostThread: vi.fn(() => ({ data: null, error: null, isLoading: false, refresh: vi.fn() })),
}));
vi.mock("../components/ArtifactSection", () => ({
	ArtifactSection: () => null,
	useArtifactOpen: () => vi.fn(),
}));

import type { KanbanTask } from "../shell/TaskSheet";
import { TaskSheet } from "../shell/TaskSheet";

const task: KanbanTask = {
	id: "task-abc",
	title: "Implement login endpoint",
	owner: "Dev Agent 1",
	state: "in_progress",
	betTag: "Auth",
};

function makeProps(): Parameters<typeof TaskSheet>[0] {
	return {
		task,
		open: true,
		onClose: vi.fn(),
		resolveThreadId: vi.fn().mockResolvedValue("thread-1"),
		postRequest: vi.fn().mockResolvedValue(undefined),
		onNavigateToThread: vi.fn(),
	};
}

function fetchState(over: Partial<FetchState<TaskSessionsData>>): FetchState<TaskSessionsData> {
	return {
		data: null,
		isLoading: false,
		error: null,
		...over,
	} as FetchState<TaskSessionsData>;
}

describe("TaskSheet AF12 — Sessions section (AC4)", () => {
	beforeEach(() => useTaskSessionsMock.mockReset());
	afterEach(() => vi.clearAllMocks());

	it("shows 'Loading sessions…' while fetching", () => {
		useTaskSessionsMock.mockReturnValue(fetchState({ isLoading: true }));
		render(<TaskSheet {...makeProps()} />);
		expect(screen.getByText(/loading sessions/i)).toBeInTheDocument();
	});

	it("shows 'No sessions yet.' (non-blank) for a task with zero sessions", () => {
		useTaskSessionsMock.mockReturnValue(fetchState({ data: { sessions: [] } }));
		render(<TaskSheet {...makeProps()} />);
		expect(screen.getByText(/no sessions yet/i)).toBeInTheDocument();
	});

	it("renders an active session with an 'Active' indicator", () => {
		useTaskSessionsMock.mockReturnValue(
			fetchState({
				data: {
					sessions: [
						{
							id: "s1",
							title: "Session 1",
							agent: "agent-1",
							tokens: null,
							status: "active",
							harnessUrl: null,
						},
					],
				},
			}),
		);
		render(<TaskSheet {...makeProps()} />);
		expect(screen.getByText("Active")).toBeInTheDocument();
	});

	it("renders a stopped session with a non-blank 'stopped' label", () => {
		useTaskSessionsMock.mockReturnValue(
			fetchState({
				data: {
					sessions: [
						{
							id: "s2",
							title: "Session 2",
							agent: "agent-1",
							tokens: null,
							status: "stopped",
							harnessUrl: null,
						},
					],
				},
			}),
		);
		render(<TaskSheet {...makeProps()} />);
		// Raw-status fallback: a cascade-stopped session must show a non-blank label.
		expect(screen.getByText("stopped")).toBeInTheDocument();
	});

	it("shows an error line when the fetch fails", () => {
		useTaskSessionsMock.mockReturnValue(fetchState({ error: "boom" }));
		render(<TaskSheet {...makeProps()} />);
		expect(screen.getByText(/couldn't load sessions/i)).toBeInTheDocument();
	});
});
