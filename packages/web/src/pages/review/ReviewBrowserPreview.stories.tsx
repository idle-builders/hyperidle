// AL1 review canvas — browser-preview story (LOW-fidelity proof).
// Presentational isolation: callbacks are no-ops; no router/context/providers.

import type { JSX } from "react";
import { ReviewBrowserPreview } from "./ReviewBrowserPreview";

export default { title: "Review/Browser Preview", group: "Conversations" };

/**
 * Populated state: a Vercel preview deploy of the new pricing page, shown inside
 * a simple browser window (traffic lights + URL bar + open↗). The reviewer just
 * looks at the page and calls it — Approve / Request changes. No fancy tooling.
 */
export const Populated = (): JSX.Element => <ReviewBrowserPreview />;
