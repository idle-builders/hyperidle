// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageFrame } from "../PageFrame.js";

describe("PageFrame", () => {
	it("wraps its children and carries the data-page-frame contract other components key off of", () => {
		render(
			<PageFrame>
				<div data-testid="content">Content</div>
			</PageFrame>,
		);

		expect(screen.getByTestId("content")).toBeInTheDocument();
		const frame = screen.getByTestId("content").parentElement as HTMLElement;
		expect(frame).toHaveAttribute("data-page-frame");
	});
});
