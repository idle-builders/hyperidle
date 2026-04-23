import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ArtifactViewProps } from "../shell/ArtifactView";
import { ArtifactView } from "../shell/ArtifactView";

describe("ArtifactView", () => {
	describe("text_diff shape", () => {
		const diffData: ArtifactViewProps = {
			shape: "text_diff",
			data: {
				hunks: [
					{
						header: "@@ -1,3 +1,4 @@",
						lines: [
							{ type: "context", content: "const x = 1;" },
							{ type: "deletion", content: "const y = 2;" },
							{ type: "addition", content: "const y = 3;" },
							{ type: "addition", content: "const z = 4;" },
						],
					},
				],
			},
		};

		it("renders diff lines in a pre/code block", () => {
			render(<ArtifactView {...diffData} />);
			expect(screen.getByRole("region", { name: /diff/i })).toBeInTheDocument();
		});

		it("renders additions with green tinted background", () => {
			render(<ArtifactView {...diffData} />);
			const additions = screen.getAllByText(/const y = 3;|const z = 4;/);
			for (const el of additions) {
				const line = el.closest("[data-diff-type='addition']");
				expect(line).toBeInTheDocument();
				expect(line?.className).toMatch(/bg-success/);
			}
		});

		it("renders deletions with red tinted background", () => {
			render(<ArtifactView {...diffData} />);
			const deletion = screen.getByText("const y = 2;");
			const line = deletion.closest("[data-diff-type='deletion']");
			expect(line).toBeInTheDocument();
			expect(line?.className).toMatch(/bg-error/);
		});

		it("renders context lines without tint", () => {
			render(<ArtifactView {...diffData} />);
			const context = screen.getByText("const x = 1;");
			const line = context.closest("[data-diff-type='context']");
			expect(line).toBeInTheDocument();
			expect(line?.className).not.toMatch(/bg-success|bg-error/);
		});

		it("renders hunk headers", () => {
			render(<ArtifactView {...diffData} />);
			expect(screen.getByText("@@ -1,3 +1,4 @@")).toBeInTheDocument();
		});
	});

	describe("content_preview shape", () => {
		const previewData: ArtifactViewProps = {
			shape: "content_preview",
			data: {
				html: "<p>Hello world</p>",
				metadata: [
					{ label: "Author", value: "Agent-1" },
					{ label: "Version", value: "2.0" },
				],
			},
		};

		it("renders HTML content in a preview region", () => {
			render(<ArtifactView {...previewData} />);
			expect(screen.getByRole("region", { name: /preview/i })).toBeInTheDocument();
			expect(screen.getByText("Hello world")).toBeInTheDocument();
		});

		it("renders metadata as KeyValue pairs", () => {
			render(<ArtifactView {...previewData} />);
			expect(screen.getByText("Author")).toBeInTheDocument();
			expect(screen.getByText("Agent-1")).toBeInTheDocument();
			expect(screen.getByText("Version")).toBeInTheDocument();
			expect(screen.getByText("2.0")).toBeInTheDocument();
		});
	});

	describe("visual_comparison shape", () => {
		const comparisonData: ArtifactViewProps = {
			shape: "visual_comparison",
			data: {
				before: { label: "Before", src: "https://example.com/before.png" },
				after: { label: "After", src: "https://example.com/after.png" },
			},
		};

		it("renders two side-by-side panes", () => {
			render(<ArtifactView {...comparisonData} />);
			expect(screen.getByText("Before")).toBeInTheDocument();
			expect(screen.getByText("After")).toBeInTheDocument();
		});

		it("renders images in both panes", () => {
			render(<ArtifactView {...comparisonData} />);
			const images = screen.getAllByRole("img");
			expect(images).toHaveLength(2);
			expect(images[0]).toHaveAttribute("src", "https://example.com/before.png");
			expect(images[1]).toHaveAttribute("src", "https://example.com/after.png");
		});
	});

	describe("action_summary shape", () => {
		const actionData: ArtifactViewProps = {
			shape: "action_summary",
			data: {
				actions: [
					{ label: "Created file", value: "src/index.ts" },
					{ label: "Modified", value: "package.json" },
					{ label: "Deleted", value: "old-config.yaml" },
				],
			},
		};

		it("renders ordered list of KeyValue rows", () => {
			render(<ArtifactView {...actionData} />);
			expect(screen.getByRole("region", { name: /action summary/i })).toBeInTheDocument();
			expect(screen.getByText("Created file")).toBeInTheDocument();
			expect(screen.getByText("src/index.ts")).toBeInTheDocument();
		});

		it("renders all action items", () => {
			render(<ArtifactView {...actionData} />);
			expect(screen.getByText("Modified")).toBeInTheDocument();
			expect(screen.getByText("package.json")).toBeInTheDocument();
			expect(screen.getByText("Deleted")).toBeInTheDocument();
			expect(screen.getByText("old-config.yaml")).toBeInTheDocument();
		});
	});

	describe("data_metrics shape", () => {
		const metricsData: ArtifactViewProps = {
			shape: "data_metrics",
			data: {
				headlines: [
					{ label: "Total Tests", value: "142" },
					{ label: "Pass Rate", value: "98.6%" },
					{ label: "Coverage", value: "87%" },
				],
				charts: [{ label: "Tests over time", values: [10, 20, 30, 40, 50] }],
			},
		};

		it("renders headline metrics as a grid of KeyValues", () => {
			render(<ArtifactView {...metricsData} />);
			expect(screen.getByRole("region", { name: /metrics/i })).toBeInTheDocument();
			expect(screen.getByText("Total Tests")).toBeInTheDocument();
			expect(screen.getByText("142")).toBeInTheDocument();
		});

		it("renders all headline values", () => {
			render(<ArtifactView {...metricsData} />);
			expect(screen.getByText("Pass Rate")).toBeInTheDocument();
			expect(screen.getByText("98.6%")).toBeInTheDocument();
			expect(screen.getByText("Coverage")).toBeInTheDocument();
			expect(screen.getByText("87%")).toBeInTheDocument();
		});

		it("renders sparkline charts", () => {
			render(<ArtifactView {...metricsData} />);
			const sparklines = screen.getAllByRole("img", { name: /sparkline/i });
			expect(sparklines.length).toBeGreaterThanOrEqual(1);
		});
	});

	describe("loading state", () => {
		it("renders loading skeleton when loading is true", () => {
			render(<ArtifactView shape="text_diff" data={{ hunks: [] }} loading={true} />);
			const skeleton = screen.getByRole("status", { name: /loading/i });
			expect(skeleton).toBeInTheDocument();
		});
	});

	describe("error state", () => {
		it("renders error alert when error is provided", () => {
			render(<ArtifactView shape="text_diff" data={{ hunks: [] }} error="Failed to load diff" />);
			expect(screen.getByRole("alert")).toBeInTheDocument();
			expect(screen.getByText("Failed to load diff")).toBeInTheDocument();
		});
	});

	describe("empty state", () => {
		it("renders empty message for text_diff with no hunks", () => {
			render(<ArtifactView shape="text_diff" data={{ hunks: [] }} />);
			expect(screen.getByText(/no diff/i)).toBeInTheDocument();
		});

		it("renders empty message for action_summary with no actions", () => {
			render(<ArtifactView shape="action_summary" data={{ actions: [] }} />);
			expect(screen.getByText(/no actions/i)).toBeInTheDocument();
		});

		it("renders empty message for data_metrics with no headlines", () => {
			render(<ArtifactView shape="data_metrics" data={{ headlines: [], charts: [] }} />);
			expect(screen.getByText(/no metrics/i)).toBeInTheDocument();
		});
	});

	describe("content_preview XSS safety", () => {
		it("renders script tags as raw HTML via dangerouslySetInnerHTML", () => {
			// @lore This test documents that the current implementation does NOT sanitize
			// HTML client-side. It uses dangerouslySetInnerHTML directly. A future story
			// should add DOMPurify. This test verifies the component at least renders
			// without crashing when given a script tag.
			const xssData: ArtifactViewProps = {
				shape: "content_preview",
				data: {
					html: '<p>Safe</p><script>alert("xss")</script>',
					metadata: [],
				},
			};
			render(<ArtifactView {...xssData} />);
			// The safe content should render
			expect(screen.getByText("Safe")).toBeInTheDocument();
		});
	});

	describe("visual_comparison with missing data", () => {
		it("renders with empty image sources without crashing", () => {
			render(
				<ArtifactView
					shape="visual_comparison"
					data={{
						before: { label: "Old", src: "" },
						after: { label: "New", src: "" },
					}}
				/>,
			);
			expect(screen.getByText("Old")).toBeInTheDocument();
			expect(screen.getByText("New")).toBeInTheDocument();
		});
	});

	describe("data_metrics with only charts", () => {
		it("renders charts even when headlines array is empty", () => {
			render(
				<ArtifactView
					shape="data_metrics"
					data={{
						headlines: [],
						charts: [{ label: "Trend", values: [1, 2, 3] }],
					}}
				/>,
			);
			expect(screen.getByText("Trend")).toBeInTheDocument();
		});
	});

	describe("text_diff with single-line hunks", () => {
		it("renders a hunk with only context lines", () => {
			render(
				<ArtifactView
					shape="text_diff"
					data={{
						hunks: [
							{
								header: "@@ -1,1 +1,1 @@",
								lines: [{ type: "context", content: "unchanged" }],
							},
						],
					}}
				/>,
			);
			expect(screen.getByText("unchanged")).toBeInTheDocument();
		});
	});

	describe("accessibility", () => {
		it("each shape has an accessible region landmark", () => {
			render(
				<ArtifactView
					shape="text_diff"
					data={{
						hunks: [
							{
								header: "@@ -1,1 +1,1 @@",
								lines: [{ type: "addition", content: "hello" }],
							},
						],
					}}
				/>,
			);
			expect(screen.getByRole("region")).toBeInTheDocument();
		});

		it("loading state uses output element with aria-label", () => {
			const { container } = render(
				<ArtifactView shape="text_diff" data={{ hunks: [] }} loading={true} />,
			);
			const output = container.querySelector("output[aria-label='Loading artifact']");
			expect(output).toBeInTheDocument();
		});

		it("error state uses role=alert for screen readers", () => {
			render(<ArtifactView shape="text_diff" data={{ hunks: [] }} error="Something broke" />);
			const alert = screen.getByRole("alert");
			expect(alert).toHaveTextContent("Something broke");
		});

		it("sparkline charts have descriptive aria-labels", () => {
			render(
				<ArtifactView
					shape="data_metrics"
					data={{
						headlines: [{ label: "Count", value: "10" }],
						charts: [{ label: "Tests over time", values: [10, 20, 30] }],
					}}
				/>,
			);
			const sparkline = screen.getByRole("img", { name: /Tests over time sparkline/i });
			expect(sparkline).toBeInTheDocument();
		});
	});
});
