import { Button, ErrorState, PageHeader, PageScaffold } from "@hyperidle/design-system";
import type { JSX } from "react";
import { useNavigate } from "react-router-dom";

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

	return (
		<PageScaffold header={<PageHeader title="Page not found" />} data-testid="not-found-page">
			<div className="flex min-h-full items-center justify-center p-[48px_24px]">
				<ErrorState
					title=""
					description="The page you're looking for doesn't exist or has been moved. If you followed a link, it may be outdated."
					icon={SAD_FACE_ICON}
					iconBg="rgba(217,119,6,0.08)"
					action={
						<>
							{/* AI5: shared Button primitive (primary/secondary). */}
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
								// AD9: was /work/portfolio.
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
