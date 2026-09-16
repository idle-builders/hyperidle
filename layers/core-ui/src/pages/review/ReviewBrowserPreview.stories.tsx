// AL1 review canvas — browser-preview story (LOW-fidelity proof).
// Presentational isolation: no router/context/providers.

import type { JSX } from "react";
import { MOCK_REVIEW_SUBJECT } from "./__fixtures__/review-subject.fixture";
import { ReviewBrowserPreview } from "./ReviewBrowserPreview";

export default { title: "Review/Browser Preview", group: "Conversations" };

const artifact = MOCK_REVIEW_SUBJECT.artifacts.find((a) => a.kind === "browser_preview")!;

/**
 * Populated state: a Vercel preview deploy of the new pricing page, shown inside
 * a simple browser window (traffic lights + URL bar). The reviewer just looks at
 * the page and calls it in the review frame. No fancy tooling.
 */
export const Populated = (): JSX.Element => <ReviewBrowserPreview artifact={artifact} />;
