// ReviewVisualDiff must render only what its payload supplies.
//
// `MockScreen` used to render a fabricated signup screen — "Create your
// account", "Start your 14-day trial — no card required.", an
// `Email`/`Password` field pair, a "Create account" CTA — as BOTH the design
// and the build evidence pane, for EVERY payload, in every compare mode
// (side, overlay, swipe). A hardcoded `ToolLogo tool="figma"` was mounted on
// each pane and on the overlay header regardless of the artifact's real tool.
// `VisualDiffPayload` carries labels only (`before.label`, `after.label`,
// `diffRegions[{id,label}]`) — no image data — so there was never anything
// real behind any of it.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { getReviewCanvas } from "../canvas-registry";
import type { ReviewArtifact, VisualDiffPayload } from "../review-artifact";
import { assertNoFabrication, domText } from "./no-fabrication";

const Canvas = getReviewCanvas("visual_diff");

const ENVELOPE = {
	id: "artifact:zx-visual-1",
	tool: "zx-tool-visual",
	app: "Zx App Visual",
	sourceHref: "https://example.com/zx-visual-record",
	title: "Zx Visual Record Title",
} as const;

function artifactWith(payload: Partial<VisualDiffPayload>): ReviewArtifact<unknown> {
	return { ...ENVELOPE, kind: "visual_diff", payload };
}

const SENTINEL_PAYLOAD: VisualDiffPayload = {
	before: { label: "Zx Before Frame Label" },
	after: { label: "Zx After Build Label" },
	diffRegions: [
		{ id: "zx-region-alpha", label: "Zx Region Alpha Label" },
		{ id: "zx-region-beta", label: "Zx Region Beta Label" },
	],
	overlayMode: "side-by-side",
};

const FABRICATED_STRINGS = [
	"Create your account",
	"Start your 14-day trial",
	"no card required",
	"you@company.com",
	"Create account",
	"Onboarding",
	"SignupScreen",
];

// Fixed interface chrome: the pane labels, the honest-absence message, the
// compare-mode toggle, the region-list heading, and CanvasSourceHeader's own
// "Open in {app}" jump-off link — present verbatim in every sibling
// no-fabrication CHROME list.
const CHROME = [
	"Design",
	"Build",
	"No",
	"rendered",
	"image",
	"supplied",
	"regions",
	"differ",
	"Differing",
	"Side",
	"by",
	"side",
	"Overlay",
	"Swipe",
	"opacity",
	"Reveal",
	"under",
	"over",
	"Open",
	"in",
];

describe("ReviewVisualDiff — no fabrication", () => {
	it("does not render a fabricated signup screen in the default (side) mode", () => {
		render(<Canvas artifact={artifactWith(SENTINEL_PAYLOAD)} />);

		for (const text of FABRICATED_STRINGS) {
			expect(screen.queryByText(new RegExp(text, "i"))).not.toBeInTheDocument();
		}
	});

	it("does not render a fabricated signup screen in overlay mode", async () => {
		const user = userEvent.setup();
		render(<Canvas artifact={artifactWith(SENTINEL_PAYLOAD)} />);

		await user.click(screen.getByRole("tab", { name: /Overlay/i }));

		for (const text of FABRICATED_STRINGS) {
			expect(screen.queryByText(new RegExp(text, "i"))).not.toBeInTheDocument();
		}
	});

	it("does not render a fabricated signup screen in swipe mode", async () => {
		const user = userEvent.setup();
		render(<Canvas artifact={artifactWith(SENTINEL_PAYLOAD)} />);

		await user.click(screen.getByRole("tab", { name: /Swipe/i }));

		for (const text of FABRICATED_STRINGS) {
			expect(screen.queryByText(new RegExp(text, "i"))).not.toBeInTheDocument();
		}
	});

	it("does not hardcode a figma mark regardless of the artifact's real tool", () => {
		const { container } = render(<Canvas artifact={artifactWith(SENTINEL_PAYLOAD)} />);

		// the real tool ("zx-tool-visual") has no known brand, so ToolLogo's own
		// neutral-monogram fallback is "Z" — accounted for as `derived` below.
		// A hardcoded `tool="figma"` render would additionally emit "F" marks,
		// which `assertNoFabrication` below would catch as unexplained tokens.
		assertNoFabrication(domText(container), {
			supplied: [
				ENVELOPE.app,
				ENVELOPE.title,
				SENTINEL_PAYLOAD.before.label,
				SENTINEL_PAYLOAD.after.label,
				SENTINEL_PAYLOAD.diffRegions[0]!.label,
				SENTINEL_PAYLOAD.diffRegions[1]!.label,
			],
			chrome: CHROME,
			derived: [
				SENTINEL_PAYLOAD.diffRegions.length, // the "{count} regions differ" pill
				"Z", // ToolLogo's neutral monogram for the unrecognized "zx-tool-visual" id
			],
		});
	});

	it("renders only what the payload supplies, chrome aside, in every compare mode", async () => {
		const user = userEvent.setup();
		const { container } = render(<Canvas artifact={artifactWith(SENTINEL_PAYLOAD)} />);

		expect(screen.getByText(SENTINEL_PAYLOAD.before.label)).toBeInTheDocument();
		expect(screen.getByText(SENTINEL_PAYLOAD.after.label)).toBeInTheDocument();
		for (const region of SENTINEL_PAYLOAD.diffRegions) {
			expect(screen.getByText(region.label)).toBeInTheDocument();
		}

		const supplied = [
			ENVELOPE.app,
			ENVELOPE.title,
			SENTINEL_PAYLOAD.before.label,
			SENTINEL_PAYLOAD.after.label,
			SENTINEL_PAYLOAD.diffRegions[0]!.label,
			SENTINEL_PAYLOAD.diffRegions[1]!.label,
		];
		const derived = [SENTINEL_PAYLOAD.diffRegions.length, "Z"];

		assertNoFabrication(domText(container), { supplied, chrome: CHROME, derived });

		await user.click(screen.getByRole("tab", { name: /Overlay/i }));
		assertNoFabrication(domText(container), { supplied, chrome: CHROME, derived });

		await user.click(screen.getByRole("tab", { name: /Swipe/i }));
		assertNoFabrication(domText(container), { supplied, chrome: CHROME, derived });
	});

	it("flags a region by its own id, not a different one coerced from an unknown value", async () => {
		const user = userEvent.setup();
		render(<Canvas artifact={artifactWith(SENTINEL_PAYLOAD)} />);

		const first = screen.getByText(SENTINEL_PAYLOAD.diffRegions[0]!.label).closest("button")!;
		const second = screen.getByText(SENTINEL_PAYLOAD.diffRegions[1]!.label).closest("button")!;

		await user.click(first);

		expect(first).toHaveAttribute("aria-pressed", "true");
		expect(second).toHaveAttribute("aria-pressed", "false");
	});

	it("falls back to the safe unknown-canvas, not the signup-screen fixture, on a malformed payload", () => {
		render(<Canvas artifact={artifactWith({})} />);

		expect(screen.getByTestId("review-unknown-canvas")).toBeInTheDocument();
		expect(screen.queryByText(/Create your account/i)).not.toBeInTheDocument();
	});
});
