// BA2 T4e-a — ReviewRenderedInContext must render only what its payload
// supplies. `mapRenderedPayload` (ReviewRenderedInContext.tsx:535-552)
// hardcodes `tool: "mailchimp"` and `senderEmail: "hello@example.com"`, and
// `EmailRender` hardcodes the header brand "HyperIdle" regardless of who the
// email is actually from — none of which `RenderedInContextPayload` supplies.
// Neither `tool` nor `senderEmail` is textually rendered as its own word today
// (only the Mailchimp monogram letter "M" leaks through), so this file checks
// the actual visible manifestation via the token diff rather than a literal
// string match that would pass today for the wrong reason.
//
// The sweep for this file also found two the architecture doesn't name: the
// inbox-row avatar always shows the letter "H" (not the sender's own initial),
// and the flags panel always reads "1 unverified claim · send plan ·
// exclusions" regardless of how many flags there are or what they say.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { getReviewCanvas } from "../canvas-registry";
import type { RenderedInContextPayload, ReviewArtifact } from "../review-artifact";
import { assertNoFabrication, domText } from "./no-fabrication";

const Canvas = getReviewCanvas("rendered_in_context");

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
	"Approve",
	"send",
	"Request",
	"changes",
	"Open",
	"in",
	"Comment",
	"on",
	"body",
	"Send",
	"plan",
];

describe("ReviewRenderedInContext — no fabrication (BA2 T4e-a)", () => {
	it('does not brand the rendered email header "HyperIdle" regardless of who sent it', () => {
		render(<Canvas artifact={artifactWith(SENTINEL_PAYLOAD)} />);

		expect(screen.queryByText("HyperIdle")).not.toBeInTheDocument();
	});

	it("renders only what the payload supplies, chrome aside, once the flags disclosure is open", async () => {
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
		render(<Canvas artifact={artifactWith({})} />);

		expect(screen.getByTestId("review-unknown-canvas")).toBeInTheDocument();
		expect(screen.queryByText(/mailchimp/i)).not.toBeInTheDocument();
	});
});
