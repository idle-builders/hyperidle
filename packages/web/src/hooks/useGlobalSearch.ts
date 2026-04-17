import type { BetStatus, KnowledgeKind, KnowledgeLayer, KnowledgeStatus } from "@hyperidle/shared";
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

/**
 * @lore The fetch chain uses .then()/.catch() instead of async/await because
 * async/await creates extra microtask ticks. With fake timers in tests,
 * waitFor cannot retry (its internal setTimeout never fires), so all state
 * updates must resolve within a single act() boundary's microtask flush.
 * Fewer .then() hops = fewer microtask ticks = resolves faster in act().
 */
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

			fetch(`/api/search?q=${encodeURIComponent(query)}`, {
				signal: controller.signal,
			})
				.then((res) => {
					if (!res.ok) {
						throw new Error(`HTTP ${res.status}`);
					}
					return res.json();
				})
				.then((data: unknown) => {
					if (!controller.signal.aborted) {
						const validated = data as Record<string, unknown>;
						const validatedResults: SearchResults = {
							conversations: Array.isArray(validated.conversations) ? validated.conversations : [],
							work: Array.isArray(validated.work) ? validated.work : [],
							knowledge: Array.isArray(validated.knowledge) ? validated.knowledge : [],
						};
						setResults(validatedResults);
						setLoading(false);
					}
				})
				.catch((err: unknown) => {
					if (err instanceof DOMException && err.name === "AbortError") {
						return;
					}
					if (!controller.signal.aborted) {
						const message = err instanceof Error ? err.message : "Search failed";
						setError(message);
						setLoading(false);
					}
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
