/**
 * Fold — the calm collapse-to-summary device (AM1, concept §Fold).
 *
 * A quiet collapsed line: a rotated chevron · optional label · accent CTA
 * ("Show" / "Show session"). `onShow` makes it live — the session fold opens
 * the session dial-in; the work-fold expands the trace.
 *
 * @lore AM1-r7: NO card, NO border (round-7 lock — the heavy session card is
 * dead). The whole device is a single quiet `<button>`. Used for BOTH the
 * work-fold ("Worked for 1m 12s · Show") AND the session dial-in
 * ("› Show session"), and reused in the AM3 session view.
 */

import type { JSX } from "react";
import { dsProps } from "./ds-attrs.js";

export interface FoldProps {
	label?: string;
	cta?: string;
	onShow?: () => void;
}

const ICON_FOLD = "M8 10.5L3.5 6l1-1L8 8.5 11.5 5l1 1L8 10.5z";

export function Fold({ label, cta = "Show", onShow }: FoldProps): JSX.Element {
	return (
		<button
			type="button"
			onClick={onShow}
			{...dsProps("Fold", "1")}
			className="type-control inline-flex items-center gap-[6px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
		>
			<span style={{ transform: "rotate(-90deg)", display: "inline-flex" }}>
				<svg
					viewBox="0 0 16 16"
					fill="currentColor"
					className="shrink-0"
					style={{ width: 12, height: 12 }}
					aria-hidden="true"
				>
					<path d={ICON_FOLD} />
				</svg>
			</span>
			{label && (
				<>
					<span>{label}</span>
					<span className="text-[var(--text-tertiary)]">·</span>
				</>
			)}
			<span className="text-[var(--accent-deep)]">{cta}</span>
		</button>
	);
}
