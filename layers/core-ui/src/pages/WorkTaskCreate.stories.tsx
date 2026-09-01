/**
 * WorkTaskCreate stories — task create form at /work/task/new (BB1).
 *
 * Per visual-regression.md: render POPULATED real state only.
 */

import { MemoryRouter, Route, Routes } from "react-router-dom";
import { WorkTaskCreate } from "./WorkTaskCreate";

export default { title: "Page: Work/TaskCreate" };

/** Stub useTeams so the form renders with teams data */
function setupTeamsMock(teams: { id: string; name: string }[] = []): void {
	if (typeof window === "undefined") return;

	const prev = window.fetch;
	window.fetch = async (url: RequestInfo | URL): Promise<Response> => {
		const urlStr = typeof url === "string" ? url : url.toString();
		if (urlStr.includes("/api/teams")) {
			return { ok: true, json: async () => ({ teams }) } as Response;
		}
		return prev ? prev(url) : ({ ok: true, json: async () => ({}) } as Response);
	};
}

function CreateWrapper(props: { url: string }): React.JSX.Element {
	return (
		<MemoryRouter initialEntries={[props.url]}>
			<Routes>
				<Route path="/work/task/new" element={<WorkTaskCreate />} />
				<Route path="/work/task/:taskId" element={<div data-testid="task-page" />} />
				<Route path="/work" element={<div data-testid="work-page" />} />
			</Routes>
		</MemoryRouter>
	);
}

/** Root task creation with a single team (auto-resolves). */
export const RootTask = (): React.JSX.Element => {
	setupTeamsMock([{ id: "team-1", name: "Core Platform" }]);
	return <CreateWrapper url="/work/task/new" />;
};

/** Root task creation with multiple teams (team select shown). */
export const MultipleTeams = (): React.JSX.Element => {
	setupTeamsMock([
		{ id: "team-1", name: "Core Platform" },
		{ id: "team-2", name: "Frontend Surface" },
	]);
	return <CreateWrapper url="/work/task/new" />;
};

/** Subtask creation with a parentTaskId query param. */
export const Subtask = (): React.JSX.Element => {
	setupTeamsMock([{ id: "team-1", name: "Core Platform" }]);
	return <CreateWrapper url="/work/task/new?parentTaskId=parent-task-1" />;
};
