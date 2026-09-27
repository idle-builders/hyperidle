/**
 * useDocuments. Replaces `useParentedKnowledgeItems` and every hand-rolled
 * `useFetch("/api/knowledge")` list read. One door: `call("search_documents",
 * filter)`, kept live by the global `documents` websocket nudge.
 *
 * The filter is a stable value the caller controls — pass a `useMemo`'d
 * object (or a primitive-only shape) so the effect doesn't refire every
 * render. `useThreads.ts` shape verbatim.
 */

import type { DocumentRow, SearchDocumentsInput } from "@hyperidle/domain-model";
import { useCallback, useEffect, useRef, useState } from "react";
import { call } from "../services/call.js";
import { getWsClient } from "../services/ws-client.js";

export type UseDocumentsStatus = "loading" | "ready" | "error";

export interface UseDocumentsResult {
	status: UseDocumentsStatus;
	documents: ReadonlyArray<DocumentRow>;
	error: string | null;
	retry: () => void;
}

/** `undefined` skips the call entirely — e.g. no filter resolved yet. */
export function useDocuments(filter: SearchDocumentsInput | undefined): UseDocumentsResult {
	const [status, setStatus] = useState<UseDocumentsStatus>(filter ? "loading" : "ready");
	const [documents, setDocuments] = useState<ReadonlyArray<DocumentRow>>([]);
	const [error, setError] = useState<string | null>(null);
	const [tick, setTick] = useState(0);
	const filterKey = filter ? JSON.stringify(filter) : null;
	const filterRef = useRef(filter);
	filterRef.current = filter;

	// biome-ignore lint/correctness/useExhaustiveDependencies: `filterKey` stands in for `filter` (referential stability); `tick` drives retry(). filterRef holds the latest filter for the call.
	useEffect(() => {
		const current = filterRef.current;
		if (!current) {
			setDocuments([]);
			setStatus("ready");
			setError(null);
			return;
		}
		let cancelled = false;
		setStatus("loading");
		setError(null);

		call("search_documents", current)
			.then((result) => {
				if (cancelled) return;
				if (!result.ok) {
					setDocuments([]);
					setStatus("error");
					setError(result.problems[0]?.message ?? "Failed to load documents");
					return;
				}
				setDocuments(result.data);
				setStatus("ready");
			})
			.catch((cause: unknown) => {
				if (cancelled) return;
				setDocuments([]);
				setStatus("error");
				setError(cause instanceof Error ? cause.message : "Network error");
			});

		return () => {
			cancelled = true;
		};
	}, [filterKey, tick]);

	const retry = useCallback((): void => {
		setTick((n) => n + 1);
	}, []);

	// Nudge subscription — the global `documents` topic. Any frame means
	// "some document this viewer might see changed"; re-run search_documents
	// rather than reconciling the row locally.
	const cancelledRef = useRef(false);
	useEffect(() => {
		if (filterKey === null) return;
		cancelledRef.current = false;
		const ws = getWsClient();
		const unsubscribe = ws.subscribe("documents", (raw) => {
			if (typeof raw !== "object" || raw === null) return;
			const msg = raw as Record<string, unknown>;
			if (msg.type !== "update" || msg.topic !== "documents") return;
			if (!cancelledRef.current) setTick((n) => n + 1);
		});
		return (): void => {
			cancelledRef.current = true;
			unsubscribe();
		};
	}, [filterKey]);

	return { status, documents, error, retry };
}
