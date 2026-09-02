/**
 * Stories for `KnowledgeRoleList` itself — `SettingsSkillsAndRules.stories.tsx`
 * covers the thin skill/rule instantiation; these exercise the shared
 * component directly, including its own error state and the RowDeleteAction
 * delete-confirm interaction (mocks `globalThis.fetch`, `require`s the
 * component fresh per story — same mechanism SettingsHarnesses.stories.tsx
 * uses for its own live-fetching component).
 */

import type React from "react";
import { MemoryRouter } from "react-router-dom";

const ITEMS_POPULATED = [
	{ id: "ki-skill-write-tests", title: "write-tests", role: "skill" },
	{ id: "ki-rule-no-console", title: "no-console", role: "rule" },
];

function makeMockFetch(
	items: ReadonlyArray<{ id: string; title: string; role: string }>,
	opts?: { listStatus?: number },
) {
	return (input: RequestInfo | URL) => {
		const url = typeof input === "string" ? input : input.toString();
		if (url === "/api/knowledge") {
			const status = opts?.listStatus ?? 200;
			return Promise.resolve(
				new Response(JSON.stringify(status === 200 ? { items } : { error: "boom" }), {
					status,
					headers: { "Content-Type": "application/json" },
				}),
			);
		}
		return Promise.resolve(
			new Response(JSON.stringify({}), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);
	};
}

export default {
	title: "KnowledgeRoleList",
	group: "Settings" as const,
};

function render(
	items: ReadonlyArray<{ id: string; title: string; role: string }>,
	opts?: { listStatus?: number },
) {
	globalThis.fetch = makeMockFetch(items, opts) as typeof fetch;
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const { KnowledgeRoleList } = require("./KnowledgeRoleList");
	return (
		<MemoryRouter>
			<div className="p-[24px] max-w-[680px] bg-[var(--surface-page)]">
				<KnowledgeRoleList
					roles={["skill", "rule"]}
					description="Skills and rules an agent's session picks up."
					sectionLabel="Registered skills and rules"
					emptyMessage="No skills or rules registered yet."
					createLabel="Create a skill or rule"
				/>
			</div>
		</MemoryRouter>
	);
}

export const Populated = (): React.JSX.Element => render(ITEMS_POPULATED);
Populated.storyName = "Populated";

export const Empty = (): React.JSX.Element => render([]);
Empty.storyName = "Empty State";

export const ErrorLoading = (): React.JSX.Element => render([], { listStatus: 500 });
ErrorLoading.storyName = "Error State";

export const DeleteConfirm = (): React.JSX.Element => render(ITEMS_POPULATED);
DeleteConfirm.storyName = "Delete confirm (click '…' on a row, then Delete)";
