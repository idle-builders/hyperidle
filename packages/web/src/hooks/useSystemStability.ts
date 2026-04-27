/**
 * L8 — Polls `GET /api/system/stability` for the Rail's system-stability strip.
 *
 * Spec constraint: "Do NOT poll faster than every 30s." We use a 30s
 * `setInterval` plus an immediate first fetch so the Rail can render
 * the strip on first paint without waiting a full window.
 *
 * Returns zeros while loading or on error so the Rail's
 * "hide when all zero" rule reads the same shape regardless of the
 * fetch state.
 */
import { useEffect, useState } from "react";

export interface SystemStability {
	crashed_sessions: number;
	cap_reached: number;
	api_degraded: number;
}

export interface UseSystemStabilityResult {
	stability: SystemStability;
	loading: boolean;
	error: Error | null;
}

const ZERO: SystemStability = {
	crashed_sessions: 0,
	cap_reached: 0,
	api_degraded: 0,
};

// @lore L8: spec mandates "Do NOT poll faster than every 30s". 30_000ms is the
// floor — do not lower it without spec change. The interval is per-mount;
// AppShell mounts the Rail once so this is also per-tab.
const POLL_INTERVAL_MS = 30_000;

function parseStability(json: unknown): SystemStability {
	if (!json || typeof json !== "object") throw new Error("Invalid stability response");
	const r = json as Record<string, unknown>;
	const crashed = Number(r.crashed_sessions);
	const caps = Number(r.cap_reached);
	const degraded = Number(r.api_degraded);
	return {
		crashed_sessions: Number.isFinite(crashed) && crashed >= 0 ? crashed : 0,
		cap_reached: Number.isFinite(caps) && caps >= 0 ? caps : 0,
		api_degraded: Number.isFinite(degraded) && degraded > 0 ? 1 : 0,
	};
}

export function useSystemStability(): UseSystemStabilityResult {
	const [stability, setStability] = useState<SystemStability>(ZERO);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);

	useEffect(() => {
		let aborted = false;

		const fetchOnce = async (): Promise<void> => {
			try {
				const res = await fetch("/api/system/stability", {
					headers: { Accept: "application/json" },
				});
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const json: unknown = await res.json();
				const next = parseStability(json);
				if (aborted) return;
				setStability(next);
				setError(null);
			} catch (err: unknown) {
				if (aborted) return;
				setError(err instanceof Error ? err : new Error(String(err)));
				setStability(ZERO);
			} finally {
				if (!aborted) setLoading(false);
			}
		};

		void fetchOnce();
		const id = setInterval(() => {
			void fetchOnce();
		}, POLL_INTERVAL_MS);

		return (): void => {
			aborted = true;
			clearInterval(id);
		};
	}, []);

	return { stability, loading, error };
}
