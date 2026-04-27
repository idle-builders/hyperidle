/**
 * L10 — FirstRunGate.
 *
 * Wraps the populated AppShell. Calls `GET /api/first-run/status`; if
 * `complete=false`, redirects to `/first-run`. While loading we render a
 * minimal placeholder so the populated UI never flashes before the
 * redirect (review CRIT — would-be brief glimpse of empty UI counts as
 * a leak of "no factory" pre-flow).
 *
 * @lore L10: redirect runs in a `useEffect` instead of returning a
 * `<Navigate />` to avoid a render-time navigation that would mask the
 * AppShell mount during loading. The skeleton is plain prose, not the
 * shell, so no provider data fetches kick off.
 */
import type { JSX } from "react";
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useFirstRun } from "../hooks/useFirstRun";

interface Props {
	children: React.ReactNode;
}

export function FirstRunGate({ children }: Props): JSX.Element {
	const navigate = useNavigate();
	const location = useLocation();
	const { status, loading, error } = useFirstRun();

	useEffect(() => {
		if (loading) return;
		if (error) return;
		if (status && !status.complete) {
			navigate("/first-run", { replace: true, state: { from: location.pathname } });
		}
	}, [status, loading, error, navigate, location.pathname]);

	if (loading || error) {
		return (
			<div
				className="min-h-screen flex items-center justify-center"
				data-testid="first-run-gate-loading"
			>
				<span className="text-sm text-[var(--text-mid)]">
					{error ? `Server unreachable: ${error.message}` : "Loading…"}
				</span>
			</div>
		);
	}

	if (status && !status.complete) {
		// Render nothing until the navigate effect lands; prevents flash of
		// the AppShell empty-of-factory state.
		return <div data-testid="first-run-gate-pending" />;
	}

	return <>{children}</>;
}
