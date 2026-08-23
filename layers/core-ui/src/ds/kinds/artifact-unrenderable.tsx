// design-lint-disable require-stories-sibling
/**
 * The state an artifact lands in when the product genuinely cannot show it.
 *
 * Internal to the artifact composition — not exported from the package barrel, so
 * it adds nothing to the component budget. It composes `EmptyState` (compact) and
 * `Button`; the source itself is `CodePayload`, which is the one place monospace is
 * the honest choice.
 *
 * @lore AZ6: there are THREE reasons an artifact cannot be shown and they must not
 * share a sentence. "HyperIdle doesn't know how to display this kind" is true only
 * for a kind outside the registry; saying it about a `text` artifact with an empty
 * body — or an `image` whose preview lost its url — tells the user the product
 * cannot display a kind that this very work package makes it display. The kind is
 * classified with `isRegisteredKind`, the same function the API uses, so the two
 * ends of the system agree on what "supported" means.
 *
 * @lore AZ6: an artifact with nothing stored gets no "View source" control. Offering
 * to reveal a source and then showing whitespace is a second small lie.
 *
 * @lore AZ6: this replaces the block-level `UnknownPayload` stripe on the artifact
 * surface only. `UnknownPayload` is still correct INSIDE a body — one block in a
 * long document that the deriver could not read — where it sits in context.
 *
 * @lore AZ6: it lives here rather than inside ArtifactPreviewSurface because
 * `composeArtifactBody` needs it too, and the surface already imports the compose
 * function — putting it in either of those files makes a cycle.
 */

import { isRegisteredKind } from "@hyperidle/domain-model";
import { type JSX, useState } from "react";
import { Button } from "../Button.js";
import { CodePayload } from "../block/CodePayload.js";
import { EmptyState } from "../EmptyState.js";

/** Why an artifact could not be rendered. */
export type UnrenderableReason =
	/** The kind is not in the registry — an old row, or something newer than this build. */
	| "unknown-kind"
	/** A supported kind, but nothing was stored to show. */
	| "empty"
	/** A supported kind, but the stored content is not the shape that kind takes. */
	| "malformed";

export interface ArtifactUnrenderableProps {
	/** The artifact's kind, named back to the user in their own words. */
	kind: string;
	/** The artifact's own text or JSON. Blank means there is nothing to reveal. */
	source: string;
	/** Language hint for the source view, when there is one. */
	lang?: string | null;
	/** Overrides the classification. Omit and the kind decides. */
	reason?: UnrenderableReason;
}

function classify(kind: string, source: string, override?: UnrenderableReason): UnrenderableReason {
	if (override) return override;
	if (!isRegisteredKind(kind)) return "unknown-kind";
	return source.trim().length === 0 ? "empty" : "malformed";
}

function title(reason: UnrenderableReason, kind: string): string {
	switch (reason) {
		case "unknown-kind":
			return "This artifact can't be shown here";
		case "empty":
			return `This ${kind} artifact is empty`;
		case "malformed":
			return `This ${kind} artifact can't be read`;
	}
}

function description(reason: UnrenderableReason, kind: string, hasSource: boolean): string {
	const named = kind.trim().length > 0 ? kind.trim() : "an unnamed kind";
	switch (reason) {
		case "unknown-kind":
			return `It was saved as "${named}", which HyperIdle doesn't know how to display yet.${
				hasSource ? " Its content is intact — you can read the source below." : ""
			}`;
		case "empty":
			return "It was saved without any content, so there is nothing to show. Whoever produced it may still be working.";
		case "malformed":
			return `HyperIdle supports ${named} artifacts, but this one wasn't saved in the shape a ${named} artifact takes, so it can't be laid out.${
				hasSource ? " The stored content is below, exactly as saved." : ""
			}`;
	}
}

export function ArtifactUnrenderable({
	kind,
	source,
	lang = "json",
	reason,
}: ArtifactUnrenderableProps): JSX.Element {
	const [showSource, setShowSource] = useState(false);
	const hasSource = source.trim().length > 0;
	const why = classify(kind, source, reason);

	return (
		<div
			className="flex flex-col gap-[9px] w-full"
			data-artifact-unrenderable
			data-unrenderable-reason={why}
		>
			<EmptyState
				compact
				title={title(why, kind)}
				description={description(why, kind, hasSource)}
				dataTestId="artifact-unrenderable"
				action={
					hasSource ? (
						<Button variant="secondary" size="sm" onClick={() => setShowSource((v) => !v)}>
							{showSource ? "Hide source" : "View source"}
						</Button>
					) : undefined
				}
			/>
			{hasSource && showSource && <CodePayload lang={lang} text={source} />}
		</div>
	);
}
