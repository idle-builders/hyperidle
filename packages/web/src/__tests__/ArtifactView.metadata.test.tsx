// AE6 — ArtifactView metadata strip tests (J4), updated for kind-based API.
// @lore AE6: Metadata strip now shows kind (+ optional label) instead of shape.

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ArtifactView } from "../shell/ArtifactView";

describe("ArtifactView metadata strip (J4)", () => {
	it("renders a metadata strip with kind badge, status, SLA, and routing when provided", () => {
		render(
			<ArtifactView
				kind="code"
				preview={{
					kind: "code",
					file: "src/main.ts",
					hunks: [{ header: "@@ -1,1 +1,1 @@", lines: [{ kind: "add", text: "x" }] }],
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
		// Kind badge shows the kind string
		expect(strip).toHaveTextContent(/code/i);
		expect(strip).toHaveTextContent(/pending/i);
		expect(strip).toHaveTextContent(/2h left/);
		expect(strip).toHaveTextContent(/Backend Agent/);
	});

	it("renders label alongside kind in the badge when label is provided", () => {
		render(
			<ArtifactView
				kind="text"
				label="contract"
				preview={{ kind: "text", body: "Agreement terms", format: "plain" }}
				metadata={{ status: "ok", sla: "", routing: "" }}
			/>,
		);
		const strip = screen.getByTestId("artifact-metadata-strip");
		expect(strip).toHaveTextContent(/text/i);
		expect(strip).toHaveTextContent(/contract/i);
	});

	it("renders a kind badge for each fundamental kind", () => {
		const kinds = [
			{ kind: "text", preview: { kind: "text", body: "Hello", format: "plain" as const } },
			{ kind: "code", preview: { kind: "code", file: "f.ts", hunks: [] } },
			{ kind: "data", preview: { kind: "data", headlines: [] } },
			{ kind: "html", preview: { kind: "html", html: "<p>hi</p>" } },
			{ kind: "url", preview: { kind: "url", url: "https://x.com" } },
			{
				kind: "image",
				preview: { kind: "image", url: "https://x.com/img.png", width: 100, height: 100 },
			},
		];
		for (const art of kinds) {
			const { unmount } = render(
				<ArtifactView {...art} metadata={{ status: "ok", sla: "", routing: "" }} />,
			);
			expect(screen.getByTestId("artifact-kind-badge")).toHaveTextContent(art.kind);
			unmount();
		}
	});

	it("does not render the metadata strip when metadata prop omitted (backwards-compatible)", () => {
		render(<ArtifactView kind="code" preview={{ kind: "code", file: "f.ts", hunks: [] }} />);
		expect(screen.queryByTestId("artifact-metadata-strip")).toBeNull();
	});

	it("renders a related-history section below the artifact when relatedHistory provided", () => {
		render(
			<ArtifactView
				kind="text"
				preview={{ kind: "text", body: "content", format: "plain" }}
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
