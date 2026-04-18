import { Component, type ErrorInfo, type JSX, type ReactNode } from "react";

/**
 * @lore I4 E1: ErrorBoundary is a utility class component that catches
 * render errors in its children and renders a fallback UI. It is NOT one of
 * the 19 custom presentational components in `docs/UI_DESIGN.md` — it is
 * infrastructure (same category as the AppShell layout). Without it, an
 * uncaught render error in any page produces a blank white screen.
 *
 * The fallback shows: "Something went wrong", the error message (for
 * debuggability), and a Reload button that triggers `window.location.reload()`.
 * Children rendered via `siblings` continue to render — boundaries are
 * sibling-isolated by React.
 */

interface ErrorBoundaryProps {
	children: ReactNode;
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

	componentDidCatch(_error: Error, _info: ErrorInfo): void {
		// Hook for future telemetry. Intentionally a no-op for now so test
		// output stays clean (suite stubs console.error).
	}

	private readonly handleReload = (): void => {
		window.location.reload();
	};

	render(): ReactNode {
		const { error } = this.state;
		if (error) {
			return (
				<div
					role="alert"
					className="flex flex-col items-start gap-2 p-3 border border-error rounded bg-base-200"
					data-testid="error-boundary-fallback"
				>
					<h2 className="text-sm font-semibold text-error">Something went wrong</h2>
					<p className="text-xs text-[var(--text-mid)] font-mono break-all">{error.message}</p>
					<button
						type="button"
						className="btn btn-xs btn-ghost"
						onClick={this.handleReload}
					>
						Reload
					</button>
				</div>
			) as JSX.Element;
		}
		return this.props.children;
	}
}
