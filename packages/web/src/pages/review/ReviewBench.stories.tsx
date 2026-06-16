// AL1 — Review experience, Variant B: The Examination Bench. Story variants.
//
// Populated: code artifact active, anchored-comment gutter with line numbers +
// comment dots (amber on :54), the open comment on :54 in the right rail, and the
// verdict block visible — proving the gutter signature.

import type { JSX } from "react";
import { ReviewBench } from "./ReviewBench.js";

export default { title: "Page: Review/B — Examination Bench" };

export function Populated(): JSX.Element {
	return <ReviewBench />;
}

export function RationaleTab(): JSX.Element {
	return <ReviewBench initialTab="rationale" />;
}

export function Loading(): JSX.Element {
	return <ReviewBench loading />;
}
