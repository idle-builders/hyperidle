// AM5 T3 — composeArtifactBody: the single-home Artifact (single) composition.
//
// REPLACES `getRenderer(kind)` + renderer-registry.ts (K2/K5).
//
// Dispatches per artifact kind to the matching base primitives — the SAME block
// payloads Block (mixed) and renderPayload use. Pure of states: the
// ArtifactPreviewSurface gate guarantees preview != null and error-boundaries it
// before calling here (K0b).
//
// PER-KIND FIELD MAPPING (verified against the REAL Kind preview schemas):
//   text  → deriveBlocks(body, host) + Block stream  (Text family)
//   code  → CodePayload {lang, text}                 (pure shape — K0/K4)
//   image → ImagePayload {url, alt ?? "", title ?? null}
//   html  → ArtifactFrame — its own document, sealed (AZ6)
//   url   → renderInline([link node]) — inline Link primitive
//   data  → KpiStat + rows table + Sparkline(s)      (K2c data split)
//   else  → ArtifactUnrenderable — a sentence plus a way to see the source (AZ6)
//
// @lore AZ6: the two kinds are treated differently ON PURPOSE. `text` is prose and
// renders inline through the shared block primitives, so it keeps selection, block
// anchoring and the app's own theme; HTML embedded IN a prose body is formatting
// (`<details>`, `<table>`, `<br>`) and goes through the app's sanitiser, the same
// policy Knowledge already applies to the same content. `html` is not prose — it is
// a self-contained page an agent wrote, and it runs whole inside a sealed frame.
// Sanitising THAT would delete the scripts that make it worth opening. An agent
// that wants a document uses `text`; an agent that wants an app declares `html`.
//
// @lore AM5 K5: this replaces the kind-renderer layer (renderer-registry.ts +
// 7 kinds/*-renderer.tsx files) which re-rendered the same content types the
// block-payload layer already owns. The block-payload layer is canonical (K2);
// this is Artifact composing it standalone (one instance, pure of states).

import { deriveBlocks } from "@hyperidle/block-derivation";
import type { Block as BlockData } from "@hyperidle/domain-model";
import type { JSX } from "react";
import { ArtifactFrame } from "../ArtifactFrame.js";
import { Block } from "../Block.js";
import { CodePayload } from "../block/CodePayload.js";
import { ImagePayload } from "../block/ImagePayload.js";
import { renderInline } from "../block/inline.js";
import { KpiStat } from "../KpiStat.js";
import { Sparkline } from "../Sparkline.js";
import { ArtifactUnrenderable } from "./artifact-unrenderable.js";

// ── data rows table (⚠️-DATA: data.rows is NOT TablePayload-compatible) ──────
// data.rows: Record<string,string>[] (freeform key/value grid, no header/align)
// TablePayload: GFM InlineNode[][][] (different shape — not compatible).
// The data composition lifts the data-renderer.tsx rows-table markup verbatim.
// @lore AM5: data.rows is a freeform key/value grid, not a GFM table.
// Using TablePayload here would require converting Record<string,string>[] →
// InlineNode[][][] — out of AM5 scope. This is a plain lifted rows table.
function DataRowsTable({ rows }: { rows: Record<string, string>[] }): JSX.Element {
	return (
		<div className="border-width-thin overflow-x-auto rounded-[var(--r-default)]  border-[var(--border-subtle)]">
			<table className="type-small w-full  border-collapse">
				<tbody>
					{rows.map((row, ri) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: row keys are not unique; index is correct
						<tr key={ri} className="border-width-thin-t  border-[var(--border-subtle)]">
							{Object.entries(row).map(([k, v]) => (
								<td key={k} className="py-1 pr-3 px-2 text-[var(--text-primary)]">
									{v}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

/**
 * Compose the body of an Artifact (single) from its kind and preview payload.
 *
 * Called by ArtifactPreviewSurface's `full` path — the gate has already ensured
 * preview != null and wrapped this in an error boundary. Pure of states (K0b).
 *
 * @param kind - The artifact kind string (e.g. "code", "text", "image").
 * @param preview - The preview payload (guaranteed non-null by the gate).
 * @param sanitizeHtml - The app's HTML sanitiser, applied to HTML embedded inside a
 *   prose body. The `html` kind does not use it — that kind is isolated, not stripped.
 */
export function composeArtifactBody(
	kind: string,
	preview: unknown,
	sanitizeHtml?: (raw: string) => string,
	documentTitle?: string,
): JSX.Element {
	if (!preview || typeof preview !== "object") {
		// A supported kind saved in the wrong shape is a different thing from a kind
		// we do not know — ArtifactUnrenderable tells them apart by the kind itself.
		return <ArtifactUnrenderable kind={kind} source={JSON.stringify(preview) ?? "null"} />;
	}
	const p = preview as Record<string, unknown>;

	switch (kind) {
		case "text": {
			// Text family: deriveBlocks(body) + Block stream (same as KnowledgeBody mixture)
			const body = typeof p.body === "string" ? p.body : "";
			const { blocks } = deriveBlocks(body, { kind: "artifact", id: "artifact-text" });
			if (blocks.length === 0) {
				// Nothing derived: either the body is blank, or it is not text at all.
				return <ArtifactUnrenderable kind={kind} source={body} lang="markdown" />;
			}
			return (
				<div className="flex flex-col gap-[9px]">
					{blocks.map((block: BlockData, blockIndex) => (
						<Block
							key={block.id}
							id={block.id}
							payload={block.payload}
							sanitizeHtml={sanitizeHtml}
							outline={documentTitle ? { documentTitle, blockIndex, levelOffset: 1 } : undefined}
						/>
					))}
				</div>
			);
		}

		case "code": {
			// Code: pure {path, lang, text} shape (K0 — diff is Review's concern, not code's)
			const lang = typeof p.lang === "string" ? p.lang : null;
			const text = typeof p.text === "string" ? p.text : "";
			return <CodePayload lang={lang} text={text} />;
		}

		case "image": {
			// Image: {url, alt?, width, height} — fallback alt to dimensional string (AF16 T10)
			const url = typeof p.url === "string" ? p.url : "";
			if (!url) {
				// Malformed: no url → say so, rather than render a broken <img src="">
				return <ArtifactUnrenderable kind={kind} source={JSON.stringify(p, null, 2)} />;
			}
			// Dimensional fallback preserves the Z8-028 contract: non-empty alt
			const width = typeof p.width === "number" ? p.width : null;
			const height = typeof p.height === "number" ? p.height : null;
			const dimensionFallback = width !== null && height !== null ? `${width}×${height}` : "image";
			const alt = typeof p.alt === "string" && p.alt.length > 0 ? p.alt : dimensionFallback;
			// image schema has no title field — always null
			return <ImagePayload url={url} alt={alt} title={null} />;
		}

		case "html": {
			// Html: the artifact IS a page. It runs whole, sealed — not sanitised.
			const raw = typeof p.html === "string" ? p.html : "";
			if (raw.trim().length === 0) {
				// An empty sealed frame says nothing; say what happened instead.
				return <ArtifactUnrenderable kind={kind} source={raw} reason="empty" />;
			}
			const title = typeof p.title === "string" && p.title.length > 0 ? p.title : "Artifact";
			return <ArtifactFrame html={raw} title={title} />;
		}

		case "url": {
			// Url: schema field is `url` (NOT `href`); inline link node field IS `href`
			const url = typeof p.url === "string" ? p.url : "";
			return (
				<div className="flex flex-col gap-[3px]">
					{renderInline([
						{
							type: "link" as const,
							href: url,
							children: [{ type: "text" as const, value: url }],
						},
					])}
				</div>
			);
		}

		case "data": {
			// Data split (K2c): KpiStat + rows table + Sparklines
			const headlines = Array.isArray(p.headlines)
				? (p.headlines as Array<{ label: string; value: string }>)
				: [];
			const rows = Array.isArray(p.rows) ? (p.rows as Record<string, string>[]) : [];
			const charts = Array.isArray(p.charts)
				? (p.charts as Array<{ label: string; values: number[] }>)
				: [];

			return (
				<section aria-label="Data metrics" className="flex flex-col gap-[9px]">
					{headlines.length > 0 && <KpiStat metrics={headlines} />}
					{rows.length > 0 && <DataRowsTable rows={rows} />}
					{charts.length > 0 && (
						<div className="flex flex-col gap-[6px]">
							{charts.map((chart) => (
								<div key={chart.label} className="flex items-center gap-[9px]">
									<span className="type-label  text-[var(--text-tertiary)]  uppercase w-32 shrink-0">
										{chart.label}
									</span>
									<Sparkline values={chart.values} label={chart.label} />
								</div>
							))}
						</div>
					)}
				</section>
			);
		}

		default: {
			// K1: a kind the product does not know → explain it, offer the source, never crash
			return <ArtifactUnrenderable kind={kind} source={JSON.stringify(preview, null, 2)} />;
		}
	}
}
