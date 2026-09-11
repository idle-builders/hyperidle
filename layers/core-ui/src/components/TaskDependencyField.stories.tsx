/**
 * TaskDependencyField stories — search-and-pick, not paste-an-id.
 *
 * Mocks `window.fetch` the same way `RecipientPicker.stories.tsx` does: the
 * component calls `GET /api/tasks?q=` (search) and `GET /api/tasks?ids=`
 * (title lookup for already-listed dependencies) via `apiFetch`.
 */

import type { JSX } from "react";
import { useEffect, useState } from "react";
import { TaskDependencyField } from "./TaskDependencyField.js";

export default {
	title: "TaskDependencyField",
	tier: "component" as const,
};

const SEARCH_RESULTS = [
	{ id: "task-a1b2c3", title: "Ship the search picker" },
	{ id: "task-d4e5f6", title: "Write the release notes" },
	{ id: "task-g7h8i9", title: "Onboarding checklist (nested)" },
];

const EXISTING_TITLES: Record<string, string> = {
	"task-a1b2c3": "Ship the search picker",
	"task-d4e5f6": "Write the release notes",
};

function useMockTaskFetch(): void {
	useEffect(() => {
		const original = window.fetch;
		window.fetch = (async (url: unknown) => {
			const urlStr = typeof url === "string" ? url : String(url);
			if (urlStr.includes("ids=")) {
				const ids = new URL(urlStr, "http://localhost").searchParams.get("ids")?.split(",") ?? [];
				const rows = ids
					.filter((id) => id in EXISTING_TITLES)
					.map((id) => ({ id, title: EXISTING_TITLES[id] }));
				return new Response(JSON.stringify(rows), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			}
			return new Response(JSON.stringify(SEARCH_RESULTS), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}) as typeof window.fetch;
		return () => {
			window.fetch = original;
		};
	}, []);
}

export const Empty = (): JSX.Element => {
	useMockTaskFetch();
	const [dependencies, setDependencies] = useState<readonly string[]>([]);
	return <TaskDependencyField dependencies={dependencies} onChange={setDependencies} />;
};

export const WithDependencies = (): JSX.Element => {
	useMockTaskFetch();
	const [dependencies, setDependencies] = useState<readonly string[]>([
		"task-a1b2c3",
		"task-d4e5f6",
	]);
	return <TaskDependencyField dependencies={dependencies} onChange={setDependencies} />;
};

export const Disabled = (): JSX.Element => {
	useMockTaskFetch();
	return <TaskDependencyField dependencies={["task-a1b2c3"]} onChange={() => undefined} disabled />;
};
