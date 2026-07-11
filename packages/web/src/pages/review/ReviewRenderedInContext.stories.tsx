// AL1 review canvas #4 — rendered-in-context story.
// Presentational isolation: the component owns local state (viewport toggle +
// flag expand); callbacks are no-ops. No router/context/providers.

import type { JSX } from "react";
import { MOCK_REVIEW_SUBJECT } from "./__fixtures__/review-subject.fixture";
import { CanvasSourceHeader } from "./CanvasSourceHeader";
import {
	EmailRender,
	FIXTURE,
	type RenderedEmail,
	ReviewRenderedInContext,
} from "./ReviewRenderedInContext";

export default { title: "Review/Rendered In Context", group: "Conversations" };

const artifact = MOCK_REVIEW_SUBJECT.artifacts.find((a) => a.kind === "rendered_in_context")!;

// ── Basic variant: just the email body ────────────────────────────────────────
// Inlined from ReviewRenderedInContext.tsx — the LOW-fidelity sibling of
// ReviewRenderedInContext. Minimal chrome: source header + rendered email body
// + verdict pill pair. No inbox row, no viewport toggle, no flags panel.

interface ReviewEmailBodyProps {
	readonly data?: RenderedEmail;
	readonly onApprove?: () => void;
	readonly onRequestChanges?: () => void;
}

function ReviewEmailBody({
	data = FIXTURE,
	onApprove,
	onRequestChanges,
}: ReviewEmailBodyProps): JSX.Element {
	return (
		<div
			className="flex flex-col gap-[18px] p-[18px] text-left"
			style={{
				maxWidth: 760,
				background: "var(--surface-page)",
				color: "var(--text-primary)",
				fontFamily: "var(--font-sans)",
			}}
		>
			{/* source attribution — what produced this, jump back to it */}
			<div
				style={{
					background: "var(--surface-container)",
					border: "1px solid var(--border-subtle)",
					borderRadius: "var(--r-default)",
					overflow: "hidden",
				}}
			>
				<CanvasSourceHeader tool="mailchimp" app="Mailchimp" record="Launch email · Solo plan" />
			</div>

			{/* the artifact: just the body */}
			<div
				className="p-[24px]"
				style={{
					background: "var(--surface-container)",
					border: "1px solid var(--border-subtle)",
					borderRadius: "var(--r-default)",
				}}
			>
				<EmailRender data={data} viewport="desktop" />
			</div>

			{/* verdict gate — basic pill pair */}
			<div
				className="flex items-center gap-[9px] pt-[12px]"
				style={{ borderTop: "1px solid var(--border-subtle)" }}
			>
				<button
					type="button"
					onClick={() => onApprove?.()}
					className="px-[18px] py-[10px] text-[13px] font-[600] transition-[opacity]"
					style={{
						background: "var(--accent-primary)",
						color: "var(--surface-page)",
						borderRadius: "var(--r-pill)",
						transitionDuration: "var(--motion-fast)",
					}}
				>
					Approve send
				</button>
				<button
					type="button"
					onClick={() => onRequestChanges?.()}
					className="px-[18px] py-[10px] text-[13px] font-[600] transition-[opacity]"
					style={{
						background: "var(--surface-elevated)",
						color: "var(--text-primary)",
						border: "1px solid var(--border-default)",
						borderRadius: "var(--r-pill)",
						transitionDuration: "var(--motion-fast)",
					}}
				>
					Request changes
				</button>
			</div>
		</div>
	);
}

/**
 * Populated, needs-you state: the Mailchimp launch email shown as it lands in
 * the inbox (L1), the opened desktop render (L2), with the flag panel open by
 * default exposing the 1 unverified claim + send plan + exclusions (L3).
 */
export const Populated = (): JSX.Element => <ReviewRenderedInContext artifact={artifact} />;

/**
 * Basic variant: just the body of the email. Source header + the rendered email
 * body + a verdict pill pair — no inbox row, no viewport toggle, no flags. The
 * LOW-fidelity end of the proof spectrum: some things you just look at and call.
 */
export const EmailBody = (): JSX.Element => <ReviewEmailBody />;
