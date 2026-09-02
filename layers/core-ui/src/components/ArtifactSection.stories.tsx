/**
 * ArtifactSection stories — produced-item section for task and thread surfaces.
 *
 * Shows knowledge items parented to a task or thread. Each story uses a
 * fetch-override wrapper to control the GET /api/knowledge? response without
 * vi.mock (unavailable in the browser story renderer).
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
	status: "captured",
	version: 1,
	updatedBy: "agent:session-1",
	scopeKind: "factory",
	scopeId: null,
	topic: null,
	createdAt: "2026-09-01T10:00:00.000Z",
	updatedAt: "2026-09-01T10:00:00.000Z",
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

// ── Fetch-override wrapper ────────────────────────────────────────────────────

/**
 * Controls the GET /api/knowledge? response without vi.mock.
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
	listResponse: { items: (typeof ITEM_1)[] };
	detailResponse?: typeof ITEM_1 | null;
}): React.JSX.Element {
	const [, rerender] = useState(0);

	useEffect(() => {
		const real = globalThis.fetch;
		globalThis.fetch = ((url: RequestInfo | URL) => {
			const urlStr = String(url);
			if (urlStr.includes("/api/knowledge/")) {
				// detail endpoint
				const body = detailResponse ? JSON.stringify(detailResponse) : "{}";
				return Promise.resolve(new Response(body, { status: 200 }));
			}
			if (urlStr.includes("/api/knowledge")) {
				return Promise.resolve(new Response(JSON.stringify(listResponse), { status: 200 }));
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
			listResponse={{ items: [] }}
		/>
	);
}

export function OneItem(): React.JSX.Element {
	return (
		<ControlledArtifactSection
			parentKind="task"
			parentId="task-1"
			heading="Artifacts"
			listResponse={{ items: [ITEM_1] }}
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
			listResponse={{ items: [ITEM_1, ITEM_2, ITEM_3] }}
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
			listResponse={{ items: [ITEM_2, ITEM_3] }}
			detailResponse={ITEM_2}
		/>
	);
}

export function NoHeading(): React.JSX.Element {
	return (
		<ControlledArtifactSection parentKind="task" parentId="task-3" listResponse={{ items: [] }} />
	);
}
