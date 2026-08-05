import type { JSX } from "react";
import { REVIEW_COMPOSITION_SUBJECT } from "./__fixtures__/review-composition.fixture.js";
import { ReviewComposition } from "./ReviewComposition.js";

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
