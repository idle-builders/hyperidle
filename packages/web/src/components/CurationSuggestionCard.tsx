/**
 * J6: curation suggestion card — action-oriented, visually distinct from
 * KnowledgeRow. Rendered in the Triage tab to prompt merges, coverage gaps,
 * etc. The card is a CTA: the headline action is emphasised, with a
 * secondary detail line and explicit accept/dismiss buttons.
 *
 * @lore J6 AC: "visually distinct from KnowledgeRows — action-oriented, not
 * passive." Implemented as a bordered card with an explicit CTA row rather
 * than a passive list row. This preserves the contrast the spec calls for.
 */
import type { JSX } from "react";

export interface CurationSuggestionCardProps {
	action: string;
	detail: string;
	onAccept?: () => void;
	onDismiss?: () => void;
}

export function CurationSuggestionCard({
	action,
	detail,
	onAccept,
	onDismiss,
}: CurationSuggestionCardProps): JSX.Element {
	return (
		<div
			className="flex items-start gap-3 px-3 py-2 border border-[var(--border-emphasis)] bg-[var(--primary-dim)] rounded-lg"
			data-testid="curation-suggestion-card"
			role="group"
			aria-label="Curation suggestion"
		>
			<span
				className="badge badge-primary badge-sm shrink-0 uppercase font-mono"
				aria-label="Suggestion"
			>
				Suggest
			</span>
			<div className="flex-1 min-w-0">
				<p className="text-sm font-semibold text-[var(--text-primary)]">{action}</p>
				<p className="text-xs text-[var(--text-secondary)] truncate">{detail}</p>
			</div>
			<div className="flex items-center gap-1 shrink-0">
				<button
					type="button"
					className="btn btn-xs btn-primary"
					onClick={onAccept}
					aria-label="Accept suggestion"
				>
					Review
				</button>
				<button
					type="button"
					className="btn btn-xs btn-ghost"
					onClick={onDismiss}
					aria-label="Dismiss suggestion"
				>
					Dismiss
				</button>
			</div>
		</div>
	);
}
