import type { JSX } from "react";
import { ReviewComposition } from "./ReviewComposition.js";
import { REVIEW_COMPOSITION_SUBJECT } from "./review-composition.fixture.js";

export default { title: "Review/Composition", group: "Conversations" };

export function Overview(): JSX.Element {
	return (
		<div style={{ height: "100vh", display: "flex" }}>
			<ReviewComposition subject={REVIEW_COMPOSITION_SUBJECT} onSubmitVerdict={() => {}} />
		</div>
	);
}

export function Examining(): JSX.Element {
	return (
		<div style={{ height: "100vh", display: "flex" }}>
			<ReviewComposition
				subject={REVIEW_COMPOSITION_SUBJECT}
				onSubmitVerdict={() => {}}
				initialOpenArtifactId="artifact:code:1"
			/>
		</div>
	);
}
