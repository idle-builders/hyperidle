// AL1 review canvas #4 — rendered-in-context story.
// Presentational isolation: the component owns local state (viewport toggle +
// flag expand). No router/context/providers.

import type { JSX } from "react";
import { MOCK_REVIEW_SUBJECT } from "./__fixtures__/review-subject.fixture";
import { CanvasSourceHeader } from "./CanvasSourceHeader";
import {
	EmailRender,
	type RenderedEmail,
	ReviewRenderedInContext,
} from "./ReviewRenderedInContext";

export default { title: "Review/Rendered In Context", group: "Conversations" };

const artifact = MOCK_REVIEW_SUBJECT.artifacts.find((a) => a.kind === "rendered_in_context")!;

// Story-only data (dev world, not production) — the shape `EmailRender` needs
// once a payload has already been mapped. Kept consistent with the same
// mailchimp/launch-email story fixture the "Populated" variant renders below.
const EMAIL_BODY_EXAMPLE: RenderedEmail = {
	tool: "mailchimp",
	campaignName: "Solo plan launch — $19/mo",
	sender: "HyperIdle",
	subject: "Your team, minus the busywork — now $19",
	preview: "Founder pricing ends Sunday.",
	receivedAt: "9:00 AM",
	heroHeadline: "Run a team of agents. Keep the final say.",
	bodyParas: ["Run a team of agents. Keep the final say."],
	flaggedClaims: [
		{
			text: "Set up in under 5 minutes",
			reason: "Unverified claim — no source. Median onboarding in last 30d was 11 min.",
		},
	],
};

// ── Basic variant: just the email body ────────────────────────────────────────
// Inlined from ReviewRenderedInContext.tsx — the LOW-fidelity sibling of
// ReviewRenderedInContext. Minimal chrome: source header + rendered email body.
// No inbox row, no viewport toggle, no flags panel. The review frame owns the
// verdict gate.

interface ReviewEmailBodyProps {
	readonly data?: RenderedEmail;
}

function ReviewEmailBody({ data = EMAIL_BODY_EXAMPLE }: ReviewEmailBodyProps): JSX.Element {
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
 * body — no inbox row, no viewport toggle, no flags. The LOW-fidelity end of
 * the proof spectrum: some things you just look at and call.
 */
export const EmailBody = (): JSX.Element => <ReviewEmailBody />;
