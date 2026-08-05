/**
 * WorkTask stories — W3 AC-26 through AC-32 task detail page.
 *
 * WorkTask fetches bet + sessions data from the API. Stories mock
 * window.fetch to provide controlled data without a live server.
 */

import { MemoryRouter, Route, Routes } from "react-router-dom";
import { WorkTask } from "./WorkTask";

export default { title: "Page: Work/Task" };

const BET_ID = "story-bet-1";
const TASK_ID = "story-task-1";

/** Mock fetch for stories — returns a bet with one task + sessions data. */
function setupFetchMock(outcome: "ready" | "loading" | "error" | "not-found" = "ready"): void {
	if (typeof window === "undefined") return;

	window.fetch = async (url: RequestInfo | URL): Promise<Response> => {
		const urlStr = typeof url === "string" ? url : url.toString();

		// Simulate network delay for loading story
		if (outcome === "loading") {
			await new Promise(() => {}); // never resolves
		}

		if (outcome === "error") {
			return { ok: false, status: 500, json: async () => ({}) } as Response;
		}

		if (urlStr.includes("/api/bets/")) {
			if (outcome === "not-found") {
				return {
					ok: true,
					json: async () => ({ tasks: [] }),
				} as unknown as Response;
			}
			return {
				ok: true,
				json: async () => ({
					id: BET_ID,
					title: "User Auth Flow",
					team: "Core Team",
					status: "active",
					atRisk: false,
					tokenAppetite: null,
					tokensActual: null,
					progress: { done: 1, total: 3 },
					description: "# Problem\n\nAuthentication needs a full revamp.",
					tasks: [
						{
							id: TASK_ID,
							title: "Implement OAuth2 login endpoint",
							owner: "Auth Agent",
							state: "in_progress",
							latestSessionOutcome: null,
							latestSessionHarnessUrl: null,
						},
					],
				}),
			} as unknown as Response;
		}

		if (urlStr.includes("/api/tasks/") && urlStr.includes("/sessions")) {
			return {
				ok: true,
				json: async () => ({
					sessions: [
						{
							id: "sess-1",
							title: "Auth endpoint implementation session",
							agent: "Auth Agent",
							tokens: 12500,
							status: "active",
							harnessUrl: "https://harness.example.com/sess-1",
						},
						{
							id: "sess-2",
							title: "Token refresh implementation",
							agent: "Auth Agent",
							tokens: 8200,
							status: "done",
							harnessUrl: null,
						},
					],
				}),
			} as unknown as Response;
		}

		if (urlStr.includes("/api/artifacts")) {
			return {
				ok: true,
				json: async () => ({ items: [], nextCursor: null }),
			} as unknown as Response;
		}

		if (urlStr.includes("/api/threads")) {
			return {
				ok: true,
				json: async () => ({
					thread: {
						id: "th-1",
						hostKind: "task",
						hostId: TASK_ID,
						resolvedAt: null,
					},
					messages: [],
					identities: {},
				}),
			} as unknown as Response;
		}

		return {
			ok: true,
			json: async () => ({}),
		} as unknown as Response;
	};
}

function TaskPageWrapper(): React.JSX.Element {
	return (
		<MemoryRouter initialEntries={[`/work/bet/${BET_ID}/task/${TASK_ID}`]}>
			<Routes>
				<Route
					path="/work/bet/:betId/task/:taskId"
					element={<WorkTask overrideBetId={BET_ID} overrideTaskId={TASK_ID} />}
				/>
			</Routes>
		</MemoryRouter>
	);
}

export const Populated = (): React.JSX.Element => {
	setupFetchMock("ready");
	return <TaskPageWrapper />;
};

export const Loading = (): React.JSX.Element => {
	setupFetchMock("loading");
	return <TaskPageWrapper />;
};

export const FetchError = (): React.JSX.Element => {
	setupFetchMock("error");
	return <TaskPageWrapper />;
};

export const NotFound = (): React.JSX.Element => {
	setupFetchMock("not-found");
	return <TaskPageWrapper />;
};
