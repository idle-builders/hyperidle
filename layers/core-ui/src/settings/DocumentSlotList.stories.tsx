/**
 * Stories for `DocumentSlotList` itself — `SettingsSkillsAndRules.stories.tsx`
 * covers the thin skill/rule instantiation; these exercise the shared
 * component directly, including its own error state and the one-click
 * Delete button on each row (mocks `globalThis.fetch`, `require`s the
 * component fresh per story — same mechanism SettingsHarnesses.stories.tsx
 * uses for its own live-fetching component).
 */

import type React from "react";
import { useMemo } from "react";
import { MemoryRouter } from "react-router-dom";
import { useStoryFetch } from "../__storybook__/use-story-globals.js";
import { DocumentSlotList } from "./DocumentSlotList.js";

interface StoryItem {
	id: string;
	title: string;
	slot: string;
}

const ITEMS_POPULATED: readonly StoryItem[] = [
	{ id: "ki-skill-write-tests", title: "write-tests", slot: "skill" },
	{ id: "ki-rule-no-console", title: "no-console", slot: "rule" },
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

function makeMockFetch(items: readonly StoryItem[], opts?: { listStatus?: number }) {
	return (input: RequestInfo | URL, init?: RequestInit) => {
		const url = typeof input === "string" ? input : input.toString();
		if (url === "/api/actions/search_documents") {
			const status = opts?.listStatus ?? 200;
			if (status !== 200) {
				return Promise.resolve(
					new Response(
						JSON.stringify({ ok: false, problems: [{ code: "boom", message: "boom" }] }),
						{ status: 200, headers: { "Content-Type": "application/json" } },
					),
				);
			}
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
	title: "DocumentSlotList",
	group: "Settings" as const,
};

function SlotListStory({
	items,
	opts,
}: {
	items: readonly StoryItem[];
	opts?: { listStatus?: number };
}): React.JSX.Element {
	useStoryFetch(useMemo(() => makeMockFetch(items, opts) as typeof fetch, [items, opts]));
	return (
		<MemoryRouter>
			<div className="p-[24px] max-w-[680px] bg-[var(--surface-page)]">
				<DocumentSlotList
					slots={["skill", "rule"]}
					description="Skills and rules an agent's session picks up."
					sectionLabel="Registered skills and rules"
					emptyMessage="No skills or rules registered yet."
					createLabel="Create a skill or rule"
				/>
			</div>
		</MemoryRouter>
	);
}

export const Populated = (): React.JSX.Element => <SlotListStory items={ITEMS_POPULATED} />;
Populated.storyName = "Populated";

export const Empty = (): React.JSX.Element => <SlotListStory items={[]} />;
Empty.storyName = "Empty State";

export const ErrorLoading = (): React.JSX.Element => (
	<SlotListStory items={[]} opts={{ listStatus: 500 }} />
);
ErrorLoading.storyName = "Error State";

export const DeleteConfirm = (): React.JSX.Element => <SlotListStory items={ITEMS_POPULATED} />;
DeleteConfirm.storyName = "Delete (click 'Delete' on a row — one click, no confirm)";
