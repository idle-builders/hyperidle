/**
 * AJ4 — evidence-report: ChangedStory[] + HostedShot[] → PR markdown + summary data.
 *
 * Pure function — no I/O. Takes the change detection result and hosted asset URLs,
 * produces the PR body design section (fenced with HTML-comment markers for idempotent
 * re-ship) and structured data for the AJ2 interactive ship summary.
 *
 * Empty input → empty output. Never silently drops a changed module even when the
 * image cap is hit: overflow modules appear as link-only "+K more" lines.
 */

import type { ChangedStory } from "./changed-stories.js";
import { storyViewerUrl } from "./story-url.js";
import type { HostedShot } from "./upload-assets.js";

/** How many modules get before/after image renders; remainder are link-only. */
export const EVIDENCE_MODULE_CAP = 12;

export interface EvidenceReport {
	/** Markdown for the PR body/comment design section (empty string ⇒ no section). */
	prMarkdown: string;
	/** Structured data the AJ2 ship summary's design section renders. */
	summarySection: {
		title: string;
		variants: string[];
		storyUrl: string;
		shots: { variant: string; before?: string; after?: string }[];
	}[];
}

/**
 * Build the evidence report from a changed-set and uploaded shots.
 *
 * @param changed - Output of changedStories() — modules with ≥1 changed variant
 * @param hosted  - Output of uploadShots() — hosted asset URLs per shot
 * @returns       - EvidenceReport with prMarkdown and summarySection
 */
export function buildEvidenceReport(changed: ChangedStory[], hosted: HostedShot[]): EvidenceReport {
	if (changed.length === 0) {
		return { prMarkdown: "", summarySection: [] };
	}

	// Index hosted shots by title+side for quick lookup
	const hostedByTitleSide = new Map<string, HostedShot>();
	for (const shot of hosted) {
		const key = `${shot.target.title}::${shot.side}`;
		hostedByTitleSide.set(key, shot);
	}

	// Split changed into imaged (first CAP) and overflow (remainder)
	const imagedModules = changed.slice(0, EVIDENCE_MODULE_CAP);
	const overflowModules = changed.slice(EVIDENCE_MODULE_CAP);

	// Build summarySection — one entry per changed module (all, not just imaged)
	const summarySection: EvidenceReport["summarySection"] = changed.map((story) => {
		const storyUrl = storyViewerUrl(story.title);

		// Find before/after shots for any variant in this module
		const beforeShot = hostedByTitleSide.get(`${story.title}::before`);
		const afterShot = hostedByTitleSide.get(`${story.title}::after`);

		const shots: { variant: string; before?: string; after?: string }[] = [];
		// Group shots by variant — look for any variant's before/after
		const variantShotMap = new Map<string, { before?: string; after?: string }>();
		for (const shot of hosted) {
			if (shot.target.title !== story.title) continue;
			const { variant } = shot.target;
			const entry = variantShotMap.get(variant) ?? {};
			if (shot.side === "before") entry.before = shot.url;
			if (shot.side === "after") entry.after = shot.url;
			variantShotMap.set(variant, entry);
		}

		// Also add module-level shots if variant-level not found (per-module B1 approach)
		if (variantShotMap.size === 0 && (beforeShot ?? afterShot)) {
			// Use the first variant name as the key for module-level shots
			const firstVariant = story.variants[0] ?? "Default";
			variantShotMap.set(firstVariant, {
				before: beforeShot?.url,
				after: afterShot?.url,
			});
		}

		for (const [variant, urlPair] of variantShotMap) {
			shots.push({ variant, ...urlPair });
		}

		return {
			title: story.title,
			variants: story.variants,
			storyUrl,
			shots,
		};
	});

	// Build PR markdown
	const lines: string[] = [];
	lines.push("<!-- aj4-design-evidence:start -->");
	lines.push("## Design changes (design-system surfaces)");
	lines.push(
		`${changed.length} component(s) changed appearance. Open locally with \`npm run ds:serve\`.`,
	);
	lines.push("");

	// Imaged modules — with before/after links or images
	for (const story of imagedModules) {
		const storyUrl = storyViewerUrl(story.title);
		const variantList = story.variants.join(", ");
		lines.push(`### ${story.title} — [open story](${storyUrl})  ·  variants: ${variantList}`);

		const beforeShot = hostedByTitleSide.get(`${story.title}::before`);
		const afterShot = hostedByTitleSide.get(`${story.title}::after`);

		// Also check variant-level shots
		const variantBeforeShot = hosted.find(
			(s) => s.target.title === story.title && s.side === "before",
		);
		const variantAfterShot = hosted.find(
			(s) => s.target.title === story.title && s.side === "after",
		);

		const effectiveBefore = beforeShot ?? variantBeforeShot;
		const effectiveAfter = afterShot ?? variantAfterShot;

		if (effectiveBefore ?? effectiveAfter) {
			const renderMode =
				(effectiveBefore?.render ?? effectiveAfter?.render) === "inline" ? "inline" : "link";

			if (renderMode === "inline") {
				const beforeMd = effectiveBefore
					? `![before (main)](${effectiveBefore.url})`
					: "_no before_";
				const afterMd = effectiveAfter ? `![after (this PR)](${effectiveAfter.url})` : "_no after_";
				lines.push(`${beforeMd} | ${afterMd}`);
			} else {
				const parts: string[] = [];
				if (effectiveBefore) parts.push(`before: [main render](${effectiveBefore.url})`);
				if (effectiveAfter) parts.push(`after: [this PR render](${effectiveAfter.url})`);
				lines.push(parts.join("  ·  "));
			}
		} else {
			// No hosted shots — degraded link-only mode
			lines.push(
				`_screenshot capture unavailable — open the story locally: [open story](${storyUrl})_`,
			);
		}

		lines.push("");
	}

	// Overflow modules — link-only with "+K more" line
	if (overflowModules.length > 0) {
		lines.push(`+${overflowModules.length} more changed modules (link-only):`);
		for (const story of overflowModules) {
			const storyUrl = storyViewerUrl(story.title);
			const variantList = story.variants.join(", ");
			lines.push(`- [${story.title}](${storyUrl}) — variants: ${variantList}`);
		}
		lines.push("");
	}

	lines.push("<!-- aj4-design-evidence:end -->");

	return {
		prMarkdown: lines.join("\n"),
		summarySection,
	};
}
