/**
 * ArtifactFrame — an artifact of the `html` kind, running as its own document.
 *
 * @lore AZ6 component budget: this is a new component because no existing export
 * does its job. `HtmlPayload` renders sanitised fragments into the app's own
 * document, which is the opposite of what an artifact needs — it strips the
 * scripts that make an artifact worth opening. Everything around the frame is
 * composed from existing exports (`Button`, `Dialog`).
 *
 * The seal itself lives in `artifact-frame/build-srcdoc.ts` — read the lore there
 * before changing anything here, particularly the part about why there are two
 * layers.
 */

import { type JSX, useCallback, useEffect, useRef, useState } from "react";

import {
	ARTIFACT_FRAME_SANDBOX,
	ARTIFACT_SIZE_CHANGED_METHOD,
	buildArtifactSrcdoc,
	clampFrameHeight,
	FRAME_INITIAL_HEIGHT,
} from "./artifact-frame/build-srcdoc.js";
import { Button } from "./Button.js";
import { Dialog } from "./Dialog.js";
import { dsProps } from "./ds-attrs.js";

export interface ArtifactFrameProps {
	/** The artifact's HTML, exactly as its author wrote it. */
	html: string;
	/** Accessible name for the frame. */
	title?: string;
}

const FRAME_CLASS =
	"block w-full border border-[var(--border-subtle)] rounded-[var(--r-default)] bg-[var(--surface-page)] max-h-[70vh]";

/**
 * What the user is told about the box.
 *
 * @lore AZ6: this line says what the frame IS, not everything it cannot do, and
 * that is deliberate. Earlier versions promised an absolute — "no access to your
 * data or the network" — and an absolute about a security boundary is only as
 * true as the last channel someone thought to try. Two review rounds each found
 * one nobody had. A sentence whose truth depends on enumerating every channel in
 * the web platform will eventually be a lie printed under a hostile page. This
 * one stays true on its own: the artifact runs in its own document, sealed off
 * from the app. Keep it modest if you edit it.
 */
const SEALED_NOTE = "Runs on its own, in a box sealed off from the app.";

/** Read a height out of a size-changed notification, or null if it is not one. */
function heightFromMessage(data: unknown): number | null {
	if (typeof data !== "object" || data === null) return null;
	const message = data as { method?: unknown; params?: unknown };
	if (message.method !== ARTIFACT_SIZE_CHANGED_METHOD) return null;
	if (typeof message.params !== "object" || message.params === null) return null;
	const { height } = message.params as { height?: unknown };
	if (typeof height !== "number") return null;
	return clampFrameHeight(height);
}

export function ArtifactFrame({ html, title = "Artifact" }: ArtifactFrameProps): JSX.Element {
	const frameRef = useRef<HTMLIFrameElement>(null);
	const [height, setHeight] = useState(FRAME_INITIAL_HEIGHT);
	const [expanded, setExpanded] = useState(false);
	const srcDoc = buildArtifactSrcdoc(html);

	const onMessage = useCallback((event: MessageEvent): void => {
		// Only this frame may resize this frame. Any other window — the app itself,
		// a sibling artifact, an ad in a future embed — is ignored.
		if (event.source !== frameRef.current?.contentWindow) return;
		const next = heightFromMessage(event.data);
		if (next !== null) setHeight(next);
	}, []);

	useEffect(() => {
		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, [onMessage]);

	/**
	 * There is deliberately no watcher for the shell being replaced.
	 *
	 * @lore AZ6: `frame-src 'none'` on the shell is what keeps an artifact in its
	 * box, and that is measured (`probes/egress-matrix-result.json`, row C: loosening
	 * only the INNER policy changes nothing; it is the shell's directive that pins
	 * it). An earlier version counted `load` events on this iframe and painted a
	 * "tried to leave its box" panel on the second one. It was cut, because it
	 * guarded a case nothing in the artifact can reach and it could not have been
	 * load-bearing anyway: the *Open larger* dialog below renders the identical
	 * `srcDoc` with no counter at all, so if a replaced shell were a real threat the
	 * largest view of the artifact would have been the unguarded one. Either it
	 * matters everywhere or it matters nowhere. It is nowhere.
	 */
	return (
		<div {...dsProps("ArtifactFrame", "2")} className="flex flex-col gap-[6px] w-full">
			<iframe
				ref={frameRef}
				data-artifact-frame
				title={title}
				sandbox={ARTIFACT_FRAME_SANDBOX}
				srcDoc={srcDoc}
				style={{ height: `${height}px` }}
				className={FRAME_CLASS}
			/>
			<div className="flex items-center gap-[9px]">
				<span data-artifact-sealed-note className="text-[12px] text-[var(--text-tertiary)]">
					{SEALED_NOTE}
				</span>
				<Button
					variant="ghost"
					size="sm"
					className="ml-auto"
					onClick={() => setExpanded(true)}
					aria-label="Open artifact larger"
				>
					Open larger
				</Button>
			</div>
			{expanded && (
				<Dialog open onClose={() => setExpanded(false)} title={title} size="lg">
					<iframe
						data-artifact-frame-expanded
						title={`${title} (larger)`}
						sandbox={ARTIFACT_FRAME_SANDBOX}
						srcDoc={srcDoc}
						className="block w-full h-[70vh] border-0 rounded-[var(--r-default)] bg-[var(--surface-page)]"
					/>
				</Dialog>
			)}
		</div>
	);
}
