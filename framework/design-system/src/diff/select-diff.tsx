// AM5 T2 — DS diff selector: getDiffRenderer(kind) → DiffRendererComponent.
//
// K2b: the diff core selector lives in design-system — NO web imports.
// K1: unknown kind → UnknownDiff (never crash, never blank).
//
// Usage:
//   const DiffRenderer = getDiffRenderer("code");
//   <DiffRenderer delta={codeDelta} kind="code" />

import type { ComponentType, JSX } from "react";
import { CodeDeltaRenderer } from "./code-delta-renderer.js";

/** Props common to every diff renderer registered here. */
export interface DiffRendererProps {
	/** The delta payload — varies by kind; unknown for the fallback. */
	// biome-ignore lint/suspicious/noExplicitAny: diff payload varies by kind
	readonly delta: any;
	/** The artifact kind string. */
	readonly kind: string;
}

/** A diff renderer component — registered in getDiffRenderer. */
export type DiffRendererComponent = ComponentType<DiffRendererProps>;

// ── UnknownDiff — the K1 fallback for unrecognised kinds ─────────────────────
function UnknownDiff({ kind }: DiffRendererProps): JSX.Element {
	return (
		<section
			aria-label="Unknown diff"
			className="border-width-thin flex items-center gap-[9px] rounded-[var(--r-default)]  border-[var(--border-subtle)] bg-[var(--surface-container)] px-[12px] py-[9px]"
		>
			<span className="type-metadata  text-[var(--text-tertiary)]">
				No diff renderer for kind:{" "}
				<code className="type-data  text-[var(--text-secondary)]">{kind}</code>
			</span>
		</section>
	);
}

// ── CodeDiffAdapter — wraps CodeDeltaRenderer in the DiffRendererComponent API ─
function CodeDiffAdapter({ delta }: DiffRendererProps): JSX.Element {
	if (!delta || typeof delta !== "object" || !Array.isArray(delta.hunks)) {
		return <UnknownDiff delta={delta} kind="code" />;
	}
	return <CodeDeltaRenderer delta={delta} />;
}

// ── registry ──────────────────────────────────────────────────────────────────
const DIFF_RENDERERS: Record<string, DiffRendererComponent> = {
	code: CodeDiffAdapter,
};

/**
 * Select the diff renderer for a given artifact kind.
 * Returns `UnknownDiff` for unregistered kinds (K1 — never crashes, never blank).
 *
 * @lore AM5: getDiffRenderer is the DS-owned diff selector (K2b). The review
 * chrome (getReviewCanvas) composes it downward; no ReviewArtifact types here.
 */
export function getDiffRenderer(kind: string): DiffRendererComponent {
	return DIFF_RENDERERS[kind] ?? UnknownDiff;
}
