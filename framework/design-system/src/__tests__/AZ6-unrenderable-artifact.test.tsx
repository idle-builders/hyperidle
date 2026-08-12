// AZ6 — the artifact that cannot be rendered gets a sentence a person can read
// and a deliberate way to see the source.
//
// The three reasons must not share a sentence. Telling a user HyperIdle "doesn't
// know how to display" a `text` artifact — the kind this work package exists to
// display — is worse than saying nothing, because it is false.

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ArtifactPreviewSurface } from "../ArtifactPreviewSurface.js";
import { UnknownPayload } from "../block/UnknownPayload.js";

afterEach(cleanup);

const passthrough = (raw: string): string => raw;

function renderArtifact(kind: string, preview: unknown) {
	return render(
		<ArtifactPreviewSurface kind={kind} preview={preview} size="full" sanitizeHtml={passthrough} />,
	);
}

describe("a kind the product does not support", () => {
	const UNKNOWN = { kind: "spreadsheet", sheet: "Roadmap", cells: [["Q3", "Q4"]] };

	it("says the kind is one HyperIdle doesn't display, and names it", () => {
		const { container } = renderArtifact("spreadsheet", UNKNOWN);
		expect(container.textContent).toContain("spreadsheet");
		expect(container.textContent).toMatch(/doesn't know how to display/i);
		expect(container.textContent).not.toContain("parser-unrecognised");
		expect(container.textContent).not.toContain("unsupported block");
	});

	it("does not show the source until the user asks for it", () => {
		const { container } = renderArtifact("spreadsheet", UNKNOWN);
		expect(container.querySelector("pre")).toBeNull();
		expect(container.textContent).not.toContain("Roadmap");
	});

	it("reveals the source when the control is pressed, and puts it away again", () => {
		const { container } = renderArtifact("spreadsheet", UNKNOWN);
		fireEvent.click(screen.getByRole("button", { name: /view source/i }));
		expect(container.querySelector("pre")).toBeTruthy();
		expect(container.textContent).toContain("Roadmap");
		fireEvent.click(screen.getByRole("button", { name: /hide source/i }));
		expect(container.querySelector("pre")).toBeNull();
	});
});

describe("a kind the product DOES support, with nothing stored", () => {
	// Every row here is a supported kind. None of them may be told the product
	// cannot display its kind.
	it("says a text artifact is empty, not that text is unsupported", () => {
		const { container } = renderArtifact("text", { kind: "text", body: "   " });
		expect(container.textContent).toMatch(/empty/i);
		expect(container.textContent).not.toMatch(/doesn't know how to display/i);
	});

	it("offers no source control when there is no source to show", () => {
		renderArtifact("text", { kind: "text", body: "   " });
		expect(screen.queryByRole("button", { name: /view source/i })).toBeNull();
	});

	it("says an html artifact is empty rather than painting an empty frame", () => {
		const { container } = renderArtifact("html", { kind: "html", html: "" });
		expect(container.querySelector("iframe")).toBeNull();
		expect(container.textContent).toMatch(/empty/i);
		expect(container.textContent).not.toMatch(/doesn't know how to display/i);
	});
});

describe("a kind the product DOES support, saved in the wrong shape", () => {
	it("says an image artifact can't be read, not that images are unsupported", () => {
		const { container } = renderArtifact("image", { kind: "image", width: 10, height: 10 });
		expect(container.textContent).toMatch(/can't be read/i);
		expect(container.textContent).toContain("image");
		expect(container.textContent).not.toMatch(/doesn't know how to display/i);
	});

	it("says a code artifact can't be read when its preview is not an object", () => {
		const { container } = renderArtifact("code", "just a string");
		expect(container.textContent).toMatch(/can't be read/i);
		expect(container.textContent).not.toMatch(/doesn't know how to display/i);
	});

	it("still offers the stored content, because there is something to show", () => {
		renderArtifact("image", { kind: "image", width: 10, height: 10 });
		fireEvent.click(screen.getByRole("button", { name: /view source/i }));
		expect(screen.getByText(/"width": 10/)).toBeTruthy();
	});

	it("tells the three reasons apart in the DOM, so they can be styled and asserted", () => {
		const a = renderArtifact("spreadsheet", { kind: "spreadsheet" });
		expect(a.container.querySelector("[data-unrenderable-reason='unknown-kind']")).toBeTruthy();
		cleanup();
		const b = renderArtifact("text", { kind: "text", body: "" });
		expect(b.container.querySelector("[data-unrenderable-reason='empty']")).toBeTruthy();
		cleanup();
		const c = renderArtifact("image", { kind: "image", width: 1, height: 1 });
		expect(c.container.querySelector("[data-unrenderable-reason='malformed']")).toBeTruthy();
	});
});

describe("the shared unknown-block state speaks to a person", () => {
	// This component also appears inside knowledge items and comments, so the
	// wording change lands in all three places. Words only — the layout is unchanged.
	it("replaces the enum with a sentence", () => {
		const { container } = render(<UnknownPayload raw="<x>" reason="parser-unrecognised" />);
		expect(container.textContent).not.toContain("parser-unrecognised");
		expect(container.textContent).not.toContain("unsupported block");
		expect(container.textContent).toMatch(/couldn't read/i);
	});

	it("says why when the body was too long", () => {
		const { container } = render(<UnknownPayload raw="…" reason="body-too-large" />);
		expect(container.textContent).not.toContain("body-too-large");
		expect(container.textContent).toMatch(/too long/i);
	});

	it("says why when the sanitiser removed everything", () => {
		const { container } = render(<UnknownPayload raw="<script>" reason="sanitiser-stripped" />);
		expect(container.textContent).not.toContain("sanitiser-stripped");
		expect(container.textContent).toMatch(/removed/i);
	});

	it("keeps showing the source it could not read", () => {
		const { container } = render(<UnknownPayload raw="the source" reason="parser-unrecognised" />);
		expect(container.querySelector("pre")?.textContent).toContain("the source");
	});
});
