// AE6 — ArtifactView tests for kind-based renderer dispatch.
// Updated from shape-based (text_diff/content_preview/visual_comparison/action_summary/data_metrics)
// to kind-based (text/code/image/data/html/url).
//
// @lore AE6: The 5 shapes are retired. Each kind selects a renderer from
// packages/web/src/kinds/renderer-registry.ts. These tests verify the dispatch
// and the container behaviors (loading, error, metadata, related history).

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ArtifactViewProps } from "../shell/ArtifactView";
import { ArtifactView } from "../shell/ArtifactView";

describe("ArtifactView", () => {
	describe("code kind renderer", () => {
		const codeProps: ArtifactViewProps = {
			kind: "code",
			preview: {
				kind: "code",
				file: "src/index.ts",
				hunks: [
					{
						header: "@@ -1,3 +1,4 @@",
						lines: [
							{ kind: "ctx", text: "const x = 1;" },
							{ kind: "del", text: "const y = 2;" },
							{ kind: "add", text: "const y = 3;" },
							{ kind: "add", text: "const z = 4;" },
						],
					},
				],
			},
		};

		it("renders diff lines in a pre/code block", () => {
			render(<ArtifactView {...codeProps} />);
			expect(screen.getByRole("region", { name: /diff/i })).toBeInTheDocument();
		});

		it("renders additions with green tinted background (AI6: color-mix token)", () => {
			render(<ArtifactView {...codeProps} />);
			const additions = screen.getAllByText(/const y = 3;|const z = 4;/);
			for (const el of additions) {
				const line = el.closest("[data-diff-type='add']");
				expect(line).toBeInTheDocument();
				// AI6: bg-success/10 replaced with color-mix form per no-raw-tailwind-color rule.
				expect(line?.className).toMatch(/status-success/);
			}
		});

		it("renders deletions with red tinted background (AI6: color-mix token)", () => {
			render(<ArtifactView {...codeProps} />);
			const deletion = screen.getByText("const y = 2;");
			const line = deletion.closest("[data-diff-type='del']");
			expect(line).toBeInTheDocument();
			// AI6: bg-error/10 replaced with color-mix form per no-raw-tailwind-color rule.
			expect(line?.className).toMatch(/status-error/);
		});

		it("renders context lines without tint", () => {
			render(<ArtifactView {...codeProps} />);
			const context = screen.getByText("const x = 1;");
			const line = context.closest("[data-diff-type='ctx']");
			expect(line).toBeInTheDocument();
			expect(line?.className).not.toMatch(/status-success|status-error/);
		});

		it("renders hunk headers", () => {
			render(<ArtifactView {...codeProps} />);
			expect(screen.getByText("@@ -1,3 +1,4 @@")).toBeInTheDocument();
		});
	});

	describe("text kind renderer", () => {
		it("renders text body content", () => {
			render(
				<ArtifactView
					kind="text"
					preview={{ kind: "text", body: "Hello world", format: "plain" }}
				/>,
			);
			expect(screen.getByText("Hello world")).toBeInTheDocument();
		});
	});

	describe("data kind renderer", () => {
		it("renders headline metrics", () => {
			render(
				<ArtifactView
					kind="data"
					preview={{
						kind: "data",
						headlines: [
							{ label: "Total Tests", value: "142" },
							{ label: "Pass Rate", value: "98.6%" },
						],
						charts: [{ label: "Tests over time", values: [10, 20, 30, 40, 50] }],
					}}
				/>,
			);
			expect(screen.getByRole("region", { name: /metrics/i })).toBeInTheDocument();
			expect(screen.getByText("Total Tests")).toBeInTheDocument();
			expect(screen.getByText("142")).toBeInTheDocument();
		});

		it("renders sparkline charts", () => {
			render(
				<ArtifactView
					kind="data"
					preview={{
						kind: "data",
						headlines: [{ label: "Count", value: "10" }],
						charts: [{ label: "Tests over time", values: [10, 20, 30] }],
					}}
				/>,
			);
			const sparklines = screen.getAllByRole("img", { name: /sparkline/i });
			expect(sparklines.length).toBeGreaterThanOrEqual(1);
		});
	});

	describe("url kind renderer", () => {
		it("renders URL as a clickable link", () => {
			render(
				<ArtifactView
					kind="url"
					preview={{ kind: "url", url: "https://example.com/service", status: "ok" }}
				/>,
			);
			const link = screen.getByRole("link");
			expect(link).toHaveAttribute("href", "https://example.com/service");
		});
	});

	describe("image kind renderer", () => {
		it("renders the image element", () => {
			render(
				<ArtifactView
					kind="image"
					preview={{
						kind: "image",
						url: "https://example.com/img.png",
						width: 800,
						height: 600,
						alt: "Test image",
					}}
				/>,
			);
			const img = screen.getByRole("img");
			expect(img).toHaveAttribute("src", "https://example.com/img.png");
		});
	});

	describe("html kind renderer", () => {
		it("renders a sandboxed iframe", () => {
			render(
				<ArtifactView
					kind="html"
					preview={{ kind: "html", html: "<h1>Hello</h1>", title: "Test" }}
				/>,
			);
			const iframe = document.querySelector("iframe");
			expect(iframe).toBeInTheDocument();
		});
	});

	describe("fallback renderer for unregistered kinds", () => {
		it("renders key-value pairs for unknown kind preview", () => {
			render(
				<ArtifactView
					kind="custom_kind"
					preview={{ kind: "custom_kind", title: "Custom thing", status: "done" }}
				/>,
			);
			expect(screen.getByText("title")).toBeInTheDocument();
			expect(screen.getByText("Custom thing")).toBeInTheDocument();
		});
	});

	describe("loading state", () => {
		it("renders loading skeleton when loading is true", () => {
			render(<ArtifactView kind="text" preview={null} loading={true} />);
			const skeleton = screen.getByRole("status", { name: /loading/i });
			expect(skeleton).toBeInTheDocument();
		});
	});

	describe("error state", () => {
		it("renders error alert when error is provided", () => {
			render(<ArtifactView kind="text" preview={null} error="Failed to load" />);
			expect(screen.getByRole("alert")).toBeInTheDocument();
			expect(screen.getByText("Failed to load")).toBeInTheDocument();
		});
	});

	describe("empty states", () => {
		it("renders empty message for code kind with no hunks", () => {
			render(<ArtifactView kind="code" preview={{ kind: "code", file: "src/x.ts", hunks: [] }} />);
			expect(screen.getByText(/no diff/i)).toBeInTheDocument();
		});

		it("renders empty message for data kind with no headlines", () => {
			render(<ArtifactView kind="data" preview={{ kind: "data", headlines: [] }} />);
			expect(screen.getByText(/no metrics/i)).toBeInTheDocument();
		});

		it("renders empty message for text kind with null preview", () => {
			render(<ArtifactView kind="text" preview={null} />);
			expect(screen.getByText(/no content preview/i)).toBeInTheDocument();
		});
	});

	describe("accessibility", () => {
		it("loading state uses output element with aria-label", () => {
			const { container } = render(<ArtifactView kind="text" preview={null} loading={true} />);
			const output = container.querySelector("output[aria-label='Loading artifact']");
			expect(output).toBeInTheDocument();
		});

		it("error state uses role=alert for screen readers", () => {
			render(<ArtifactView kind="text" preview={null} error="Something broke" />);
			const alert = screen.getByRole("alert");
			expect(alert).toHaveTextContent("Something broke");
		});

		it("sparkline charts have descriptive aria-labels", () => {
			render(
				<ArtifactView
					kind="data"
					preview={{
						kind: "data",
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
