/**
 * NavHistoryCluster — shell component for history Back/Forward buttons.
 *
 * Renders the [←][→] pair. Reads history availability via useHistoryAvailability
 * and calls the injected onBack/onForward callbacks on click.
 *
 * @lore AG4: Desktop-only — mobile keeps the existing 48px header chevron in
 * AppShell (mobile branch). This component is only rendered inside detail-page
 * headers behind the `!sidebarMobile` guard.
 *
 * @lore AG4: Forward button is omitted from the DOM entirely when canGoForward
 * is false. This is deliberate — no "dimmed" forward affordance exists when
 * there's nothing to go forward to (unlike Back which stays but is disabled so
 * the space is reserved and muscle memory works for deep links).
 */

import type { JSX } from "react";
import { Button } from "../ds";
import { useHistoryAvailability } from "../hooks/useHistoryAvailability.js";

// Chevron SVG — 18px, matching AppShell mobile back button (stroke-width 2, round caps).
const ChevronLeft = (): JSX.Element => (
	<svg
		width={18}
		height={18}
		viewBox="0 0 18 18"
		fill="none"
		stroke="currentColor"
		strokeWidth={2}
		strokeLinecap="round"
		strokeLinejoin="round"
		aria-hidden="true"
	>
		<polyline points="11 4 6 9 11 14" />
	</svg>
);

const ChevronRight = (): JSX.Element => (
	<svg
		width={18}
		height={18}
		viewBox="0 0 18 18"
		fill="none"
		stroke="currentColor"
		strokeWidth={2}
		strokeLinecap="round"
		strokeLinejoin="round"
		aria-hidden="true"
	>
		<polyline points="7 4 12 9 7 14" />
	</svg>
);

export interface NavHistoryClusterProps {
	onBack: () => void;
	onForward: () => void;
}

export function NavHistoryCluster({ onBack, onForward }: NavHistoryClusterProps): JSX.Element {
	const { canGoBack, canGoForward } = useHistoryAvailability();

	return (
		<div className="flex items-center gap-[3px]" data-testid="nav-history-cluster">
			<Button
				variant="ghost"
				aria-label="Back"
				title="Back"
				disabled={!canGoBack}
				onClick={onBack}
				style={{ width: 28, height: 28, padding: 0, minWidth: 28 }}
			>
				<ChevronLeft />
			</Button>
			{canGoForward && (
				<Button
					variant="ghost"
					aria-label="Forward"
					title="Forward"
					onClick={onForward}
					style={{ width: 28, height: 28, padding: 0, minWidth: 28 }}
				>
					<ChevronRight />
				</Button>
			)}
		</div>
	);
}
