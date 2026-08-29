/**
 * `derivePartsFromMessages`'s review branch maps a review message's
 * `artifactRef.kind` to a changeset `Embed`. Two vocabularies coexist by
 * design (`part.ts`'s `ARTIFACT_KIND_LABEL`/`artifactRefToEmbed`):
 *
 * - the retired `ARTIFACT_VIEW_SHAPES` (`text_diff`, ...) a row persisted
 *   before the respell may still carry — no data migration touches it;
 * - the current consolidated `ARTIFACT_KINDS` (`text`, `code`, `image`,
 *   `data`, `html`, `url`) `create_artifact`/`submit_review` write today.
 *
 * A regression that drops either side either breaks rendering an existing
 * row (falls through to a bare "Artifact" chip) or makes the diff embed
 * unreachable for every NEW review (nothing ever writes `text_diff` again).
 */

import type { ReviewPayload } from "@hyperidle/domain-model";
import { describe, expect, it } from "vitest";
import { derivePartsFromMessages } from "../part.js";

// AM1 W1: `parts/**` may not import the `Message` source type by name (only
// the adapter, `part.ts` itself, is exempt) — derived instead from
// `derivePartsFromMessages`'s own signature, never named directly.
type SourceMessage = Parameters<typeof derivePartsFromMessages>[0][number];

function reviewMessage(id: string, artifactRefKind: string): SourceMessage {
	return {
		id,
		threadId: "t-1",
		senderId: "agent-1",
		clientKey: `k-${id}`,
		deletedAt: null,
		redactedAt: null,
		resolvedAt: null,
		createdAt: "2026-04-19T12:00:00.000Z",
		type: "review",
		payload: {
			title: "Please approve",
			reasoning: ["done"],
			artifactRef: { id: "art-1", kind: artifactRefKind },
		} as ReviewPayload,
	};
}

function changeSetOf(kind: string) {
	const [part] = derivePartsFromMessages([reviewMessage("m-1", kind)], "viewer", []);
	if (part?.kind !== "review") throw new Error("expected a review part");
	return part.changeSet;
}

describe("derivePartsFromMessages — artifactRef.kind vocabulary respell", () => {
	it("a legacy retired kind (text_diff, persisted before the respell) still renders as a diff embed", () => {
		expect(changeSetOf("text_diff")).toEqual({
			kind: "diff",
			label: "Changes",
			meta: "",
			target: { route: "artifact", artifactId: "art-1" },
		});
	});

	it("the current vocabulary's code kind renders as a diff embed too — the diff embed is reachable for new rows", () => {
		expect(changeSetOf("code")).toEqual({
			kind: "diff",
			label: "Changes",
			meta: "",
			target: { route: "artifact", artifactId: "art-1" },
		});
	});

	it("the current vocabulary's non-code kinds render a real label, not the generic fallback", () => {
		expect(changeSetOf("text")).toMatchObject({ kind: "artifact", label: "Text" });
		expect(changeSetOf("image")).toMatchObject({ kind: "artifact", label: "Image" });
		expect(changeSetOf("data")).toMatchObject({ kind: "artifact", label: "Data" });
		expect(changeSetOf("html")).toMatchObject({ kind: "artifact", label: "Preview" });
		expect(changeSetOf("url")).toMatchObject({ kind: "artifact", label: "Link" });
	});

	it("an unrecognized kind falls back to the generic 'Artifact' label, never the raw id", () => {
		expect(changeSetOf("not_a_real_kind")).toMatchObject({ kind: "artifact", label: "Artifact" });
	});
});
