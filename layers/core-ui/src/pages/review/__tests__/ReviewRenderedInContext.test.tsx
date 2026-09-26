import type { AnchorRef } from "@hyperidle/domain-model";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Mock } from "vitest";
import { describe, expect, it, vi as vitest } from "vitest";
import { MOCK_REVIEW_SUBJECT } from "../__fixtures__/review-subject.fixture.js";
import { getReviewCanvas } from "../canvas-registry.js";
import type { RenderedInContextPayload, ReviewArtifact } from "../review-artifact.js";
import { deriveProseBlocks, ReviewCanvasProvider } from "../review-canvas.js";
import type { ReviewComment } from "../review-composition.js";
import { assertNoFabrication, domText } from "./no-fabrication";

const artifact = MOCK_REVIEW_SUBJECT.artifacts.find(
	(a) => a.kind === "rendered_in_context",
)! as ReviewArtifact<RenderedInContextPayload>;

function renderCanvas() {
	const Canvas = getReviewCanvas(artifact.kind);
	return render(<Canvas artifact={artifact} />);
}

describe("ReviewRenderedInContext canvas", () => {
	it("renders the artifact title", () => {
		renderCanvas();

		expect(screen.getByText(artifact.title)).toBeInTheDocument();
	});

	it("shows the tool logo and a safe source link back to the record", () => {
		renderCanvas();

		expect(screen.getByTitle(artifact.app)).toBeInTheDocument();
		const link = screen.getByRole("link", { name: `Open in ${artifact.app}` });
		expect(link).toHaveAttribute("href", artifact.sourceHref);
		expect(link.textContent).toContain("↗");
	});

	it("renders the inbox row and email body", () => {
		renderCanvas();

		expect(screen.getByLabelText(/Inbox preview/i)).toBeInTheDocument();
		expect(screen.getByText(artifact.payload.inboxRow.subject)).toBeInTheDocument();
		expect(screen.getAllByText(artifact.payload.body).length).toBeGreaterThan(0);
	});

	it("exposes the flags and send-plan detail affordance", () => {
		renderCanvas();

		expect(screen.getByLabelText(/Flags and send plan/i)).toBeInTheDocument();
		expect(screen.getByText(/Set up in under 5 minutes/i)).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// Anchored comments
// ---------------------------------------------------------------------------

const proseArtifact = MOCK_REVIEW_SUBJECT.artifacts.find(
	(a): a is ReviewArtifact<RenderedInContextPayload> => a.kind === "rendered_in_context",
)!;

const subject = proseArtifact.payload.inboxRow.subject;
const firstBlock = deriveProseBlocks(proseArtifact.id, proseArtifact.payload.body)[0]!;

function renderAnchoredCanvas({
	anchors = [],
	onAddAnchor = vitest.fn().mockResolvedValue(undefined),
	readOnly = false,
}: {
	anchors?: ReviewComment[];
	onAddAnchor?: Mock<(input: { anchor: AnchorRef; text: string }) => Promise<void>>;
	readOnly?: boolean;
}) {
	const Canvas = getReviewCanvas("rendered_in_context");
	return {
		onAddAnchor,
		...render(
			<ReviewCanvasProvider
				value={{
					anchors: anchors as ReadonlyArray<ReviewComment>,
					readOnly,
					onAddAnchor,
					onJumpToAnchor: vitest.fn(),
				}}
			>
				<Canvas artifact={proseArtifact} />
			</ReviewCanvasProvider>,
		),
	};
}

describe("ReviewRenderedInContext — anchored comments", () => {
	it("opens an inline composer for the first paragraph and calls onAddAnchor", async () => {
		const { onAddAnchor } = renderAnchoredCanvas({});

		const toggle = screen.getByRole("button", { name: /comment on body/i });
		await userEvent.click(toggle);

		const textarea = screen.getByTestId("composer-textarea");
		await userEvent.type(textarea, "This line feels too promotional.");

		const send = screen.getByRole("button", { name: /^Send$/ });
		await userEvent.click(send);

		await waitFor(() => {
			expect(onAddAnchor).toHaveBeenCalledTimes(1);
		});

		const call = onAddAnchor.mock.calls[0]![0];
		expect(call.anchor.artifactId).toBe(proseArtifact.id);
		expect(call.anchor.blockId).toBe(firstBlock.id);
		expect(call.anchor.spotLabel).toBe(subject);
		expect(call.text).toBe("This line feels too promotional.");
	});

	it("hides the comment button in read-only mode", () => {
		renderAnchoredCanvas({ readOnly: true });
		expect(screen.queryByRole("button", { name: /comment on body/i })).not.toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// No fabrication — renders only what the payload supplies
// ---------------------------------------------------------------------------
//
// An earlier `mapRenderedPayload` hardcoded `tool: "mailchimp"` and
// `senderEmail: "hello@example.com"`, and `EmailRender` hardcoded the header
// brand "HyperIdle" regardless of who the email is actually from — none of
// which `RenderedInContextPayload` supplies. Neither `tool` nor `senderEmail`
// was textually rendered as its own word (only the Mailchimp monogram letter
// "M" leaked through), so this file checks the actual visible manifestation
// via the token diff rather than a literal string match that would pass for
// the wrong reason.
//
// This file also names two: the inbox-row avatar always showed the letter "H"
// (not the sender's own initial), and the flags panel always read "1
// unverified claim · send plan · exclusions" regardless of how many flags
// there are or what they say. `audienceLabel`, `excludedNote`, `sendPlan`,
// `ctaLabel`, and `footer` are deleted outright now — `RenderedInContextPayload`
// has no field for any of them, so a production render could never populate
// one; the fields were dead weight, not a real optional case.

const ENVELOPE = {
	id: "artifact:zx-rendered-1",
	tool: "zx-tool-rendered",
	app: "Zx App Rendered",
	sourceHref: "https://example.com/zx-rendered-record",
	title: "Zx Rendered Record Title",
} as const;

function artifactWith(payload: Partial<RenderedInContextPayload>): ReviewArtifact<unknown> {
	return { ...ENVELOPE, kind: "rendered_in_context", payload };
}

const SENTINEL_PAYLOAD: RenderedInContextPayload = {
	inboxRow: {
		sender: "Zx Sender Corvus",
		subject: "Zx Subject Line About The Update",
		preview: "Zx preview snippet text",
	},
	body: "Zx body paragraph describing the change",
	renderMode: "zx-mode",
	flags: ["Zx flag one concern"],
};

const CHROME = [
	"Opened",
	"render",
	"desktop",
	"mobile",
	"flag",
	"flags",
	"No",
	"Open",
	"in",
	"Comment",
	"on",
	"body",
];

describe("ReviewRenderedInContext — no fabrication", () => {
	it('does not brand the rendered email header "HyperIdle" regardless of who sent it', () => {
		const Canvas = getReviewCanvas("rendered_in_context");
		render(<Canvas artifact={artifactWith(SENTINEL_PAYLOAD)} />);

		expect(screen.queryByText("HyperIdle")).not.toBeInTheDocument();
	});

	it("does not render an audience label, CTA, footer, or send plan the payload never supplied", () => {
		const Canvas = getReviewCanvas("rendered_in_context");
		render(<Canvas artifact={artifactWith(SENTINEL_PAYLOAD)} />);

		// The inbox-row separator/audience label only render together (with
		// `data.audienceLabel`) — scope past CanvasSourceHeader's own unrelated "·".
		const inboxPreview = screen.getByRole("region", { name: /Inbox preview/i });
		expect(within(inboxPreview).queryByText("·")).not.toBeInTheDocument();
		expect(screen.queryByText(/Send plan/i)).not.toBeInTheDocument();
		expect(screen.queryByRole("link", { name: "" })).not.toBeInTheDocument();
	});

	it("renders only what the payload supplies, chrome aside, once the flags disclosure is open", async () => {
		const Canvas = getReviewCanvas("rendered_in_context");
		const user = userEvent.setup();
		const { container } = render(<Canvas artifact={artifactWith(SENTINEL_PAYLOAD)} />);

		// the flags panel defaults open when flags exist, but toggle it to prove
		// the assertion covers the expanded state, not an accident of the default.
		const flagsToggle = screen.getByRole("button", { name: /flag/i });
		if (flagsToggle.getAttribute("aria-expanded") === "false") {
			await user.click(flagsToggle);
		}

		expect(screen.getByText(SENTINEL_PAYLOAD.inboxRow.sender)).toBeInTheDocument();
		expect(screen.getByText(SENTINEL_PAYLOAD.inboxRow.subject)).toBeInTheDocument();
		expect(screen.getByText(SENTINEL_PAYLOAD.inboxRow.preview)).toBeInTheDocument();
		expect(screen.getByText(new RegExp(SENTINEL_PAYLOAD.flags[0]!))).toBeInTheDocument();

		assertNoFabrication(domText(container), {
			supplied: [
				ENVELOPE.app,
				ENVELOPE.title,
				SENTINEL_PAYLOAD.inboxRow.sender,
				SENTINEL_PAYLOAD.inboxRow.subject,
				SENTINEL_PAYLOAD.inboxRow.preview,
				SENTINEL_PAYLOAD.body,
				...SENTINEL_PAYLOAD.flags,
			],
			chrome: CHROME,
			derived: [
				1, // flag count (one flag supplied)
				"Z", // ToolLogo's neutral monogram for the unrecognized "zx-tool-rendered" id
			],
		});
	});

	it("falls back to the safe unknown-canvas, not the Mailchimp fixture, on a malformed payload", () => {
		const Canvas = getReviewCanvas("rendered_in_context");
		render(<Canvas artifact={artifactWith({})} />);

		expect(screen.getByTestId("review-unknown-canvas")).toBeInTheDocument();
		expect(screen.queryByText(/mailchimp/i)).not.toBeInTheDocument();
	});
});
