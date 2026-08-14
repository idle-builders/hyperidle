import {
	OWNED_TOKEN_FAMILIES,
	type OwnedTokenFamily,
} from "eslint-plugin-design/token-family-owners";

export const TYPOGRAPHY_ROLES = [
	"label",
	"metadata",
	"small",
	"copy",
	"control",
	"input",
	"avatar-initial",
	"subheading",
	"lead",
	"title",
	"display",
	"metric",
	"data",
	"inline-code",
] as const;
export const MOTION_PROFILES = [
	"feedback",
	"move",
	"spring",
	"enter",
	"activity",
	"loading",
	"busy",
] as const;
export const BORDER_WIDTH_PROFILES = ["thin", "default", "strong"] as const;

export interface DesignSource {
	path: string;
	content: string;
}

type Counts<T extends string> = Record<T, number>;

function zeroCounts<T extends string>(keys: readonly T[]): Counts<T> {
	return Object.fromEntries(keys.map((key) => [key, 0])) as Counts<T>;
}

function countMatches(text: string, expression: RegExp): number {
	return [...text.matchAll(expression)].length;
}

function stripForeignSubtrees(content: string): { owned: string; foreign: string } {
	const foreign: string[] = [];
	const owned = content.replace(
		/<([A-Za-z][\w.]*)\b[^>]*data-token-subject=["']foreign["'][^>]*>[\s\S]*?<\/\1>/g,
		(match) => {
			foreign.push(match);
			return " ".repeat(match.length);
		},
	);
	return { owned, foreign: foreign.join("\n") };
}

export interface DesignProfileCensus {
	profiles: {
		typography: Counts<(typeof TYPOGRAPHY_ROLES)[number]>;
		motion: Counts<(typeof MOTION_PROFILES)[number]>;
		border: Counts<(typeof BORDER_WIDTH_PROFILES)[number]>;
	};
	rawByFamily: Counts<OwnedTokenFamily>;
	foreignByFamily: { typography: number; border: number; color: number };
	invalidProfileSites: Array<{ path: string; locator: string; reason: string }>;
}

export function collectDesignProfileCensus(sources: readonly DesignSource[]): DesignProfileCensus {
	const typography = zeroCounts(TYPOGRAPHY_ROLES);
	const motion = zeroCounts(MOTION_PROFILES);
	const border = zeroCounts(BORDER_WIDTH_PROFILES);
	const rawByFamily = zeroCounts(OWNED_TOKEN_FAMILIES);
	const foreignByFamily = { typography: 0, border: 0, color: 0 };
	const invalidProfileSites: DesignProfileCensus["invalidProfileSites"] = [];
	for (const source of sources) {
		if (source.path.endsWith("/token-profiles.ts") || source.path.endsWith("/tokens.css")) continue;
		const { owned, foreign } = stripForeignSubtrees(source.content);
		for (const role of TYPOGRAPHY_ROLES) {
			typography[role] += countMatches(owned, new RegExp(`\\btype-${role}\\b`, "g"));
		}
		for (const profile of MOTION_PROFILES) {
			motion[profile] += countMatches(owned, new RegExp(`\\bmotion-${profile}\\b`, "g"));
		}
		for (const profile of BORDER_WIDTH_PROFILES) {
			border[profile] += countMatches(owned, new RegExp(`\\bborder-width-${profile}\\b`, "g"));
		}
		foreignByFamily.typography += countMatches(
			foreign,
			/\b(?:font-|text-\[(?:\d|var\(--text-(?:xs|sm|base|lg|xl|2xl|3xl))|leading-|tracking-)/g,
		);
		foreignByFamily.border += countMatches(foreign, /\bborder(?:-[xytrblse])?(?:-\d|-\[\d)/g);
		foreignByFamily.color += countMatches(
			foreign,
			/#[\da-f]{3,8}\b|\b(?:text|bg|border)-(?:slate|gray|red|blue)-\d/gi,
		);
		const patterns: Partial<Record<OwnedTokenFamily, RegExp>> = {
			"font-family": /\bfont-(?:sans|mono)\b|\bfontFamily\s*:/g,
			"font-size":
				/\btext-(?:xs|sm|base|lg|xl|2xl|3xl|\[(?:\d|var\(--text-(?:xs|sm|base|lg|xl|2xl|3xl)))|\bfontSize\s*:/g,
			"font-weight": /\bfont-(?:normal|medium|semibold|bold|\[\d)|\bfontWeight\s*:/g,
			"line-height": /\bleading-(?:none|tight|snug|normal|relaxed|loose|\[)|\blineHeight\s*:/g,
			"letter-spacing":
				/\btracking-(?:tighter|tight|normal|wide|wider|widest|\[)|\bletterSpacing\s*:/g,
			duration: /\b(?:transition|duration-|animate-)|\b(?:transition|animation)(?:Duration)?\s*:/g,
			easing: /\bease-|\b(?:transition|animation)TimingFunction\s*:/g,
			"border-width":
				/\bborder(?:-[xytrblse])?(?:\s|["'`]|-(?:0|2|4|8|\[\d))|\bborder\w*Width\s*:/g,
			color:
				/#[\da-f]{3,8}\b|\b(?:text|bg|border)-(?:slate|gray|zinc|neutral|red|blue|indigo|purple)-\d/g,
		};
		for (const family of OWNED_TOKEN_FAMILIES) {
			const pattern = patterns[family];
			if (pattern) rawByFamily[family] += countMatches(owned, pattern);
		}
		for (const match of owned.matchAll(/\b(type|motion|border-width)-([a-z][\w-]*)\b/g)) {
			const [, kind, profile] = match;
			const valid =
				(kind === "type" && TYPOGRAPHY_ROLES.includes(profile as never)) ||
				(kind === "motion" && MOTION_PROFILES.includes(profile as never)) ||
				(kind === "border-width" && BORDER_WIDTH_PROFILES.includes(profile as never));
			if (!valid)
				invalidProfileSites.push({
					path: source.path,
					locator: match[0],
					reason: "unknown profile",
				});
		}
	}
	return {
		profiles: { typography, motion, border },
		rawByFamily,
		foreignByFamily,
		invalidProfileSites,
	};
}
