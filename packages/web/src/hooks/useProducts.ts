/**
 * L13: useProducts — typed fetch hook for GET /api/products.
 *
 * @lore api-contract: Replaced manual fetch() + type cast with hc<ProductsRoutes>.
 * The response type is derived from the server's route definition, not
 * hand-maintained. If the server's response shape changes, this hook fails
 * to compile. See plans/api-contract/concept.md §Dependency flow contract.
 *
 * @lore L13: No caching, no retry — same pattern as useBet and useProduct.
 * The fixture MOCK_PRODUCTS in fixtures/portfolio-data.ts survives for
 * stories and tests only; its lore comment is updated to "test/story-only".
 */

import type { ProductsRoutes } from "@hyperidle/server/routes/products";
import { hc } from "hono/client";
import { useEffect, useState } from "react";

const client = hc<ProductsRoutes>("/api/products");

// Extract the inferred response type from the typed client.
// Resolves to: { products: Array<{ id, name, phase, ... }> }
// NonNullable<typeof client.index> because hc<T> marks path keys as optional in the type
// (Proxy-based at runtime, always defined). See @lore in api-contract.test.ts.
type ProductsResponse = Awaited<
	ReturnType<Awaited<ReturnType<NonNullable<typeof client.index>["$get"]>>["json"]>
>;

export interface UseProductsResult {
	data: ProductsResponse | null;
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
		// biome-ignore lint/style/noNonNullAssertion: root path always present on ProductsRoutes client
		client
			.index!.$get()
			.then((res) => {
				if (!res.ok) throw new Error(`Products fetch failed: ${res.status}`);
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
	}, []);

	return state;
}
