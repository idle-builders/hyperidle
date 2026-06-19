// AL1 review canvas #4 — rendered-in-context story.
// Presentational isolation: the component owns local state (viewport toggle +
// flag expand); callbacks are no-ops. No router/context/providers.

import type { JSX } from "react";
import { MOCK_REVIEW_SUBJECT } from "./__fixtures__/review-subject.fixture";
import { ReviewEmailBody, ReviewRenderedInContext } from "./ReviewRenderedInContext";

export default { title: "Review/Rendered In Context", group: "Conversations" };

const artifact = MOCK_REVIEW_SUBJECT.artifacts.find((a) => a.kind === "rendered_in_context")!;

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
