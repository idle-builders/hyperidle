// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageFrame } from "../PageFrame.js";

describe("PageFrame", () => {
	it("owns the stable page width and gutters", () => {
		render(
			<PageFrame>
				<div data-testid="content">Content</div>
			</PageFrame>,
		);

		const frame = screen.getByTestId("content").parentElement as HTMLElement;
		expect(frame.className).toContain("max-w-[1120px]");
		expect(frame.className).toContain("mx-auto");
		expect(frame.className).toContain("px-[24px]");
		expect(frame.className).toContain("w-full");
		expect(frame).toHaveAttribute("data-page-frame");
	});
});
