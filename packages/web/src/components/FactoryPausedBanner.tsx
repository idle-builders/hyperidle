/**
 * L7 — FactoryPausedBanner.
 *
 * Sticky factory-wide banner shown on every page while the factory is
 * paused. AC8 (TRACK-L L7): "factory-wide banner visible on every page
 * while paused". Source-of-truth for paused-by + reason; the Resume
 * button delegates to the parent (which raises the confirmation
 * dialog).
 *
 * @lore L7: when `state.paused === false` this component renders
 * `null` so it can be unconditionally mounted in the AppShell. The
 * parent does not need to gate its own rendering.
 */
import type { FactoryStateResponse } from "@hyperidle/shared";

export interface FactoryPausedBannerProps {
	state: FactoryStateResponse;
	onResume: () => void;
}

function actorLabel(actorId: string | null): string {
	if (!actorId) return "an operator";
	// `actor:ceo` → `CEO`. For ids with no `:` separator, fall through
	// to the raw id (uppercased). Tail of the split — `at(-1)` — handles
	// `actor:ceo:extra` symmetrically without a special case.
	return actorId.split(":").at(-1)?.toUpperCase() ?? actorId;
}

export function FactoryPausedBanner(props: FactoryPausedBannerProps): JSX.Element | null {
	if (!props.state.paused) return null;

	return (
		<div
			role="status"
			aria-live="polite"
			data-testid="factory-paused-banner"
			className="flex w-full items-center gap-3 border-b border-error/40 bg-error/15 px-4 py-2 text-sm text-error-content"
		>
			<span className="font-medium uppercase tracking-wide">Factory paused</span>
			<span className="opacity-80">
				by {actorLabel(props.state.pausedBy)}
				{props.state.pausedReason ? ` — ${props.state.pausedReason}` : null}
			</span>
			<button
				type="button"
				className="ml-auto btn btn-xs btn-error btn-outline"
				onClick={props.onResume}
			>
				Resume
			</button>
		</div>
	);
}
