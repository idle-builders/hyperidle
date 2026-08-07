import type { BetStatus, KnowledgeKind, KnowledgeLayer, KnowledgeStatus } from "@hyperidle/shared";
import { BET_STATUSES, KNOWLEDGE_STATUSES } from "@hyperidle/shared";
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
	/** @lore U5: Renamed from `product` to `team`. */
	team: string;
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

// @lore I4 adversary W1: these sets are typed as Set<string> so .has()
// accepts any string without casts. The type narrowing happens inside the
// parse* functions below once the string is confirmed present in the set.
const CONVERSATION_KINDS: ReadonlySet<string> = new Set(["review", "chat"]);
const KNOWLEDGE_LAYER_SET: ReadonlySet<string> = new Set(["L0", "L1", "L2", "L3", "L4"]);
const KNOWLEDGE_KIND_SET: ReadonlySet<string> = new Set([
	"pattern",
	"anti_pattern",
	"brief",
	"principle",
	"decision",
	"failure",
	"reflection",
	"focus",
]);
const BET_STATUS_SET: ReadonlySet<string> = new Set<string>(BET_STATUSES);
const KNOWLEDGE_STATUS_SET: ReadonlySet<string> = new Set<string>(KNOWLEDGE_STATUSES);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

/**
 * Narrow checks that return boolean type guards — one per domain union —
 * so the parse* functions below can drop `as` casts entirely.
 */
function isConversationKind(v: string): v is ConversationResult["kind"] {
	return CONVERSATION_KINDS.has(v);
}
function isKnowledgeLayer(v: string): v is KnowledgeLayer {
	return KNOWLEDGE_LAYER_SET.has(v);
}
function isKnowledgeKind(v: string): v is KnowledgeKind {
	return KNOWLEDGE_KIND_SET.has(v);
}
function isBetStatus(v: string): v is BetStatus {
	return BET_STATUS_SET.has(v);
}
function isKnowledgeStatus(v: string): v is KnowledgeStatus {
	return KNOWLEDGE_STATUS_SET.has(v);
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
	// @lore U5: API may send `team` (new) or `product` (old/compat). Prefer `team`, fall back to `product`.
	const fields = readStringFields(value, ["id", "title", "status", "appetite"] as const);
	if (!fields) return null;
	if (!isBetStatus(fields.status)) return null;
	const teamValue =
		(typeof value.team === "string" && value.team.length > 0 ? value.team : null) ??
		(typeof value.product === "string" && value.product.length > 0 ? value.product : null) ??
		"";
	return {
		id: fields.id,
		title: fields.title,
		team: teamValue,
		status: fields.status,
		appetite: fields.appetite,
	};
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
	if (!isKnowledgeLayer(fields.layer)) return null;
	if (!isKnowledgeKind(fields.kind)) return null;
	if (!isKnowledgeStatus(fields.status)) return null;
	return {
		id: fields.id,
		title: fields.title,
		layer: fields.layer,
		kind: fields.kind,
		status: fields.status,
		timestamp: fields.timestamp,
	};
}

/**
 * Outcome of parsing a `/api/search` response. The hook uses this to surface
 * a useful signal to the user when the server ships malformed data, instead
 * of silently collapsing to "No matches" (I4 adversary C4).
 */
interface ParsedResponse {
	results: SearchResults;
	/** True when the server returned at least one row in any bucket but every
	 * row was malformed — a signal that the API contract has drifted. */
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

/**
 * Parse and filter a raw `/api/search` response into the typed `SearchResults`
 * shape. Malformed entries are dropped per-row, but if every row in every
 * non-empty bucket is malformed we flag the response as "allMalformed" so
 * the hook can surface an error to the user rather than rendering "No
 * matches". Top-level shape mismatches default to empty arrays.
 */
function parseSearchResponse(raw: unknown): ParsedResponse {
	if (!isRecord(raw)) return { results: EMPTY_RESULTS, allMalformed: false };
	const c = parseBucket(raw.conversations, parseConversation);
	const w = parseBucket(raw.work, parseWork);
	const k = parseBucket(raw.knowledge, parseKnowledge);
	const rawCount = c.rawCount + w.rawCount + k.rawCount;
	const parsedCount = c.parsed.length + w.parsed.length + k.parsed.length;
	const allMalformed = rawCount > 0 && parsedCount === 0;
	return {
		results: { conversations: c.parsed, work: w.parsed, knowledge: k.parsed },
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
			// I4 adversary C4: non-empty buckets with zero parseable rows is a
			// silent-data-loss hazard (API drift → empty UI). Log and surface
			// an error instead of collapsing to "No matches".
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
		// I4 adversary W7: abort any in-flight fetch before resetting state
		// so a late-resolving response cannot repopulate results after
		// clear(). Without this, there is a micro-race between clear() and
		// the effect cleanup that aborts on query change.
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
