/**
 * AJ7 — Annotator v2 story (devtools-style element inspector).
 *
 * The design-exploration's three prototype variants (A devtools rail, B floating
 * editor, C inspector strip) have collapsed to the ONE approved, SHIPPED chrome:
 * the devtools rail. This story now renders the real shipped components —
 * InspectorRail + HighlightLayer driven by usePicker over a sample canvas — instead
 * of the prototype stand-ins. The persistence + overlay wiring lives in
 * AnnotationOverlay (composed by the viewer on every component page at :8098); this
 * story exercises the rail chrome + picker in isolation for the catalog.
 *
 * @lore AJ7 SHIPPED-NOT-PROTOTYPE: this used to be a self-contained prototype with
 * aj7- prefixed CSS and in-memory state. The green phase replaced the stand-ins with
 * the real viewer modules. The rail's .anno-* styles live in viewer/viewer.css (dev
 * chrome), which the catalog does not import — so in the snapshot net the rail renders
 * structurally (DOM + class text) without its paint. That is the intended boundary:
 * the rail is dev-only chrome, proven LIVE at :8098, not via the snapshot net's paint.
 *
 * @lore AJ7 DEV-ONLY: the inspector is never in a production bundle.
 */

import { type JSX, useRef, useState } from "react";
import { HighlightLayer } from "../viewer/annotations/highlight-overlay.js";
import { InspectorRail } from "../viewer/annotations/inspector-rail.js";
import type { Annotation } from "../viewer/annotations/types.js";
import { usePicker } from "../viewer/annotations/use-picker.js";

export default {
	title: "AnnotatorV2 (AJ7 design)",
	group: "System" as const,
};

// Realistic sample canvas to inspect — data-ds-component seeds the resolved label
// the way real stories do (the rail's breadcrumb + target echo read it).
function SampleCanvas({
	rootRef,
}: {
	rootRef: React.RefObject<HTMLDivElement | null>;
}): JSX.Element {
	return (
		<div ref={rootRef} className="demo-grid">
			<div className="demo-section" data-variant="BetCard">
				<div className="demo-section-title">Bet Card</div>
				<div data-ds-component="BetCard" className="card">
					<div data-ds-component="BetCard" className="head">
						<span data-ds-component="BetCard" className="title">
							Auth migration — passkey rollout
						</span>
					</div>
					<div data-ds-component="KeyValue" className="meta">
						<span>Budget</span>
						<strong>$2,400</strong>
					</div>
				</div>
			</div>
		</div>
	);
}

const SAMPLE_NOTES: Annotation[] = [
	{
		id: "n-1",
		createdAt: "2026-06-16T10:00:00.000Z",
		story: "BetCard",
		variant: "Default",
		note: "Title should truncate at one line on narrow cards.",
		target: {
			component: "BetCard",
			dsComponent: "BetCard",
			element: 'span.title "Auth migration"',
			anchor: { path: [0, 0, 0], component: "BetCard", element: 'span.title "Auth migration"' },
		},
	},
	{
		id: "n-2",
		createdAt: "2026-06-16T10:01:00.000Z",
		story: "BetCard",
		variant: "Default",
		note: "Budget value needs tabular-nums.",
		target: { component: "KeyValue", dsComponent: "KeyValue", element: "strong" },
	},
];

/**
 * The approved chrome: devtools rail beside the canvas. Renders the real shipped
 * InspectorRail + HighlightLayer + usePicker. State (note, collapse) is local to the
 * story; persistence is exercised by AnnotationOverlay in the live viewer.
 */
export function VariantADevtoolsRail(): JSX.Element {
	const rootRef = useRef<HTMLDivElement | null>(null);
	const armRef = useRef<HTMLButtonElement | null>(null);
	const [note, setNote] = useState("");
	const [collapsed, setCollapsed] = useState(false);
	// The picker needs a non-null root; in the catalog (jsdom) it is the demo-grid div.
	const picker = usePicker((rootRef.current ?? document.createElement("div")) as HTMLDivElement);

	return (
		<div style={{ position: "relative", minHeight: 420 }}>
			<SampleCanvas rootRef={rootRef} />
			<InspectorRail
				picker={picker}
				round={1}
				annotations={SAMPLE_NOTES}
				note={note}
				onNoteChange={setNote}
				onSave={() => undefined}
				saving={false}
				error={null}
				onNewIteration={() => undefined}
				collapsed={collapsed}
				onToggleCollapsed={() => setCollapsed((c) => !c)}
				armButtonRef={armRef}
			/>
			{picker.hover && (
				<HighlightLayer
					el={picker.hover.el}
					label={`${picker.hover.target.component} · ${picker.hover.target.element}`}
					tone="hover"
				/>
			)}
		</div>
	);
}
