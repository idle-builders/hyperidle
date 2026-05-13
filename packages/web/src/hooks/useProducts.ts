/**
 * L13: useProducts — thin one-shot fetch hook for GET /api/products.
 *
 * Replaces the runtime fixture import in WorkPortfolio.tsx.
 *
 * @lore L13: No caching, no retry — same pattern as useBet and useProduct.
 * @lore M3 review C1: fixtures/portfolio-data.ts deleted. The products fixture
 * no longer exists; tests mock this hook directly.
 */

import type { ProductListResponse } from "@hyperidle/shared";
import { useEffect, useState } from "react";
import { apiFetch } from "../services/api-fetch.js";

export interface UseProductsResult {
	data: ProductListResponse | null;
	loading: boolean;
	error: Error | null;
}

export function useProducts(): UseProductsResult {
	const [state, setState] = useState<UseProductsResult>({
		data: null,
		loading: true,
		error: null,
	});

	useEffect(() => {
		let cancelled = false;
		setState({ data: null, loading: true, error: null });
		apiFetch("/api/products")
			.then((res) => {
				if (!res.ok) throw new Error(`Products fetch failed: ${res.status}`);
				return res.json() as Promise<ProductListResponse>;
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
	}, []);

	return state;
}
