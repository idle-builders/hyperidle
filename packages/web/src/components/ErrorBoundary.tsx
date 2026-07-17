import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * @lore I4 E1: ErrorBoundary is a utility class component that catches
 * render errors in its children and renders a fallback UI. It is NOT one of
 * the 19 custom presentational components in `docs/UI_DESIGN.md` — it is
 * infrastructure (same category as the AppShell layout). Without it, an
 * uncaught render error in any page produces a blank white screen.
 *
 * The fallback shows a generic message ("Something went wrong") and a
 * Reload button. In development (`import.meta.env.DEV`) the raw
 * `error.message` is rendered behind a disclosure so agents can debug;
 * production builds never leak the message (see security MED-2 —
 * Error.message may contain stack frames, internal paths, or unredacted
 * API response bodies).
 *
 * Error boundaries do NOT catch:
 *   - event-handler errors,
 *   - async errors (setTimeout, Promise rejection, fetch .then),
 *   - SSR errors.
 * Async/effect errors in hooks like `useGlobalSearch` must be handled by
 * their own error state — the boundary cannot rescue them.
 *
 * `componentDidCatch` logs the error via `console.error` for observability.
 * A proper observability adapter will replace this wiring in a later story;
 * the log is the minimum surface so production errors are not silently
 * swallowed.
 */

interface ErrorBoundaryProps {
	children: ReactNode;
	/** Optional injected reload handler — primarily for tests. */
	onReload?: () => void;
}

interface ErrorBoundaryState {
	error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
	constructor(props: ErrorBoundaryProps) {
		super(props);
		this.state = { error: null };
	}

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { error };
	}

	componentDidCatch(error: Error, info: ErrorInfo): void {
		// biome-ignore lint/suspicious/noConsole: observability surface — see @lore above
		console.error("[ErrorBoundary] caught render error", {
			message: error.message,
			componentStack: info.componentStack,
		});
	}

	private readonly handleReload = (): void => {
		if (this.props.onReload) {
			this.props.onReload();
			return;
		}
		window.location.reload();
	};

	render(): ReactNode {
		const { error } = this.state;
		if (error) {
			const isDev = import.meta.env.DEV;
			return (
				<div
					role="alert"
					className="flex flex-col items-start gap-2 p-3 rounded-2xl bg-[var(--surface-container)]"
					data-testid="error-boundary-fallback"
				>
					<h2 className="text-sm font-semibold text-error">Something went wrong</h2>
					<p className="text-xs text-[var(--text-secondary)]">
						An unexpected error occurred. Please reload the page.
					</p>
					{isDev && (
						<p
							className="text-xs text-[var(--text-tertiary)] font-mono break-all"
							data-testid="error-boundary-dev-message"
						>
							{error.message}
						</p>
					)}
					<button type="button" className="btn btn-xs btn-ghost" onClick={this.handleReload}>
						Reload
					</button>
				</div>
			);
		}
		return this.props.children;
	}
}
