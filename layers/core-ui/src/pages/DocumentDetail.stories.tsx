/**
 * DocumentDetail stories — the (mixture / block-body) review surface.
 *
 * @lore BC4: replaces the fixture-driven `KnowledgeDetail` stories. Data now
 * comes from `call("open_document", …)`, so every story mocks `window.fetch`
 * for `/api/actions/*` instead of resolving a fixture id — the same pattern
 * `WorkTaskPage.stories.tsx` uses for `open_task`.
 *
 * AM5: page-fed stories mount through the shared isolation harness
 * (`MockProviders`), exactly like `WorkBetCreate.stories.tsx`. The page reaches
 * for router hooks (useNavigate/useParams/<Link>) and AssistantContext; a bare
 * `<DocumentDetail />` throws ("Error rendering story"). `MockProviders`
 * supplies the router + context. `overrideDocumentId` resolves the mocked
 * `open_document` response (no server in the viewer).
 */

import type { JSX } from "react";
import { MockProviders } from "../__preview__";
import { DocumentDetail } from "./DocumentDetail";

export default { title: "Page: Document/Detail" };

interface StoryDocument {
	id: string;
	title: string;
	body: string;
	status: string;
	scopeKind: string;
	updatedBy: string;
	updatedAt: string;
}

function makeDocumentView(doc: StoryDocument): object {
	return {
		document: {
			id: doc.id,
			title: doc.title,
			body: doc.body,
			format: "markdown",
			status: doc.status,
			slot: "ordinary",
			scopeKind: doc.scopeKind,
			scopeId: null,
			parentKind: null,
			parentId: null,
			position: 0,
			version: 1,
			updatedBy: doc.updatedBy,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: doc.updatedAt,
			readCount: 4,
			lastReadAt: "2026-01-05T00:00:00.000Z",
			sessionUseCount: 2,
			lastUsedAt: "2026-01-04T00:00:00.000Z",
			as: "document",
		},
		ancestors: [],
		children: [],
		siblings: [],
		scopeName:
			doc.scopeKind === "factory" ? "Shared" : doc.scopeKind === "team" ? "Team" : "Private",
	};
}

function setupFetchMock(documentView: object | null): void {
	if (typeof window === "undefined") return;

	window.fetch = async (url: RequestInfo | URL): Promise<Response> => {
		const urlStr = typeof url === "string" ? url : url.toString();

		if (urlStr.includes("/api/actions/open_document")) {
			if (documentView === null) {
				return {
					ok: true,
					json: async () => ({
						ok: false,
						problems: [{ code: "not_found", message: "Not found" }],
					}),
				} as Response;
			}
			return { ok: true, json: async () => ({ ok: true, data: documentView }) } as Response;
		}

		if (urlStr.includes("/api/actions/edit_document")) {
			return { ok: true, json: async () => ({ ok: true, data: documentView }) } as Response;
		}

		if (urlStr.includes("/api/actions/search_threads")) {
			return { ok: true, json: async () => ({ ok: true, data: [] }) } as Response;
		}

		if (urlStr.includes("/api/teams")) {
			return { ok: true, json: async () => ({ teams: [] }) } as Response;
		}

		if (urlStr.includes("/api/auth/me")) {
			return {
				ok: true,
				json: async () => ({ id: "user-1", name: "Founder", email: "f@x.com", avatarUrl: null }),
			} as Response;
		}

		return { ok: true, json: async () => ({}) } as Response;
	};
}

export const KnownItem = (): JSX.Element => {
	setupFetchMock(
		makeDocumentView({
			id: "doc-1",
			title: "Architecture Decision: Auth Strategy",
			body: "JWT-based authentication with refresh tokens. Access tokens expire in 15 minutes.",
			status: "active",
			scopeKind: "team",
			updatedBy: "user-1",
			updatedAt: "2026-01-05T00:00:00.000Z",
		}),
	);
	return (
		<MockProviders route="/documents/doc-1">
			<DocumentDetail overrideDocumentId="doc-1" />
		</MockProviders>
	);
};

export const FactoryScopeNoEdit = (): JSX.Element => {
	setupFetchMock(
		makeDocumentView({
			id: "doc-factory",
			title: "Agent Autonomy Policy",
			body: "A factory-authored policy document.",
			status: "active",
			scopeKind: "factory",
			updatedBy: "some-agent",
			updatedAt: "2026-01-05T00:00:00.000Z",
		}),
	);
	return (
		<MockProviders route="/documents/doc-factory">
			<DocumentDetail overrideDocumentId="doc-factory" />
		</MockProviders>
	);
};

export const ArchivedItem = (): JSX.Element => {
	setupFetchMock(
		makeDocumentView({
			id: "doc-archived",
			title: "Archived Decision",
			body: "This document was archived.",
			status: "archived",
			scopeKind: "team",
			updatedBy: "user-1",
			updatedAt: "2026-01-05T00:00:00.000Z",
		}),
	);
	return (
		<MockProviders route="/documents/doc-archived">
			<DocumentDetail overrideDocumentId="doc-archived" />
		</MockProviders>
	);
};

export const UnknownItem = (): JSX.Element => {
	setupFetchMock(null);
	return (
		<MockProviders route="/documents/unknown">
			<DocumentDetail overrideDocumentId="unknown" />
		</MockProviders>
	);
};
