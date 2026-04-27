import { dsShellProps } from "@hyperidle/design-system";
import type { VerdictAction } from "@hyperidle/shared";
import type { JSX } from "react";

/**
 * L5 — Phone-first verdict surface. Sticky bottom bar above the
 * MobileTabBar. Renders Approve / Request Changes / Reject as primary
 * actions; Snooze + secondary verdicts surface via a "More" sheet.
 *
 * @lore L5 spec: tap targets ≥44px (h-11), labels not truncated.
 * Approve/Request changes/Reject are the three primaries on mobile;
 * Snooze and overflow live behind "More". Behaviour mirrors
 * ReviewHeader: `onPrefill` for first tap (when verdictDoubleClick=true),
 * `onCommit` for second tap or single tap.
 */

export interface MobileVerdictBarProps {
	pendingVerdict: VerdictAction | null;
	verdictDoubleClick: boolean;
	onPrefill: (action: VerdictAction) => void;
	onCommit: (action: VerdictAction) => void;
	onMore: () => void;
}

interface MobileVerdictDef {
	action: VerdictAction;
	label: string;
	variant: string;
}

const MOBILE_PRIMARY_VERDICTS: MobileVerdictDef[] = [
	{ action: "approve", label: "Approve", variant: "btn-accent" },
	{ action: "request-changes", label: "Request Changes", variant: "btn-secondary" },
	{ action: "reject", label: "Reject", variant: "btn-error" },
];

export function MobileVerdictBar({
	pendingVerdict,
	verdictDoubleClick,
	onPrefill,
	onCommit,
	onMore,
}: MobileVerdictBarProps): JSX.Element {
	const handleClick = (action: VerdictAction): void => {
		if (!verdictDoubleClick) {
			onCommit(action);
			return;
		}
		if (pendingVerdict === action) {
			onCommit(action);
		} else {
			onPrefill(action);
		}
	};
	return (
		<div
			{...dsShellProps("MobileVerdictBar")}
			data-testid="mobile-verdict-bar"
			role="toolbar"
			aria-label="Verdict actions"
			className="fixed bottom-14 left-0 right-0 z-20 flex items-stretch gap-1 border-t border-[var(--border-default)] bg-[var(--surface-1)] px-2 py-2"
		>
			{MOBILE_PRIMARY_VERDICTS.map((v) => {
				const pending = pendingVerdict === v.action;
				const label = pending ? `Confirm ${v.label}` : v.label;
				return (
					<button
						key={v.action}
						type="button"
						className={`btn ${v.variant} flex-1 min-h-[44px] text-sm whitespace-nowrap${pending ? " ring-2 ring-offset-1 ring-[var(--accent)]" : ""}`}
						aria-label={label}
						aria-pressed={pending ? true : undefined}
						data-testid={`mobile-verdict-${v.action}`}
						onClick={() => handleClick(v.action)}
					>
						{label}
					</button>
				);
			})}
			<button
				type="button"
				className="btn btn-ghost min-h-[44px] min-w-[44px] text-sm"
				aria-label="More verdict actions"
				data-testid="mobile-verdict-more"
				onClick={onMore}
			>
				More
			</button>
		</div>
	);
}
