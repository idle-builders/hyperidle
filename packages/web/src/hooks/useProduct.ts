/**
 * L13: useProduct — typed fetch hook for GET /api/products/:id.
 *
 * @lore api-contract: Replaced manual fetch() + type cast with hc<ProductsRoutes>.
 * The response type is derived from the server's route definition, not
 * hand-maintained. If the server's response shape changes, this hook fails
 * to compile. See plans/api-contract/concept.md §Dependency flow contract.
 *
 * @lore L13: No caching, no retry, no SWR — when a real data layer
 * (React Query, RSC, etc.) lands track-wide, replace this hook in one edit.
 * The hook is intentionally local to packages/web/src/hooks/ rather than a
 * shared service so the replacement diff is contained.
 */

import type { ProductsRoutes } from "@hyperidle/server/routes/products";
import { hc } from "hono/client";
import { useEffect, useState } from "react";

const client = hc<ProductsRoutes>("/api/products");

// Extract the inferred response type for product detail (200 status).
// Resolves to: { id, name, phase, createdAt, ... } (the full product row shape)
type ProductDetailResponse = Awaited<
	ReturnType<Awaited<ReturnType<(typeof client)[":productId"]["$get"]>>["json"]>
>;

export interface UseProductResult {
	data: ProductDetailResponse | null;
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
		client[":productId"]
			.$get({ param: { productId } })
			.then(async (res) => {
				if (!res.ok) throw new Error(`Product fetch failed: ${res.status}`);
				return res.json();
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
