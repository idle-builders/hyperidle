/**
 * Shared fixtures and a `call()` router for the `DocumentDetail` test suite
 * (`DocumentDetail.*.test.tsx`). Every test mocks `../../services/call.js`
 * with `vi.fn()` and wires it through `makeCallRouter` — never a fixture
 * lookup, never `/api/knowledge*`.
 */
import type { DocumentRow, DocumentView, ThreadListRow, ThreadView } from "@hyperidle/domain-model";

export function makeDocumentRow(
	overrides: Partial<DocumentRow> & Pick<DocumentRow, "id" | "title">,
): DocumentRow {
	return {
		body: "",
		format: "markdown",
		status: "active",
		slot: "ordinary",
		scopeKind: "team",
		scopeId: "team-1",
		parentKind: null,
		parentId: null,
		position: 0,
		version: 1,
		updatedBy: "u-founder",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-02T00:00:00.000Z",
		readCount: 0,
		lastReadAt: null,
		sessionUseCount: 0,
		lastUsedAt: null,
		as: "document",
		...overrides,
	};
}

export function makeDocumentView(
	document: DocumentRow,
	overrides: Partial<Omit<DocumentView, "document">> = {},
): DocumentView {
	return {
		document,
		ancestors: [],
		children: [],
		siblings: [],
		scopeName: "Team",
		...overrides,
	};
}

export function makeThreadRow(overrides: Partial<ThreadListRow> = {}): ThreadListRow {
	return {
		id: "t-doc-thread",
		hostKind: "document",
		hostId: "doc-1",
		initiatorId: "u-founder",
		members: ["u-founder"],
		title: null,
		computedTitle: "Discussion",
		pinned: false,
		resolvedAt: null,
		deletedAt: null,
		lastActiveAt: "2026-01-02T10:00:00.000Z",
		createdAt: "2026-01-02T09:00:00.000Z",
		hasUnresolvedReview: false,
		lastMessagePreview: null,
		...overrides,
	};
}

export function makeThreadView(overrides: Partial<ThreadView> = {}): ThreadView {
	return {
		thread: {
			id: "t-doc-thread",
			hostKind: "document",
			hostId: "doc-1",
			initiatorId: "u-founder",
			members: ["u-founder"],
			title: null,
			computedTitle: "Discussion",
			pinned: false,
			resolvedAt: null,
			deletedAt: null,
			lastActiveAt: "2026-01-02T10:00:00.000Z",
			createdAt: "2026-01-02T09:00:00.000Z",
		},
		members: [{ id: "u-founder", name: "Founder", role: "founder", isAgent: false }],
		messages: [],
		headMessageId: null,
		hostTitle: null,
		...overrides,
	};
}

/**
 * A `call()` mock body — never resolves `search_threads`/`open_thread` by
 * default (no discussion). Always returns a real Promise: the real hooks
 * this exercises (`useThreads`, `useThread`, …) call `call(...).then(...)`
 * directly, not only `await call(...)`.
 */
export function makeCallRouter(
	handlers: Record<string, (input: unknown) => unknown>,
): (name: string, input: unknown) => Promise<unknown> {
	return (name: string, input: unknown) => {
		const handler = handlers[name];
		if (handler) return Promise.resolve(handler(input));
		if (name === "search_threads") return Promise.resolve({ ok: true, data: [] });
		return Promise.reject(new Error(`unmocked call: ${name}`));
	};
}
