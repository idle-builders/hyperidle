import { type JSX, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { call } from "../services/call.js";

/**
 * `search_users({ kind: "human" })` decides it: a human row with a team
 * means setup is done; every user is in a team, so the row's own `team`
 * field is the one check.
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

		call("search_users", { kind: "human" })
			.then((result) => {
				if (cancelled) return;
				const done = result.ok && result.data.some((user) => user.team !== null);
				// @lore R2: redirect to /work (was /work/portfolio, was /conversations).
				// AD9: unconditional → /work; WorkOverview handles 1-team → team-page short-circuit.
				setTarget(done ? "/work" : "/setup");
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
