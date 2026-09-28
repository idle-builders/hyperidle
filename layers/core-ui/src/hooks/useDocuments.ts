// @lore: filter must be stable (useMemo'd object or primitive-only shape) — unstable identity reruns the effect every render

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

	// Nudge: any frame on global documents topic re-runs search_documents rather than reconciling the row locally
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
