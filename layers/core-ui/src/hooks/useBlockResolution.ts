/**
 * T4 — useBlockResolution hook.
 *
 * Resolves a block reference by fetching the host body and finding the block
 * by id. Uses a module-level cache keyed by (hostKind, hostId) to deduplicate
 * fetches when multiple block refs share the same host.
 *
 * @lore T4: Resolution is client-side at render time (per architecture §9).
 * No server-side pre-resolution endpoint. The cache is module-level and lives
 * for the page session — bodies are stable during a CoC conversation read.
 *
 * @lore T4: The cache stores resolved bodies (strings), not derived blocks.
 * deriveBlocks is called per-render from the cached body. This is acceptable
 * because deriveBlocks is pure and fast (<1ms for typical bodies).
 */

import { deriveBlocks } from "@hyperidle/block-derivation";
import type { BlockHostKind, BlockPayload } from "@hyperidle/domain-model";
import { useEffect, useState } from "react";
import { apiFetch } from "../services/api-fetch.js";

export interface BlockResolutionResult {
	status: "loading" | "resolved" | "degraded" | "error";
	payload?: BlockPayload;
	hostLabel?: string;
	error?: string;
	retry?: () => void;
}

/**
 * Module-level body cache: keyed by "${hostKind}:${hostId}" → body string.
 * Shared across all hook instances for the same host.
 *
 * @lore T4: Using a module-level Map rather than React context avoids threading
 * a cache provider through the component tree. The cache is never invalidated
 * (TTL=page-session) — consistent with L23 read-time derivation contract.
 */
const bodyCache = new Map<string, Promise<string | null>>();

function cacheKey(hostKind: BlockHostKind, hostId: string): string {
	return `${hostKind}:${hostId}`;
}

function fetchHostBody(hostKind: BlockHostKind, hostId: string): Promise<string | null> {
	const key = cacheKey(hostKind, hostId);
	const cached = bodyCache.get(key);
	if (cached !== undefined) return cached;

	const promise = (async (): Promise<string | null> => {
		let url: string;
		let bodyField: string;

		if (hostKind === "bet") {
			url = `/api/bets/${encodeURIComponent(hostId)}`;
			bodyField = "pitch";
		} else if (hostKind === "knowledge_item") {
			url = `/api/knowledge/${encodeURIComponent(hostId)}`;
			bodyField = "body";
		} else {
			// Unsupported host kind
			return null;
		}

		const res = await apiFetch(url);
		if (!res.ok) return null;
		const data = (await res.json()) as Record<string, unknown>;
		const body = data[bodyField];
		return typeof body === "string" ? body : null;
	})();

	bodyCache.set(key, promise);
	return promise;
}

/**
 * Evict a cache entry — used internally to force retry on error.
 */
function evictCache(hostKind: BlockHostKind, hostId: string): void {
	bodyCache.delete(cacheKey(hostKind, hostId));
}

function hostKindLabel(hostKind: BlockHostKind): string {
	switch (hostKind) {
		case "bet":
			return "bet pitch";
		case "knowledge_item":
			return "knowledge item";
		case "task":
			return "task";
		case "artifact":
			return "artifact";
		case "agent":
			return "agent";
		case "user":
			return "user";
	}
}

/**
 * Resolves a block reference and returns its payload.
 *
 * @param hostKind - The host primitive kind (bet, knowledge_item, etc.)
 * @param hostId - The host entity id
 * @param blockId - The specific block id to find
 */
export function useBlockResolution(
	hostKind: BlockHostKind,
	hostId: string,
	blockId: string,
): BlockResolutionResult {
	const [result, setResult] = useState<BlockResolutionResult>({ status: "loading" });
	const [retryCount, setRetryCount] = useState(0);

	// biome-ignore lint/correctness/useExhaustiveDependencies: retryCount is intentionally included to trigger re-fetch on retry
	useEffect(() => {
		let cancelled = false;

		const run = async (): Promise<void> => {
			setResult({ status: "loading" });
			try {
				const body = await fetchHostBody(hostKind, hostId);
				if (cancelled) return;

				if (body === null) {
					if (hostKind !== "bet" && hostKind !== "knowledge_item") {
						// Unsupported host kind
						setResult({
							status: "degraded",
							hostLabel: hostKindLabel(hostKind),
						});
					} else {
						setResult({
							status: "error",
							error: "Could not load referenced content",
							retry: () => {
								evictCache(hostKind, hostId);
								setRetryCount((c) => c + 1);
							},
						});
					}
					return;
				}

				const { blocks } = deriveBlocks(body, {
					kind: hostKind as "bet" | "knowledge_item",
					id: hostId,
				});
				if (cancelled) return;

				const block = blocks.find((b) => b.id === blockId);
				if (!block) {
					setResult({
						status: "degraded",
						hostLabel: hostKindLabel(hostKind),
					});
					return;
				}

				setResult({
					status: "resolved",
					payload: block.payload,
					hostLabel: hostKindLabel(hostKind),
				});
			} catch (err) {
				if (cancelled) return;
				evictCache(hostKind, hostId);
				setResult({
					status: "error",
					error: err instanceof Error ? err.message : "Could not load referenced content",
					retry: () => {
						evictCache(hostKind, hostId);
						setRetryCount((c) => c + 1);
					},
				});
			}
		};

		void run();

		return () => {
			cancelled = true;
		};
	}, [hostKind, hostId, blockId, retryCount]);

	return result;
}
