// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SplitView } from "../SplitView.js";

afterEach(cleanup);

describe("SplitView: modes", () => {
	it("uses a destination-only compact fallback with a labelled return", () => {
		const onModeChange = vi.fn();
		const { getByRole, getByTestId, queryByRole } = render(
			<SplitView
				origin={<div data-testid="compact-origin">origin</div>}
				destination={<div data-testid="compact-destination">destination</div>}
				mode="split"
				dividerRatio={0.5}
				compact
				originLabel="conversation"
				onModeChange={onModeChange}
			/>,
		);
		expect(getByTestId("compact-origin")).not.toBeVisible();
		expect(getByTestId("compact-destination")).toBeVisible();
		expect(queryByRole("separator")).toBeNull();
		const back = getByRole("button", { name: "Back to conversation" });
		back.click();
		expect(onModeChange).toHaveBeenCalledWith("fold-back");
	});

	it("fold-back: hides destination", () => {
		const { container } = render(
			<SplitView
				origin={<div data-testid="origin-content">origin</div>}
				destination={<div data-testid="dest-content">dest</div>}
				mode="fold-back"
				dividerRatio={0.5}
			/>,
		);
		// In fold-back, only origin is shown
		expect(container.querySelector("[data-testid='origin-content']")).toBeTruthy();
		expect(container.querySelector("[data-testid='dest-content']")).toBeNull();
	});

	it("full: hides origin", () => {
		const { container } = render(
			<SplitView
				origin={<div data-testid="origin-content">origin</div>}
				destination={<div data-testid="dest-content">dest</div>}
				mode="full"
				dividerRatio={0.5}
			/>,
		);
		// In full, only destination is shown
		expect(container.querySelector("[data-testid='origin-content']")).toBeNull();
		expect(container.querySelector("[data-testid='dest-content']")).toBeTruthy();
	});

	it("split: shows both origin and destination", () => {
		const { container } = render(
			<SplitView
				origin={<div data-testid="origin-content">origin</div>}
				destination={<div data-testid="dest-content">dest</div>}
				mode="split"
				dividerRatio={0.5}
			/>,
		);
		expect(container.querySelector("[data-testid='origin-content']")).toBeTruthy();
		expect(container.querySelector("[data-testid='dest-content']")).toBeTruthy();
	});
});
