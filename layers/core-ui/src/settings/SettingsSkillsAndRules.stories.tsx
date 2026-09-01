/**
 * Stories for SettingsSkillsAndRules — the skills-and-rules list.
 *
 * DESIGN-CLASS = routine (extract). Reuses the SettingsFilesystems grammar:
 * a lede paragraph, one uppercase section-label header, one bordered
 * `--surface-elevated` container with hairline row dividers, and a `Tag`
 * per row for the role mark.
 *
 * Mocks `globalThis.fetch` (the layer `apiFetch` calls through to) and
 * `require`s the component fresh per story — same mechanism
 * SettingsHarnesses.stories.tsx uses for its own live-fetching component.
 */

import type React from "react";
import { MemoryRouter } from "react-router-dom";

const ITEMS_POPULATED = [
	{ id: "ki-skill-write-tests", title: "write-tests", role: "skill" },
	{ id: "ki-skill-plan", title: "plan-before-code", role: "skill" },
	{ id: "ki-rule-no-console", title: "no-console", role: "rule" },
	{ id: "ki-rule-tdd", title: "tests-first", role: "rule" },
];

function makeMockFetch(items: ReadonlyArray<{ id: string; title: string; role: string }>) {
	return (input: RequestInfo | URL) => {
		const url = typeof input === "string" ? input : input.toString();
		if (url === "/api/knowledge") {
			return Promise.resolve(
				new Response(JSON.stringify({ items }), {
					status: 200,
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
	title: "SettingsSkillsAndRules",
	group: "Settings" as const,
};

export const Populated = (): React.JSX.Element => {
	globalThis.fetch = makeMockFetch(ITEMS_POPULATED) as typeof fetch;
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const { SettingsSkillsAndRules } = require("./SettingsSkillsAndRules");
	return (
		<MemoryRouter>
			<div className="p-[24px] max-w-[680px] bg-[var(--surface-page)]">
				<SettingsSkillsAndRules />
			</div>
		</MemoryRouter>
	);
};
Populated.storyName = "Populated (2 skills, 2 rules)";

export const Empty = (): React.JSX.Element => {
	globalThis.fetch = makeMockFetch([]) as typeof fetch;
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const { SettingsSkillsAndRules } = require("./SettingsSkillsAndRules");
	return (
		<MemoryRouter>
			<div className="p-[24px] max-w-[680px] bg-[var(--surface-page)]">
				<SettingsSkillsAndRules />
			</div>
		</MemoryRouter>
	);
};
Empty.storyName = "Empty State";
