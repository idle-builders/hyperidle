import { type JSX, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button, ErrorState, PageHeader, PageScaffold } from "../ds";

/**
 * @lore I4 E2: NotFound page is the catch-all `*` route fallback so unknown
 * URLs render an actionable message rather than a blank page. It is a page
 * composition (not a custom component) — same rationale as AppShell.
 * @lore visual-parity: Redesigned to match error-states.html 404 card exactly —
 * amber-tinted icon (sad-face SVG), "Page not found" title, two buttons:
 * primary "Go to conversations" + secondary "Go back".
 * @lore The ErrorState `onRetry` prop hardcodes "Retry" as the button label.
 * Since the 404 mockup needs "Go to conversations", both action buttons are
 * rendered in the `action` slot and `onRetry` is omitted.
 */

const SAD_FACE_ICON = (
	<svg
		width="24"
		height="24"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
		aria-hidden="true"
		style={{ color: "var(--accent-secondary)" }}
	>
		<circle cx="12" cy="12" r="10" />
		<path d="M16 16s-1.5-2-4-2-4 2-4 2" />
		<line x1="9" y1="9" x2="9.01" y2="9" />
		<line x1="15" y1="9" x2="15.01" y2="9" />
	</svg>
);

export function NotFound(): JSX.Element {
	const navigate = useNavigate();

	/**
	 * @lore UI-128: NotFound is the standalone `*` catch-all route OUTSIDE AppShell.
	 * AppShell forces h-screen on the #root chain; without it, #root has content-only
	 * height. PageScaffold's h-full then equals content height, not the viewport, so
	 * the error card anchors at the top instead of centering. Fix: force #root to 100vh
	 * on mount so PageScaffold's h-full fills the viewport, and restore on unmount.
	 * This is the minimal fix that keeps the PageScaffold structure intact (and the
	 * page-outline test passing) without touching the shared PageScaffold primitive.
	 */
	useEffect(() => {
		const root = document.getElementById("root");
		if (!root) return;
		const prev = root.style.height;
		root.style.height = "100vh";
		return () => {
			root.style.height = prev;
		};
	}, []);

	return (
		<PageScaffold
			header={<PageHeader title="Page not found" />}
			data-testid="not-found-page"
			body="managed"
		>
			<div className="flex-1 flex items-center justify-center p-[48px_24px]">
				<ErrorState
					title=""
					description="The page you're looking for doesn't exist or has been moved. If you followed a link, it may be outdated."
					icon={SAD_FACE_ICON}
					iconBg="rgba(217,119,6,0.08)"
					action={
						<>
							{/* Shared Button primitive (primary/secondary). */}
							<Button
								variant="primary"
								onClick={() => navigate("/conversations")}
								data-testid="not-found-go-to-conversations"
							>
								Go to conversations
							</Button>
							<Button
								variant="secondary"
								// Z8-148: navigate(-1) exits the app on direct entry (history.length === 1).
								// Fall back to /work (WorkOverview) when there is no history to go back to.
								// Was /work/portfolio.
								onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/work"))}
								data-testid="not-found-go-back"
							>
								Go back
							</Button>
						</>
					}
				/>
			</div>
		</PageScaffold>
	);
}
