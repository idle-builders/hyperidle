import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MOCK_REVIEW_SUBJECT } from "../__fixtures__/review-subject.fixture";
import { ReviewPage } from "../ReviewPage";

describe("ReviewPage", () => {
	it("renders the review subject title", () => {
		render(<ReviewPage subject={MOCK_REVIEW_SUBJECT} />);

		expect(screen.getByText(MOCK_REVIEW_SUBJECT.title)).toBeInTheDocument();
	});

	it("renders all artifacts from the fixture subject", () => {
		render(<ReviewPage subject={MOCK_REVIEW_SUBJECT} />);

		for (const artifact of MOCK_REVIEW_SUBJECT.artifacts) {
			expect(screen.getByText(artifact.title)).toBeInTheDocument();
		}
	});
});
