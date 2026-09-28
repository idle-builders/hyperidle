// @lore: desktop-only; rendered behind !sidebarMobile guard; never on mobile
// @lore: forward button omitted from DOM entirely when canGoForward is false — no dimmed affordance; Back stays disabled to preserve muscle memory for deep links

import type { JSX } from "react";
import { Button } from "../ds";
import { useHistoryAvailability } from "../hooks/useHistoryAvailability.js";

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
