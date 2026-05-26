import type { ProductListResponse } from "@hyperidle/shared";
import { type JSX, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { apiFetch } from "../services/api-fetch.js";

export function FirstRunRedirect(): JSX.Element {
	const [target, setTarget] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		apiFetch("/api/products")
			.then((res) => {
				if (!res.ok) throw new Error("fetch failed");
				return res.json() as Promise<ProductListResponse>;
			})
			.then((data) => {
				if (cancelled) return;
				setTarget(data.products.length > 0 ? "/conversations" : "/onboarding");
			})
			.catch(() => {
				// @lore N5: On API failure (network error, auth timing, etc.), default
				// to /onboarding rather than /conversations. On a fresh install any
				// failure means the user hasn't set up yet — onboarding is always safer
				// than a broken conversations view.
				if (!cancelled) setTarget("/onboarding");
			});
		return (): void => {
			cancelled = true;
		};
	}, []);

	if (!target) return <div className="flex items-center justify-center h-screen bg-base-100" />;

	return <Navigate to={target} replace />;
}
