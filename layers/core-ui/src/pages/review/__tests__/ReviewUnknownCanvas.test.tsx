import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReviewUnknownCanvas } from "../ReviewUnknownCanvas";

describe("ReviewUnknownCanvas", () => {
	it("renders the artifact title and a safe source link", () => {
		render(
			<ReviewUnknownCanvas
				artifact={{
					id: "artifact:unknown:1",
					tool: "weird-tool",
					app: "Weird Tool",
					sourceHref: "https://example.com/record/1",
					title: "Unknown artifact",
					kind: "browser_preview",
					payload: { arbitrary: "data" },
				}}
			/>,
		);

		expect(screen.getByText("Unknown artifact")).toBeInTheDocument();
		const link = screen.getByRole("link", { name: "Open in Weird Tool" });
		expect(link).toHaveAttribute("href", "https://example.com/record/1");
		expect(link.textContent).toContain("↗");
	});

	it("renders the tool logo for a safe source link", () => {
		render(
			<ReviewUnknownCanvas
				artifact={{
					id: "artifact:unknown:2",
					tool: "weird-tool",
					app: "Weird Tool",
					sourceHref: "https://example.com/record/2",
					title: "Unknown artifact",
					kind: "browser_preview",
					payload: { arbitrary: "data" },
				}}
			/>,
		);

		expect(screen.getByTitle("Weird Tool")).toBeInTheDocument();
	});

	it("does not render a clickable anchor for an unsafe sourceHref", () => {
		render(
			<ReviewUnknownCanvas
				artifact={{
					id: "artifact:unknown:3",
					tool: "weird-tool",
					app: "Weird Tool",
					sourceHref: "javascript:alert(1)",
					title: "Unsafe artifact",
					kind: "browser_preview",
					payload: { arbitrary: "data" },
				}}
			/>,
		);

		expect(screen.queryByRole("link")).not.toBeInTheDocument();
	});

	it("renders a non-empty safe payload preview", () => {
		render(
			<ReviewUnknownCanvas
				artifact={{
					id: "artifact:unknown:4",
					tool: "weird-tool",
					app: "Weird Tool",
					sourceHref: "https://example.com/record/4",
					title: "Unknown artifact",
					kind: "browser_preview",
					payload: { arbitrary: "data" },
				}}
			/>,
		);

		const canvas = screen.getByTestId("review-unknown-canvas");
		expect(canvas).not.toBeEmptyDOMElement();
	});

	it("renders 'No dedicated canvas' explanation text", () => {
		// Users land on this canvas when no renderer exists for the artifact kind.
		// They must see an explanation rather than a blank or silent surface.
		render(
			<ReviewUnknownCanvas
				artifact={{
					id: "artifact:unknown:5",
					tool: "weird-tool",
					app: "Weird Tool",
					sourceHref: "https://example.com/record/5",
					title: "Unknown artifact",
					kind: "browser_preview",
					payload: { foo: "bar" },
				}}
			/>,
		);

		expect(screen.getByText("No dedicated canvas")).toBeInTheDocument();
	});
});
