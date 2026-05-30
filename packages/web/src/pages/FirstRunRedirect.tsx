import type { ProductListResponse } from "@hyperidle/shared";
import { type JSX, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { apiFetch } from "../services/api-fetch.js";

/**
 * @lore P4: Updated to check both human user existence (GET /api/auth/me) AND
 * products existence (GET /api/products) in parallel. Redirects to /setup if
 * either check fails. This replaces the P3 single-check logic that only checked
 * products and redirected to /onboarding (which no longer exists).
 *
 * @lore N5: On API failure (network error, auth timing, etc.), default to
 * /setup rather than /conversations. On a fresh install any failure means the
 * user hasn't set up yet — /setup is always safer than a broken conversations
 * view.
 */
export function FirstRunRedirect(): JSX.Element {
	const [target, setTarget] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;

		// P4: Run both checks in parallel (architecture Q3 decision).
		Promise.all([
			apiFetch("/api/auth/me").then((res) => res.ok),
			apiFetch("/api/products")
				.then((res) => {
					if (!res.ok) return false;
					return (res.json() as Promise<ProductListResponse>).then(
						(data) => data.products.length > 0,
					);
				})
				.catch(() => false),
		])
			.then(([hasUser, hasProducts]) => {
				if (cancelled) return;
				// @lore R2: redirect to /work/portfolio (was /conversations)
				setTarget(hasUser && hasProducts ? "/work/portfolio" : "/setup");
			})
			.catch(() => {
				// @lore P4: On any API failure, default to /setup (not /conversations).
				// A fresh install can have network timing issues; /setup is safe to show.
				if (!cancelled) setTarget("/setup");
			});

		return (): void => {
			cancelled = true;
		};
	}, []);

	if (!target) return <div className="flex items-center justify-center h-screen bg-base-100" />;

	return <Navigate to={target} replace />;
}
