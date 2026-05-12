/**
 * L13: useProduct — thin one-shot fetch hook for GET /api/products/:id.
 *
 * Mirrors useBet line-for-line (same pattern, same lore).
 *
 * @lore L13: No caching, no retry, no SWR — when a real data layer
 * (React Query, RSC, etc.) lands track-wide, replace this hook in one edit.
 * The hook is intentionally local to packages/web/src/hooks/ rather than a
 * shared service so the replacement diff is contained.
 */

import type { ProductDetail } from "@hyperidle/shared";
import { useEffect, useState } from "react";
import { apiFetch } from "../services/api-fetch.js";

export interface UseProductResult {
	data: ProductDetail | null;
	loading: boolean;
	error: Error | null;
}

export function useProduct(productId: string | undefined): UseProductResult {
	const [state, setState] = useState<UseProductResult>({
		data: null,
		loading: productId !== undefined,
		error: null,
	});

	useEffect(() => {
		if (!productId) {
			setState({ data: null, loading: false, error: null });
			return;
		}
		let cancelled = false;
		setState({ data: null, loading: true, error: null });
		apiFetch(`/api/products/${encodeURIComponent(productId)}`)
			.then((res) => {
				if (!res.ok) throw new Error(`Product fetch failed: ${res.status}`);
				return res.json() as Promise<ProductDetail>;
			})
			.then((data) => {
				if (!cancelled) setState({ data, loading: false, error: null });
			})
			.catch((err: unknown) => {
				if (!cancelled) {
					setState({
						data: null,
						loading: false,
						error: err instanceof Error ? err : new Error(String(err)),
					});
				}
			});
		return (): void => {
			cancelled = true;
		};
	}, [productId]);

	return state;
}
