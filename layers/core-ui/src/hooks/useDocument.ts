import type { DocumentView } from "@hyperidle/domain-model";
import { useCallback, useEffect, useRef, useState } from "react";
import { call } from "../services/call.js";
import { getWsClient } from "../services/ws-client.js";

export type UseDocumentStatus = "idle" | "loading" | "ready" | "error" | "not-found";

export interface UseDocumentResult {
	status: UseDocumentStatus;
	data: DocumentView | null;
	error: string | null;
	refresh: () => void;
}

export function useDocument(documentId: string | undefined | null): UseDocumentResult {
	const [status, setStatus] = useState<UseDocumentStatus>(documentId ? "loading" : "idle");
	const [data, setData] = useState<DocumentView | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [tick, setTick] = useState(0);
	const cancelledRef = useRef(false);

	// biome-ignore lint/correctness/useExhaustiveDependencies: `tick` is intentionally a dependency — bumping it via refresh() re-runs the call.
	useEffect(() => {
		if (!documentId) {
			setStatus("idle");
			setError(null);
			setData(null);
			return;
		}
		let cancelled = false;
		setStatus("loading");
		setError(null);

		call("open_document", { id: documentId })
			.then((result) => {
				if (cancelled) return;
				if (!result.ok) {
					const notFound = result.problems.some((p) => p.code === "not_found");
					setData(null);
					setStatus(notFound ? "not-found" : "error");
					setError(notFound ? null : (result.problems[0]?.message ?? "Failed to load document"));
					return;
				}
				setData(result.data);
				setStatus("ready");
			})
			.catch((cause: unknown) => {
				if (cancelled) return;
				setData(null);
				setStatus("error");
				setError(cause instanceof Error ? cause.message : "Network error");
			});

		return () => {
			cancelled = true;
		};
	}, [documentId, tick]);

	const refresh = useCallback((): void => {
		setTick((n) => n + 1);
	}, []);

	// Nudge: re-run open_document on any frame for this document's topic
	useEffect(() => {
		if (!documentId) return;
		cancelledRef.current = false;
		const ws = getWsClient();
		const topic = `document:${documentId}`;
		const unsubscribe = ws.subscribe(topic, (raw) => {
			if (typeof raw !== "object" || raw === null) return;
			const msg = raw as Record<string, unknown>;
			if (msg.type !== "update" || msg.topic !== topic) return;
			if (!cancelledRef.current) setTick((n) => n + 1);
		});
		return (): void => {
			cancelledRef.current = true;
			unsubscribe();
		};
	}, [documentId]);

	return { status, data, error, refresh };
}
