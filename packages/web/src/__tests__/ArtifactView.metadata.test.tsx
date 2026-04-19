import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ArtifactView } from "../shell/ArtifactView";

describe("ArtifactView metadata strip (J4)", () => {
	it("renders a metadata strip with kind badge, status, SLA, and routing when provided", () => {
		render(
			<ArtifactView
				shape="text_diff"
				data={{
					hunks: [
						{
							header: "@@ -1,1 +1,1 @@",
							lines: [{ type: "addition", content: "x" }],
						},
					],
				}}
				metadata={{
					status: "pending",
					sla: "2h left",
					routing: "Backend Agent",
				}}
			/>,
		);
		const strip = screen.getByTestId("artifact-metadata-strip");
		expect(strip).toBeInTheDocument();
		// Kind badge is computed from `shape` prop
		expect(strip).toHaveTextContent(/text_diff/);
		expect(strip).toHaveTextContent(/pending/i);
		expect(strip).toHaveTextContent(/2h left/);
		expect(strip).toHaveTextContent(/Backend Agent/);
	});

	it("renders a kind badge for every artifact shape", () => {
		const shapes = [
			{ shape: "content_preview" as const, data: { html: "<p>hi</p>", metadata: [] } },
			{
				shape: "visual_comparison" as const,
				data: {
					before: { label: "Before", src: "" },
					after: { label: "After", src: "" },
				},
			},
			{ shape: "action_summary" as const, data: { actions: [{ label: "x", value: "y" }] } },
			{
				shape: "data_metrics" as const,
				data: { headlines: [{ label: "x", value: "1" }], charts: [] },
			},
		];
		for (const art of shapes) {
			const { unmount } = render(
				<ArtifactView {...art} metadata={{ status: "ok", sla: "", routing: "" }} />,
			);
			expect(screen.getByTestId("artifact-kind-badge")).toHaveTextContent(art.shape);
			unmount();
		}
	});

	it("does not render the metadata strip when metadata prop omitted (backwards-compatible)", () => {
		render(
			<ArtifactView
				shape="text_diff"
				data={{
					hunks: [
						{
							header: "@@ -1,1 +1,1 @@",
							lines: [{ type: "context", content: "x" }],
						},
					],
				}}
			/>,
		);
		expect(screen.queryByTestId("artifact-metadata-strip")).toBeNull();
	});

	it("renders a related-history section below the artifact when relatedHistory provided", () => {
		render(
			<ArtifactView
				shape="text_diff"
				data={{
					hunks: [
						{
							header: "@@ -1,1 +1,1 @@",
							lines: [{ type: "addition", content: "x" }],
						},
					],
				}}
				relatedHistory={[
					{ id: "h1", label: "Previous attempt", timestamp: "1d ago" },
					{ id: "h2", label: "Initial draft", timestamp: "3d ago" },
				]}
			/>,
		);
		const history = screen.getByRole("region", { name: /related history/i });
		expect(history).toBeInTheDocument();
		expect(history).toHaveTextContent("Previous attempt");
		expect(history).toHaveTextContent("Initial draft");
	});
});
