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
 *
 * @lore L10: when the status fetch errors (server unreachable / network
 * fail), the gate falls through to children rather than blocking on a
 * permanent loading screen. Two reasons: (1) populated surfaces own their
 * own error/empty states and produce a more useful UX than a single
 * "server unreachable" line; (2) the alternative — a permanent block —
 * caused every Playwright e2e spec without an explicit /api/first-run/status
 * mock to hang indefinitely (CI has no backend on :3001). Specs that
 * exercise the gate's redirect-to-/first-run behaviour mock the endpoint
 * with `complete: false`, which still goes through the success branch.
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

	if (loading) {
		return (
			<div
				className="min-h-screen flex items-center justify-center"
				data-testid="first-run-gate-loading"
			>
				<span className="text-sm text-[var(--text-mid)]">Loading…</span>
			</div>
		);
	}

	if (error) {
		// Server unreachable: fall through to children so the populated
		// surfaces can render their own error/empty states. See @lore above.
		return <>{children}</>;
	}

	if (status && !status.complete) {
		// Render nothing until the navigate effect lands; prevents flash of
		// the AppShell empty-of-factory state.
		return <div data-testid="first-run-gate-pending" />;
	}

	return <>{children}</>;
}
