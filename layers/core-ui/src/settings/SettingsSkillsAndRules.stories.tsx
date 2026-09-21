/**
 * Stories for SettingsSkillsAndRules — a thin instantiation of the shared
 * `DocumentSlotList` (slot in {skill, rule}). Rows render on the ItemList/Row
 * design-system primitives; the bordered `--surface-elevated` container with
 * hairline row dividers, no shadow, is `ItemList`'s own `variant="boxed"`
 * (the same variant SettingsHarnesses renders through — one spelling, not a
 * per-caller claim of parity), and each row carries a `Tag` for the slot mark.
 *
 * Mocks `globalThis.fetch` (the layer `apiFetch` calls through to, under
 * `call("search_documents", …)`) and `require`s the component fresh per
 * story — same mechanism SettingsHarnesses.stories.tsx uses for its own
 * live-fetching component.
 */

import type React from "react";
import { MemoryRouter } from "react-router-dom";

interface StoryItem {
	id: string;
	title: string;
	slot: string;
}

const ITEMS_POPULATED: readonly StoryItem[] = [
	{ id: "ki-skill-write-tests", title: "write-tests", slot: "skill" },
	{ id: "ki-skill-plan", title: "plan-before-code", slot: "skill" },
	{ id: "ki-rule-no-console", title: "no-console", slot: "rule" },
	{ id: "ki-rule-tdd", title: "tests-first", slot: "rule" },
];

function documentRow(item: StoryItem): object {
	return {
		id: item.id,
		title: item.title,
		body: "",
		format: "markdown",
		status: "active",
		slot: item.slot,
		scopeKind: "factory",
		scopeId: null,
		parentKind: null,
		parentId: null,
		position: 0,
		version: 1,
		updatedBy: "human",
		createdAt: "2026-09-01T00:00:00.000Z",
		updatedAt: "2026-09-01T00:00:00.000Z",
		readCount: 0,
		lastReadAt: null,
		sessionUseCount: 0,
		lastUsedAt: null,
		as: "document",
	};
}

function makeMockFetch(items: readonly StoryItem[]) {
	return (input: RequestInfo | URL, init?: RequestInit) => {
		const url = typeof input === "string" ? input : input.toString();
		if (url === "/api/actions/search_documents") {
			const body = init?.body ? (JSON.parse(String(init.body)) as { slot?: string }) : {};
			const matching = items.filter((item) => item.slot === body.slot);
			return Promise.resolve(
				new Response(JSON.stringify({ ok: true, data: matching.map(documentRow) }), {
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
