/**
 * WorkTaskPage's edit panel: the dependency picker must not
 * offer the task being edited, nor a task already picked. `TaskDependencyField`'s own unit test proves the
 * exclusion logic in isolation; this proves the real wiring on the page
 * that actually ships it — `currentTaskId` and `dependencies` both have to
 * reach the field with the right values for the exclusion to hold live.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkTaskPage } from "../WorkTaskPage";

const mockApiFetch = vi.fn();
vi.mock("../../services/api-fetch.js", () => ({
	apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

vi.mock("../../components/ArtifactSection.js", () => ({
	ArtifactSection: () => null,
}));

vi.mock("../../shell/HostThreadSection.js", () => ({
	HostThreadSection: () => <div data-testid="host-thread-section" />,
}));

vi.mock("../../shell/NavHistoryCluster.js", () => ({
	NavHistoryCluster: () => null,
}));

vi.mock("../../hooks/useViewportBreakpoint.js", () => ({
	useViewportBreakpoint: () => ({ sidebarMobile: false }),
}));

function makeTask(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
	return {
		id: "root",
		parentTaskId: null,
		teamId: "team-1",
		ownerAgentId: null,
		title: "Root task",
		description: null,
		doneCondition: null,
		state: "proposed",
		position: 0,
		dependencies: null,
		threadId: null,
		notes: null,
		outcomeVerdict: null,
		outcomeSummary: null,
		outcomeRecordedAt: null,
		outcomeRecordedBy: null,
		tokensActualJson: null,
		sourceDocumentId: null,
		createdAt: "2026-08-30T10:00:00.000Z",
		updatedAt: "2026-08-30T10:00:00.000Z",
		completedAt: null,
		needsReview: false,
		...overrides,
	};
}

const ROOT_ID = "dep-excl-root";
const PICKED_ID = "dep-excl-picked";

const rootTask = makeTask({
	id: ROOT_ID,
	title: "Root task",
	dependencies: JSON.stringify([PICKED_ID]),
});

const TASK_VIEW = {
	task: rootTask,
	ancestors: [],
	tokensActualRollup: null,
	children: [],
	threadId: null,
	attachments: [],
};

function setupFetch(): void {
	mockApiFetch.mockImplementation((url: string, init?: RequestInit) => {
		if (typeof url === "string" && url.includes("/api/actions/open_task")) {
			return Promise.resolve({
				ok: true,
				json: (): Promise<unknown> => Promise.resolve({ ok: true, data: TASK_VIEW }),
			});
		}
		if (typeof url === "string" && url.includes("/sessions")) {
			return Promise.resolve({
				ok: true,
				json: (): Promise<unknown> => Promise.resolve({ sessions: [] }),
			});
		}
		if (typeof url === "string" && url.includes("/api/actions/search_tasks")) {
			const body = init?.body ? (JSON.parse(String(init.body)) as { ids?: string[] }) : {};
			if (body.ids) {
				return Promise.resolve({
					ok: true,
					json: (): Promise<unknown> =>
						Promise.resolve({ ok: true, data: [{ id: PICKED_ID, title: "Already picked" }] }),
				});
			}
			return Promise.resolve({
				ok: true,
				json: (): Promise<unknown> =>
					Promise.resolve({
						ok: true,
						data: [{ id: "dep-excl-fresh", title: "A fresh candidate" }],
					}),
			});
		}
		return Promise.resolve({ ok: true, json: (): Promise<unknown> => Promise.resolve({}) });
	});
}

function renderPage(): void {
	render(
		<MemoryRouter initialEntries={[`/work/task/${ROOT_ID}`]}>
			<Routes>
				<Route path="/work/task/:taskId" element={<WorkTaskPage overrideTaskId={ROOT_ID} />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("WorkTaskPage — dependency picker exclusion", () => {
	beforeEach(() => {
		mockApiFetch.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("does not offer the task being edited or an already-picked task in search results", async () => {
		setupFetch();
		renderPage();

		await waitFor(() => {
			expect(screen.getByRole("combobox", { name: /depends on/i })).toBeInTheDocument();
		});

		fireEvent.click(screen.getByRole("combobox", { name: /depends on/i }));
		const input = await screen.findByRole("textbox", { name: /search tasks by title/i });
		fireEvent.change(input, { target: { value: "task" } });

		await screen.findByRole("option", { name: "A fresh candidate" });
		expect(screen.queryByRole("option", { name: "Root task" })).toBeNull();
		expect(screen.queryByRole("option", { name: "Already picked" })).toBeNull();
	});
});
