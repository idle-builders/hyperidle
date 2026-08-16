import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { KnowledgeTopicGroup } from "../components/KnowledgeTopicGroup";

describe("KnowledgeTopicGroup (J6)", () => {
	const defaults = {
		topic: "Architecture",
		itemCount: 3,
		staleCount: 0,
		health: "fresh" as const,
	};

	it("renders the topic title, item count, and children", () => {
		render(
			<KnowledgeTopicGroup {...defaults}>
				<div>child-row</div>
			</KnowledgeTopicGroup>,
		);
		expect(screen.getByText("Architecture")).toBeInTheDocument();
		expect(screen.getByLabelText("3 items")).toHaveTextContent("3");
		expect(screen.getByText("child-row")).toBeInTheDocument();
	});

	// UI-044: singular/plural item count
	it("renders '1 item' (not '1 items') when itemCount is 1", () => {
		render(
			<KnowledgeTopicGroup {...defaults} itemCount={1}>
				<div />
			</KnowledgeTopicGroup>,
		);
		// aria-label is singular
		expect(screen.getByLabelText("1 item")).toBeInTheDocument();
		// visible text is also singular
		expect(screen.getByText("1 item")).toBeInTheDocument();
		// the incorrect "1 items" must not appear
		expect(screen.queryByText("1 items")).not.toBeInTheDocument();
	});

	it("renders '5 items' (plural) when itemCount is 5", () => {
		render(
			<KnowledgeTopicGroup {...defaults} itemCount={5}>
				<div />
			</KnowledgeTopicGroup>,
		);
		expect(screen.getByLabelText("5 items")).toBeInTheDocument();
		expect(screen.getByText("5 items")).toBeInTheDocument();
	});

	it("renders stale count badge only when staleCount > 0", () => {
		const { rerender } = render(
			<KnowledgeTopicGroup {...defaults} staleCount={0}>
				<div />
			</KnowledgeTopicGroup>,
		);
		expect(screen.queryByLabelText(/stale/i)).not.toBeInTheDocument();

		rerender(
			<KnowledgeTopicGroup {...defaults} staleCount={2}>
				<div />
			</KnowledgeTopicGroup>,
		);
		expect(screen.getByLabelText("2 stale")).toBeInTheDocument();
	});

	it("renders a fresh health dot (green) when health is fresh", () => {
		render(
			<KnowledgeTopicGroup {...defaults} health="fresh">
				<div />
			</KnowledgeTopicGroup>,
		);
		const dot = screen.getByTestId(`topic-health-${defaults.topic}`);
		expect(dot).toHaveAttribute("data-health", "fresh");
		expect(dot.className).toMatch(/bg-success/);
	});

	it("renders an amber dot for some_stale", () => {
		render(
			<KnowledgeTopicGroup {...defaults} health="some_stale" staleCount={1}>
				<div />
			</KnowledgeTopicGroup>,
		);
		const dot = screen.getByTestId(`topic-health-${defaults.topic}`);
		expect(dot).toHaveAttribute("data-health", "some_stale");
		expect(dot.className).toMatch(/bg-warning/);
	});

	it("renders a red dot for mostly_stale", () => {
		render(
			<KnowledgeTopicGroup {...defaults} health="mostly_stale" staleCount={3}>
				<div />
			</KnowledgeTopicGroup>,
		);
		const dot = screen.getByTestId(`topic-health-${defaults.topic}`);
		expect(dot).toHaveAttribute("data-health", "mostly_stale");
		expect(dot.className).toMatch(/bg-error/);
	});

	it("toggles collapse when the header is clicked", async () => {
		const user = userEvent.setup();
		render(
			<KnowledgeTopicGroup {...defaults}>
				<div>child-visible</div>
			</KnowledgeTopicGroup>,
		);
		const header = screen.getByRole("button", { expanded: true });
		expect(screen.getByText("child-visible")).toBeInTheDocument();
		await user.click(header);
		expect(screen.queryByText("child-visible")).not.toBeInTheDocument();
		await user.click(screen.getByRole("button", { expanded: false }));
		expect(screen.getByText("child-visible")).toBeInTheDocument();
	});

	it("respects initiallyCollapsed prop", () => {
		render(
			<KnowledgeTopicGroup {...defaults} initiallyCollapsed>
				<div>hidden</div>
			</KnowledgeTopicGroup>,
		);
		expect(screen.queryByText("hidden")).not.toBeInTheDocument();
		expect(screen.getByRole("button", { expanded: false })).toBeInTheDocument();
	});
});
