import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "../ds";

/**
 * Catches render errors in children; renders fallback UI to prevent blank screen.
 *
 * In development: raw error.message shown for debugging.
 * In production: generic message only — error.message may leak stack frames or API bodies.
 *
 * Does NOT catch: event-handler errors, async errors (setTimeout, Promise, fetch), SSR errors.
 * Those must be handled by their own error state.
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
					className="flex flex-col items-start gap-[9px] p-3 rounded-[var(--r-default)] bg-[var(--surface-container)]"
					data-testid="error-boundary-fallback"
				>
					<h2 className="type-subheading   text-error">Something went wrong</h2>
					<p className="type-metadata  text-[var(--text-secondary)]">
						An unexpected error occurred. Please reload the page.
					</p>
					{isDev && (
						<p
							className="type-data  text-[var(--text-tertiary)]  break-all"
							data-testid="error-boundary-dev-message"
						>
							{error.message}
						</p>
					)}
					<Button variant="ghost" size="sm" onClick={this.handleReload}>
						Reload
					</Button>
				</div>
			);
		}
		return this.props.children;
	}
}
