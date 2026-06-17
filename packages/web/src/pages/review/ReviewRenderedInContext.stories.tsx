// AL1 review canvas #4 — rendered-in-context story.
// Presentational isolation: the component owns local state (viewport toggle +
// flag expand); callbacks are no-ops. No router/context/providers.

import type { JSX } from "react";
import { ReviewRenderedInContext } from "./ReviewRenderedInContext";

export default { title: "Review/Rendered In Context", group: "Conversations" };

/**
 * Populated, needs-you state: the Mailchimp launch email shown as it lands in
 * the inbox (L1), the opened desktop render (L2), with the flag panel open by
 * default exposing the 1 unverified claim + send plan + exclusions (L3).
 */
export const Populated = (): JSX.Element => <ReviewRenderedInContext />;
