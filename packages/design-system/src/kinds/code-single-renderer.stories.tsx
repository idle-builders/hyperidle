// AM5 — The PURE (code, single) cell: the plain code-FILE renderer.
//
// Design embodiment ONLY (a story that renders). Per concept K5 (RETRACTS the prior
// "gap" framing): pure `code` (`{path,text,lang}`) IS the `code` kind, the BASE — the
// `single` representation just renders it as-is. The *diff* (`{file,hunks}`,
// code-renderer.tsx / ReviewCodeDiff) is the ADDED thing the review builds from two
// pure-code contents; it lives in the `(code, diff)` representation, not the kind.
// This story shows that pure single render: a mono file listing with gutter line
// numbers, reusing the SAME mono/code surface block CodePayload and the diff
// code-renderer already use (bg-surface-container + r-default + p-12 + font-mono) —
// NO new chrome, NO new tokens, NO syntax-highlight engine, NO empty/error branch.
//
// Design intent for the architect/builder (open question O5): the `code` Kind
// Definition's PURE preview schema (`{kind:"code", path/file, lang, text}` — content
// only, no `hunks`); the diff renderer relocates to the `(code,diff)` representation;
// the prior `previewIsDiff`-inside-the-kind is RETRACTED. The story is presentational.

import type { JSX } from "react";

export default { title: "Kinds/CodeSingleRenderer", group: "Artifacts" as const };

// The non-diff `code` preview shape this cell reads (architect locks the real Zod
// shape; this is the design-intent shape): a file path + plain source text.
interface CodeSinglePreview {
	kind: "code";
	file: string;
	lang: string | null;
	text: string;
}

// Presentational cell — the PURE (code, single) renderer. K0/K0b: the content prop
// is NON-OPTIONAL (the single representation guarantees content before invoking this
// renderer) and there is NO empty/error/loading branch — absence is owned by the
// single representation (ArtifactPreviewSurface gates `preview == null → NoPreviewText`).
// Reuses the exact mono surface of block/CodePayload + kinds/code-renderer's <pre>.
function CodeSingleCell({ preview }: { preview: CodeSinglePreview }): JSX.Element {
	const lines = preview.text.split("\n");
	const gutterWidth = String(lines.length).length;
	return (
		<section aria-label="Code file">
			<div className="flex items-center gap-[6px] mb-[6px]">
				<span className="font-mono text-[11px] text-[var(--text-secondary)]">{preview.file}</span>
				{preview.lang ? (
					<span className="font-mono text-[11px] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
						{preview.lang}
					</span>
				) : null}
			</div>
			<pre className="bg-[var(--surface-container)] rounded-[var(--r-default)] p-[12px] overflow-x-auto text-xs font-mono leading-[1.5] m-0 text-[var(--text-primary)]">
				{lines.map((line, i) => (
					<div key={`${i}-${line}`} className="flex">
						<span
							className="select-none text-[var(--text-tertiary)] text-right mr-[12px] shrink-0"
							style={{ width: `${gutterWidth}ch` }}
						>
							{i + 1}
						</span>
						<code className="whitespace-pre">{line.length ? line : " "}</code>
					</div>
				))}
			</pre>
		</section>
	);
}

const SAMPLE = `export function getRenderer(
  kind: string,
  representation: Representation,
): RendererComponent {
  const cell = RENDERER_MAP.get(\`\${kind}:\${representation}\`);
  return cell ?? fallbackFor(representation);
}

// (code, single) renders a file AS A FILE — no diff,
// no add/del gutters, just the source with line numbers.
const ARTIFACT_KINDS = [
  "text", "code", "image", "data", "html", "url",
] as const;`;

// The populated real state — a plain source file rendered "as a file".
export const PlainFile = (): JSX.Element => (
	<div className="max-w-[640px]">
		<CodeSingleCell
			preview={{
				kind: "code",
				file: "packages/design-system/src/kinds/renderer-registry.ts",
				lang: "typescript",
				text: SAMPLE,
			}}
		/>
	</div>
);

// A short config-style file (different content shape, same cell).
export const ShortFile = (): JSX.Element => (
	<div className="max-w-[640px]">
		<CodeSingleCell
			preview={{
				kind: "code",
				file: "vite.config.ts",
				lang: null,
				text: `import { defineConfig } from "vite";\n\nexport default defineConfig({\n  server: { port: 8098 },\n});`,
			}}
		/>
	</div>
);
