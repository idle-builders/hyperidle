import type { BetStatus, KnowledgeKind, KnowledgeLayer, KnowledgeStatus } from "@hyperidle/shared";
import { BET_STATUSES, KNOWLEDGE_STATUSES } from "@hyperidle/shared";
import { useCallback, useEffect, useRef, useState } from "react";

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
	product: string;
	status: BetStatus;
	appetite: string;
}

interface KnowledgeResult {
	id: string;
	title: string;
	layer: KnowledgeLayer;
	kind: KnowledgeKind;
	status: KnowledgeStatus;
	timestamp: string;
}

export interface SearchResults {
	conversations: ConversationResult[];
	work: WorkResult[];
	knowledge: KnowledgeResult[];
}

const EMPTY_RESULTS: SearchResults = {
	conversations: [],
	work: [],
	knowledge: [],
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

const CONVERSATION_KINDS = new Set<ConversationResult["kind"]>(["review", "chat"]);
const KNOWLEDGE_LAYER_SET = new Set<KnowledgeLayer>(["L0", "L1", "L2", "L3", "L4"]);
const KNOWLEDGE_KIND_SET = new Set<KnowledgeKind>([
	"pattern",
	"anti_pattern",
	"brief",
	"principle",
	"decision",
	"failure",
	"reflection",
	"focus",
]);
const BET_STATUS_SET = new Set<string>(BET_STATUSES);
const KNOWLEDGE_STATUS_SET = new Set<string>(KNOWLEDGE_STATUSES);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

/**
 * Read `keys` off `source`, returning an object of string values if every
 * key holds a non-empty string; otherwise `null`. A single allocation per
 * row keeps per-result parsing cheap.
 */
function readStringFields<K extends string>(
	source: Record<string, unknown>,
	keys: readonly K[],
): Record<K, string> | null {
	const out = {} as Record<K, string>;
	for (const key of keys) {
		const v = source[key];
		if (typeof v !== "string" || v.length === 0) return null;
		out[key] = v;
	}
	return out;
}

function parseConversation(value: unknown): ConversationResult | null {
	if (!isRecord(value)) return null;
	const fields = readStringFields(value, ["id", "title", "snippet", "timestamp", "kind"] as const);
	if (!fields) return null;
	if (!CONVERSATION_KINDS.has(fields.kind as ConversationResult["kind"])) return null;
	return { ...fields, kind: fields.kind as ConversationResult["kind"] };
}

function parseWork(value: unknown): WorkResult | null {
	if (!isRecord(value)) return null;
	const fields = readStringFields(value, ["id", "title", "product", "status", "appetite"] as const);
	if (!fields) return null;
	if (!BET_STATUS_SET.has(fields.status)) return null;
	return { ...fields, status: fields.status as BetStatus };
}

function parseKnowledge(value: unknown): KnowledgeResult | null {
	if (!isRecord(value)) return null;
	const fields = readStringFields(value, [
		"id",
		"title",
		"layer",
		"kind",
		"status",
		"timestamp",
	] as const);
	if (!fields) return null;
	if (!KNOWLEDGE_LAYER_SET.has(fields.layer as KnowledgeLayer)) return null;
	if (!KNOWLEDGE_KIND_SET.has(fields.kind as KnowledgeKind)) return null;
	if (!KNOWLEDGE_STATUS_SET.has(fields.status)) return null;
	return {
		...fields,
		layer: fields.layer as KnowledgeLayer,
		kind: fields.kind as KnowledgeKind,
		status: fields.status as KnowledgeStatus,
	};
}

/**
 * Parse and filter a raw `/api/search` response into the typed `SearchResults`
 * shape. Malformed entries are silently dropped — the API layer is trusted to
 * emit correct shapes, and one bad row should not break the whole panel.
 * Top-level shape mismatches default to empty arrays.
 */
function parseSearchResponse(raw: unknown): SearchResults {
	if (!isRecord(raw)) return EMPTY_RESULTS;
	const conversations = Array.isArray(raw.conversations)
		? raw.conversations.map(parseConversation).filter((v): v is ConversationResult => v !== null)
		: [];
	const work = Array.isArray(raw.work)
		? raw.work.map(parseWork).filter((v): v is WorkResult => v !== null)
		: [];
	const knowledge = Array.isArray(raw.knowledge)
		? raw.knowledge.map(parseKnowledge).filter((v): v is KnowledgeResult => v !== null)
		: [];
	return { conversations, work, knowledge };
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
		const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
			signal: controller.signal,
		});
		if (!res.ok) {
			throw new Error(`HTTP ${res.status}`);
		}
		const raw: unknown = await res.json();
		if (controller.signal.aborted) return;
		cb.onResults(parseSearchResponse(raw));
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
			// I4 N2: when the user clears the query (character by character),
			// reset stale results synchronously so the UI does not show
			// orphaned hits. Aborts any in-flight fetch from a previous query.
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
			// Abort any in-flight fetch on cleanup to prevent state leaks
			if (abortControllerRef.current) {
				abortControllerRef.current.abort();
				abortControllerRef.current = null;
			}
		};
	}, [query]);

	const hasResults =
		results.conversations.length > 0 || results.work.length > 0 || results.knowledge.length > 0;

	const totalCount = results.conversations.length + results.work.length + results.knowledge.length;

	const clear = useCallback((): void => {
		setQuery("");
		setResults(EMPTY_RESULTS);
		setError(null);
	}, []);

	return { query, setQuery, results, loading, error, hasResults, totalCount, clear };
}
