/**
 * BB1 — WorkTaskPage: subtask reorder controls (AC12 component test).
 *
 * AC12: Subtasks can be reordered. The UI control issues PATCH with the
 * target position, then re-reads the tree so the server's canonical order
 * is what renders — never optimistic-only.
 *
 * Tests:
 *  1. Three siblings render with move-up / move-down buttons.
 *  2. "Move up" is disabled on the first sibling; "Move down" is disabled
 *     on the last sibling.
 *  3. Clicking "Move down" on the first sibling issues PATCH /api/tasks/:id
 *     with { position: 1 }.
 *  4. After PATCH, the tree is re-read and the server's order renders.
 *  5. Reorder controls work at grandchild depth — clicking "Move down" on
 *     the first grandchild issues PATCH against the grandchild's id.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkTaskPage } from "../WorkTaskPage";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockApiFetch = vi.fn();
vi.mock("../../services/api-fetch.js", () => ({
	apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

vi.mock("../../components/ArtifactSection.js", () => ({
	ArtifactSection: () => null,
	useArtifactOpen: () => vi.fn(),
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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeTask(overrides: Partial<{
	id: string;
	parentTaskId: string | null;
	title: string;
	state: string;
	teamId: string;
	position: number;
}> = {}): object {
	return {
		id: overrides.id ?? "task-1",
		parentTaskId: overrides.parentTaskId ?? null,
		teamId: overrides.teamId ?? "team-1",
		ownerAgentId: null,
		title: overrides.title ?? "Untitled task",
		description: null,
		doneCondition: null,
		state: overrides.state ?? "proposed",
		position: overrides.position ?? 0,
		dependencies: null,
		artifacts: null,
		threadId: null,
		notes: null,
		auditTrail: null,
		outcomeVerdict: null,
		outcomeSummary: null,
		outcomeRecordedAt: null,
		outcomeRecordedBy: null,
		tokensActualJson: null,
		sourceKnowledgeItemId: null,
		createdAt: "2026-08-30T10:00:00.000Z",
		updatedAt: "2026-08-30T10:00:00.000Z",
		completedAt: null,
	};
}

const ROOT_ID = "bb1-root";
const CHILD_A_ID = "bb1-child-a";
const CHILD_B_ID = "bb1-child-b";
const CHILD_C_ID = "bb1-child-c";
const GRANDCHILD_X_ID = "bb1-grandchild-x";
const GRANDCHILD_Y_ID = "bb1-grandchild-y";

const rootTask = makeTask({ id: ROOT_ID, title: "Root task" });
const childA = makeTask({ id: CHILD_A_ID, parentTaskId: ROOT_ID, title: "Child A" });
const childB = makeTask({ id: CHILD_B_ID, parentTaskId: ROOT_ID, title: "Child B" });
const childC = makeTask({ id: CHILD_C_ID, parentTaskId: ROOT_ID, title: "Child C" });
const grandchildX = makeTask({ id: GRANDCHILD_X_ID, parentTaskId: CHILD_A_ID, title: "Grandchild X" });
const grandchildY = makeTask({ id: GRANDCHILD_Y_ID, parentTaskId: CHILD_A_ID, title: "Grandchild Y" });

// Initial tree: root → [A, B, C]; A → [X, Y]
const INITIAL_TREE = {
	task: rootTask,
	ancestors: [],
	tokensActualRollup: null,
	children: [
		{ ...childA, children: [
				{ ...grandchildX, children: [] },
				{ ...grandchildY, children: [] },
			],
		},
		{ ...childB, children: [] },
		{ ...childC, children: [] },
	],
};

// After moving A down: server returns [B, A, C]
const AFTER_MOVE_A_DOWN = {
	...INITIAL_TREE,
	children: [
		{ ...childB, children: [] },
		{ ...childA, children: [
				{ ...grandchildX, children: [] },
				{ ...grandchildY, children: [] },
			],
		},
		{ ...childC, children: [] },
	],
};

// After moving grandchild X down: server returns [Y, X]
const AFTER_MOVE_X_DOWN = {
	...INITIAL_TREE,
	children: [
		{ ...childA, children: [
				{ ...grandchildY, children: [] },
				{ ...grandchildX, children: [] },
			],
		},
		{ ...childB, children: [] },
		{ ...childC, children: [] },
	],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Set up apiFetch to:
 * - Return `initialTree` on the first GET /tree call
 * - Return `afterTree` on subsequent GET /tree calls (after PATCH triggers refresh)
 * - Respond 200 to PATCH
 * - Respond 200 with empty sessions
 *
 * Returns an array that captures every PATCH call's [url, body].
 */
function setupFetch(
	initialTree: object,
	afterTree: object,
): Array<{ url: string; body: unknown }> {
	const patchCalls: Array<{ url: string; body: unknown }> = [];
	let treeCallCount = 0;

	mockApiFetch.mockImplementation((url: string, init?: RequestInit) => {
		if (typeof url === "string" && url.includes("/tree")) {
			const payload = treeCallCount === 0 ? initialTree : afterTree;
			treeCallCount++;
			return Promise.resolve({
				ok: true,
				json: (): Promise<unknown> => Promise.resolve(payload),
			});
		}
		if (typeof url === "string" && url.includes("/sessions")) {
			return Promise.resolve({
				ok: true,
				json: (): Promise<unknown> => Promise.resolve({ sessions: [] }),
			});
		}
		if (init?.method === "PATCH") {
			patchCalls.push({
				url: typeof url === "string" ? url : String(url),
				body: JSON.parse(String(init.body ?? "{}")),
			});
			return Promise.resolve({
				ok: true,
				json: (): Promise<unknown> => Promise.resolve({}),
			});
		}
		return Promise.resolve({
			ok: true,
			json: (): Promise<unknown> => Promise.resolve({}),
		});
	});

	return patchCalls;
}

function renderPage(taskId: string): void {
	render(
		<MemoryRouter initialEntries={[`/work/task/${taskId}`]}>
			<Routes>
				<Route path="/work/task/:taskId" element={<WorkTaskPage overrideTaskId={taskId} />} />
			</Routes>
		</MemoryRouter>,
	);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WorkTaskPage subtask reorder controls (BB1 AC12)", () => {
	beforeEach(() => {
		mockApiFetch.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders move-up and move-down buttons for each sibling", async () => {
		setupFetch(INITIAL_TREE, INITIAL_TREE);
		renderPage(ROOT_ID);

		await waitFor(() => {
			expect(screen.getByTestId(`move-up-${CHILD_A_ID}`)).toBeInTheDocument();
		});

		// All three siblings have both buttons
		for (const id of [CHILD_A_ID, CHILD_B_ID, CHILD_C_ID]) {
			expect(screen.getByTestId(`move-up-${id}`)).toBeInTheDocument();
			expect(screen.getByTestId(`move-down-${id}`)).toBeInTheDocument();
		}
	});

	it("move-up is disabled on the first sibling; move-down is disabled on the last", async () => {
		setupFetch(INITIAL_TREE, INITIAL_TREE);
		renderPage(ROOT_ID);

		await waitFor(() => {
			expect(screen.getByTestId(`move-up-${CHILD_A_ID}`)).toBeInTheDocument();
		});

		// A is first — move-up disabled
		expect(screen.getByTestId(`move-up-${CHILD_A_ID}`)).toBeDisabled();
		expect(screen.getByTestId(`move-down-${CHILD_A_ID}`)).not.toBeDisabled();

		// B is middle — neither disabled
		expect(screen.getByTestId(`move-up-${CHILD_B_ID}`)).not.toBeDisabled();
		expect(screen.getByTestId(`move-down-${CHILD_B_ID}`)).not.toBeDisabled();

		// C is last — move-down disabled
		expect(screen.getByTestId(`move-up-${CHILD_C_ID}`)).not.toBeDisabled();
		expect(screen.getByTestId(`move-down-${CHILD_C_ID}`)).toBeDisabled();
	});

	it("clicking Move down on the first sibling issues PATCH with position:1 then re-reads", async () => {
		const patchCalls = setupFetch(INITIAL_TREE, AFTER_MOVE_A_DOWN);
		renderPage(ROOT_ID);

		// Wait for tree to render
		await waitFor(() => {
			expect(screen.getByTestId(`move-down-${CHILD_A_ID}`)).toBeInTheDocument();
		});

		const user = userEvent.setup();
		await user.click(screen.getByTestId(`move-down-${CHILD_A_ID}`));

		// PATCH was called with the right position
		await waitFor(() => {
			expect(patchCalls).toHaveLength(1);
		});
		// Non-null: we just asserted length 1 above
		const patch = patchCalls[0]!;
		expect(patch.url).toMatch(`/api/tasks/${CHILD_A_ID}`);
		expect(patch.body).toMatchObject({ position: 1 });

		// After refresh, server order [B, A, C] is what renders
		await waitFor(() => {
			const rows = screen.getAllByTestId("subtask-row");
			// First top-level row now leads with "Child B"
			expect(rows[0]).toHaveTextContent("Child B");
		});
	});

	it("reorder controls work at grandchild depth", async () => {
		const patchCalls = setupFetch(INITIAL_TREE, AFTER_MOVE_X_DOWN);
		renderPage(ROOT_ID);

		await waitFor(() => {
			expect(screen.getByTestId(`move-down-${GRANDCHILD_X_ID}`)).toBeInTheDocument();
		});

		// Grandchild X is first among its siblings (X, Y)
		expect(screen.getByTestId(`move-up-${GRANDCHILD_X_ID}`)).toBeDisabled();
		expect(screen.getByTestId(`move-down-${GRANDCHILD_X_ID}`)).not.toBeDisabled();

		const user = userEvent.setup();
		await user.click(screen.getByTestId(`move-down-${GRANDCHILD_X_ID}`));

		await waitFor(() => {
			expect(patchCalls).toHaveLength(1);
		});
		// Non-null: we just asserted length 1 above
		expect(patchCalls[0]!.url).toMatch(`/api/tasks/${GRANDCHILD_X_ID}`);
		expect(patchCalls[0]!.body).toMatchObject({ position: 1 });
	});
});
