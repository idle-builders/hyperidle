import type { DocumentStatus, TaskState } from "@hyperidle/domain-model";
import { DOCUMENT_STATUSES, TASK_STATES } from "@hyperidle/domain-model";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../services/api-fetch.js";

interface ConversationResult {
	id: string;
	title: string;
	snippet: string;
	timestamp: string;
	kind: "review" | "chat";
}

interface WorkResult {
	id: string;
	title: string;
	team: string;
	state: TaskState;
}

interface DocumentResult {
	id: string;
	title: string;
	status: DocumentStatus;
	timestamp: string;
}

export interface SearchResults {
	conversations: ConversationResult[];
	work: WorkResult[];
	documents: DocumentResult[];
}

const EMPTY_RESULTS: SearchResults = {
	conversations: [],
	work: [],
	documents: [],
};

const DEBOUNCE_MS = 150;

interface UseGlobalSearchReturn {
	query: string;
	setQuery: (q: string) => void;
	results: SearchResults;
	loading: boolean;
	error: string | null;
	hasResults: boolean;
	totalCount: number;
	clear: () => void;
}

const CONVERSATION_KINDS: ReadonlySet<string> = new Set(["review", "chat"]);
const TASK_STATE_SET: ReadonlySet<string> = new Set<string>(TASK_STATES);
const DOCUMENT_STATUS_SET: ReadonlySet<string> = new Set<string>(DOCUMENT_STATUSES);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isConversationKind(v: string): v is ConversationResult["kind"] {
	return CONVERSATION_KINDS.has(v);
}
function isTaskState(v: string): v is TaskState {
	return TASK_STATE_SET.has(v);
}
function isDocumentStatus(v: string): v is DocumentStatus {
	return DOCUMENT_STATUS_SET.has(v);
}

function readStringFields<K extends string>(
	source: Record<string, unknown>,
	keys: readonly K[],
): Record<K, string> | null {
	const out: Partial<Record<K, string>> = {};
	for (const key of keys) {
		const v = source[key];
		if (typeof v !== "string" || v.length === 0) return null;
		out[key] = v;
	}
	return out as Record<K, string>;
}

function parseConversation(value: unknown): ConversationResult | null {
	if (!isRecord(value)) return null;
	const fields = readStringFields(value, ["id", "title", "snippet", "timestamp", "kind"] as const);
	if (!fields) return null;
	if (!isConversationKind(fields.kind)) return null;
	return {
		id: fields.id,
		title: fields.title,
		snippet: fields.snippet,
		timestamp: fields.timestamp,
		kind: fields.kind,
	};
}

function parseWork(value: unknown): WorkResult | null {
	if (!isRecord(value)) return null;
	// API may send `team` or `product`; prefer team, fall back to product
	const fields = readStringFields(value, ["id", "title", "state"] as const);
	if (!fields) return null;
	if (!isTaskState(fields.state)) return null;
	const teamValue =
		(typeof value.team === "string" && value.team.length > 0 ? value.team : null) ??
		(typeof value.product === "string" && value.product.length > 0 ? value.product : null) ??
		"";
	return {
		id: fields.id,
		title: fields.title,
		team: teamValue,
		state: fields.state,
	};
}

function parseDocument(value: unknown): DocumentResult | null {
	if (!isRecord(value)) return null;
	const fields = readStringFields(value, ["id", "title", "status", "timestamp"] as const);
	if (!fields) return null;
	if (!isDocumentStatus(fields.status)) return null;
	return {
		id: fields.id,
		title: fields.title,
		status: fields.status,
		timestamp: fields.timestamp,
	};
}

interface ParsedResponse {
	results: SearchResults;
	allMalformed: boolean;
}

function parseBucket<T>(
	raw: unknown,
	parseOne: (v: unknown) => T | null,
): { parsed: T[]; rawCount: number } {
	if (!Array.isArray(raw)) return { parsed: [], rawCount: 0 };
	const parsed: T[] = [];
	for (const v of raw) {
		const p = parseOne(v);
		if (p !== null) parsed.push(p);
	}
	return { parsed, rawCount: raw.length };
}

function parseSearchResponse(raw: unknown): ParsedResponse {
	if (!isRecord(raw)) return { results: EMPTY_RESULTS, allMalformed: false };
	const c = parseBucket(raw.conversations, parseConversation);
	const w = parseBucket(raw.work, parseWork);
	const k = parseBucket(raw.documents, parseDocument);
	const rawCount = c.rawCount + w.rawCount + k.rawCount;
	const parsedCount = c.parsed.length + w.parsed.length + k.parsed.length;
	const allMalformed = rawCount > 0 && parsedCount === 0;
	return {
		results: { conversations: c.parsed, work: w.parsed, documents: k.parsed },
		allMalformed,
	};
}

interface SearchCallbacks {
	onResults: (results: SearchResults) => void;
	onError: (message: string) => void;
	onDone: () => void;
}

async function runSearch(
	query: string,
	controller: AbortController,
	cb: SearchCallbacks,
): Promise<void> {
	try {
		const res = await apiFetch(`/api/search?q=${encodeURIComponent(query)}`, {
			signal: controller.signal,
		});
		if (!res.ok) {
			throw new Error(`HTTP ${res.status}`);
		}
		const raw: unknown = await res.json();
		if (controller.signal.aborted) return;
		const parsed = parseSearchResponse(raw);
		if (parsed.allMalformed) {
			// non-empty buckets with zero parseable rows = API drift; log and surface error instead of silent "No matches"
			// biome-ignore lint/suspicious/noConsole: observability surface — placeholder for a real logger
			console.error("[useGlobalSearch] server returned all-malformed rows", {
				query,
				rawKeys: Object.keys((raw as Record<string, unknown>) ?? {}),
			});
			cb.onError("Search results could not be parsed");
			cb.onDone();
			return;
		}
		cb.onResults(parsed.results);
		cb.onDone();
	} catch (err: unknown) {
		if (err instanceof DOMException && err.name === "AbortError") return;
		if (controller.signal.aborted) return;
		cb.onError(err instanceof Error ? err.message : "Search failed");
		cb.onDone();
	}
}

export function useGlobalSearch(): UseGlobalSearchReturn {
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const abortControllerRef = useRef<AbortController | null>(null);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (timerRef.current !== null) {
			clearTimeout(timerRef.current);
			timerRef.current = null;
		}

		if (!query) {
			// reset stale results synchronously on clear — avoids orphaned hits; abort in-flight fetch
			if (abortControllerRef.current) {
				abortControllerRef.current.abort();
				abortControllerRef.current = null;
			}
			setResults(EMPTY_RESULTS);
			setError(null);
			setLoading(false);
			return;
		}

		timerRef.current = setTimeout(() => {
			if (abortControllerRef.current) {
				abortControllerRef.current.abort();
			}

			const controller = new AbortController();
			abortControllerRef.current = controller;
			setLoading(true);
			setError(null);

			void runSearch(query, controller, {
				onResults: setResults,
				onError: setError,
				onDone: () => setLoading(false),
			});
		}, DEBOUNCE_MS);

		return () => {
			if (timerRef.current !== null) {
				clearTimeout(timerRef.current);
			}
			if (abortControllerRef.current) {
				abortControllerRef.current.abort();
				abortControllerRef.current = null;
			}
		};
	}, [query]);

	const hasResults =
		results.conversations.length > 0 || results.work.length > 0 || results.documents.length > 0;

	const totalCount = results.conversations.length + results.work.length + results.documents.length;

	const clear = useCallback((): void => {
		// abort in-flight fetch before reset — late-resolving response could repopulate results after clear() (race with effect cleanup)
		if (abortControllerRef.current) {
			abortControllerRef.current.abort();
			abortControllerRef.current = null;
		}
		setQuery("");
		setResults(EMPTY_RESULTS);
		setError(null);
		setLoading(false);
	}, []);

	return { query, setQuery, results, loading, error, hasResults, totalCount, clear };
}
