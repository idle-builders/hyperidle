import type { JSX } from "react";
import { Link } from "react-router-dom";

/**
 * @lore I4 E2: NotFound page is the catch-all `*` route fallback so unknown
 * URLs render an actionable message rather than a blank page. It is a page
 * composition (not a custom component) — same rationale as AppShell.
 */
export function NotFound(): JSX.Element {
	return (
		<div className="flex flex-col items-start gap-3 p-3" data-testid="not-found-page">
			<h1 className="text-sm font-heading font-semibold uppercase tracking-wider text-[var(--text-lo)]">
				Page not found
			</h1>
			<p className="text-xs text-[var(--text-mid)]">
				The URL you followed does not match any known route.
			</p>
			<Link to="/" className="btn btn-xs btn-ghost">
				Go home
			</Link>
		</div>
	);
}
