/**
 * ArtifactSection stories — produced-item section for task and thread surfaces.
 *
 * Each story uses a fetch-override wrapper to control the
 * `POST /api/actions/{search,open}_document` responses without vi.mock
 * (unavailable in the browser story renderer).
 *
 * @lore BC4: repointed off `GET /api/knowledge?...` onto `search_documents`/
 * `open_document` via `call()`.
 */

import { useEffect, useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { ArtifactSection } from "./ArtifactSection.js";

export default { title: "ArtifactSection", tier: "component" as const };

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ITEM_1 = {
	id: "ki-story-1",
	title: "Auth service implementation",
	body: "# Auth service\n\nImplemented the core auth flow.",
	format: "markdown",
	status: "active",
	slot: "ordinary",
	scopeKind: "factory",
	scopeId: null,
	parentKind: "task",
	parentId: "task-1",
	position: 0,
	version: 1,
	updatedBy: "agent:session-1",
	createdAt: "2026-09-01T10:00:00.000Z",
	updatedAt: "2026-09-01T10:00:00.000Z",
	readCount: 0,
	lastReadAt: null,
	sessionUseCount: 0,
	lastUsedAt: null,
	as: "artifact",
};

const ITEM_2 = {
	...ITEM_1,
	id: "ki-story-2",
	title: "Pitch deck outline",
	body: "# Pitch deck\n\nExecutive summary: ...",
};

const ITEM_3 = {
	...ITEM_1,
	id: "ki-story-3",
	title: "Service agreement draft",
	body: "# Service Agreement\n\nBetween Acme Corp and HyperIdle...",
};

function documentView(row: typeof ITEM_1): object {
	return { document: row, ancestors: [], children: [], siblings: [], scopeName: "Factory" };
}

// ── Fetch-override wrapper ────────────────────────────────────────────────────

/**
 * Controls the `search_documents`/`open_document` action responses without vi.mock.
 */
function ControlledArtifactSection({
	parentKind,
	parentId,
	heading,
	emptyDescription,
	listResponse,
	detailResponse,
}: {
	parentKind: "task" | "thread";
	parentId: string;
	heading?: string;
	emptyDescription?: string;
	listResponse: (typeof ITEM_1)[];
	detailResponse?: typeof ITEM_1 | null;
}): React.JSX.Element {
	const [, rerender] = useState(0);

	useEffect(() => {
		const real = globalThis.fetch;
		globalThis.fetch = ((url: RequestInfo | URL) => {
			const urlStr = String(url);
			if (urlStr.includes("/api/actions/open_document")) {
				const body = detailResponse
					? { ok: true, data: documentView(detailResponse) }
					: { ok: false, problems: [{ code: "not_found", message: "Not found" }] };
				return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
			}
			if (urlStr.includes("/api/actions/search_documents")) {
				return Promise.resolve(
					new Response(JSON.stringify({ ok: true, data: listResponse }), { status: 200 }),
				);
			}
			return real(url);
		}) as typeof fetch;
		rerender((n) => n + 1);
		return () => {
			globalThis.fetch = real;
		};
	}, [listResponse, detailResponse]);

	return (
		<MemoryRouter>
			<ArtifactSection
				parentKind={parentKind}
				parentId={parentId}
				heading={heading}
				emptyDescription={emptyDescription}
			/>
		</MemoryRouter>
	);
}

// ── Stories ───────────────────────────────────────────────────────────────────

export function Loading(): React.JSX.Element {
	return (
		<MemoryRouter>
			<ArtifactSection parentKind="task" parentId="" heading="Artifacts" />
		</MemoryRouter>
	);
}

export function Empty(): React.JSX.Element {
	return (
		<ControlledArtifactSection
			parentKind="task"
			parentId="task-1"
			heading="Artifacts"
			emptyDescription="Artifacts will appear here once agents produce output for this task."
			listResponse={[]}
		/>
	);
}

export function OneItem(): React.JSX.Element {
	return (
		<ControlledArtifactSection
			parentKind="task"
			parentId="task-1"
			heading="Artifacts"
			listResponse={[ITEM_1]}
			detailResponse={ITEM_1}
		/>
	);
}

export function ThreeItems(): React.JSX.Element {
	return (
		<ControlledArtifactSection
			parentKind="task"
			parentId="task-2"
			heading="Artifacts"
			listResponse={[ITEM_1, ITEM_2, ITEM_3]}
			detailResponse={ITEM_1}
		/>
	);
}

export function ThreadParented(): React.JSX.Element {
	return (
		<ControlledArtifactSection
			parentKind="thread"
			parentId="thr-1"
			heading="Produced in conversation"
			listResponse={[ITEM_2, ITEM_3]}
			detailResponse={ITEM_2}
		/>
	);
}

export function NoHeading(): React.JSX.Element {
	return <ControlledArtifactSection parentKind="task" parentId="task-3" listResponse={[]} />;
}
