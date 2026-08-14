import {
	OWNED_TOKEN_FAMILIES,
	type OwnedTokenFamily,
} from "eslint-plugin-design/token-family-owners";
import ts from "typescript";

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
export type BorderWidthProfile = (typeof BORDER_WIDTH_PROFILES)[number];

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

function stripComments(content: string, path: string): string {
	if (path.endsWith(".css"))
		return content.replace(/\/\*[\s\S]*?\*\//g, (match) => " ".repeat(match.length));
	return content
		.replace(/^[\t ]*\/\/[^\r\n]*/gm, (match) => match.replace(/[^\r\n]/g, " "))
		.replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\r\n]/g, " "));
}

function stripForeignSubtrees(content: string, path: string): { owned: string; foreign: string } {
	if (!path.endsWith(".tsx")) return { owned: content, foreign: "" };
	const source = ts.createSourceFile(
		path,
		content,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	const ranges: Array<[number, number]> = [];
	const visit = (node: ts.Node): void => {
		if (ts.isJsxElement(node)) {
			const marked = node.openingElement.attributes.properties.some(
				(attribute) =>
					ts.isJsxAttribute(attribute) &&
					attribute.name.getText(source) === "data-token-subject" &&
					attribute.initializer?.getText(source).replace(/["']/g, "") === "foreign",
			);
			if (marked) {
				ranges.push([node.getStart(source), node.getEnd()]);
				return;
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	const characters = content.split("");
	const foreign: string[] = [];
	for (const [start, end] of ranges) {
		foreign.push(content.slice(start, end));
		for (let index = start; index < end; index++) {
			if (characters[index] !== "\n" && characters[index] !== "\r") characters[index] = " ";
		}
	}
	return { owned: characters.join(""), foreign: foreign.join("\n") };
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

export function findLiveBorderCountMismatches(
	actual: Readonly<Record<BorderWidthProfile, number>>,
	expected: Readonly<Record<BorderWidthProfile, number>>,
): string[] {
	const mismatches: string[] = [];
	for (const profile of BORDER_WIDTH_PROFILES) {
		if (actual[profile] !== expected[profile]) {
			mismatches.push(`border.${profile}: expected ${expected[profile]}, found ${actual[profile]}`);
		}
	}
	return mismatches;
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
		const { owned, foreign } = stripForeignSubtrees(
			stripComments(source.content, source.path),
			source.path,
		);
		for (const role of TYPOGRAPHY_ROLES) {
			typography[role] += countMatches(owned, new RegExp(`(?<!-)\\btype-${role}(?!-)\\b`, "g"));
		}
		for (const profile of MOTION_PROFILES) {
			motion[profile] += countMatches(owned, new RegExp(`\\bmotion-${profile}\\b`, "g"));
		}
		for (const profile of BORDER_WIDTH_PROFILES) {
			border[profile] += countMatches(owned, new RegExp(`var\\(--bw-${profile}\\)`, "g"));
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
			"font-family": /(?<!-)\bfont-(?:sans|mono|\[family-name:)/g,
			"font-size":
				/\btext-(?:xs|sm|base|lg|xl|2xl|3xl|\[(?:\d|var\(--text-(?:xs|sm|base|lg|xl|2xl|3xl)))/g,
			"font-weight": /\bfont-(?:normal|medium|semibold|bold|\[\d)/g,
			"line-height": /\bleading-(?:none|tight|snug|normal|relaxed|loose|\[)/g,
			"letter-spacing": /\btracking-(?:tighter|tight|normal|wide|wider|widest|\[)/g,
			duration: /\b(?:transition(?:-[^\s"'`]+)?|duration-|animate-)/g,
			easing: /\bease-/g,
			color: /\b(?:text|bg|border)-(?:slate|gray|zinc|neutral|red|blue|indigo|purple)-\d/g,
		};
		for (const family of OWNED_TOKEN_FAMILIES) {
			const pattern = patterns[family];
			if (pattern) rawByFamily[family] += countMatches(owned, pattern);
		}
		for (const match of owned.matchAll(/(?<!-)\b(type|motion)-([a-z][\w-]*)\b/g)) {
			const [, kind, profile] = match;
			const following = owned[(match.index ?? 0) + match[0].length];
			const valid =
				(kind === "type" && TYPOGRAPHY_ROLES.includes(profile as never)) ||
				(kind === "type" && /^avatar-initial--(?:stacked|sm|md|lg)$/.test(profile ?? "")) ||
				(kind === "motion" && MOTION_PROFILES.includes(profile as never)) ||
				(kind === "motion" && /^(?:reduce|safe)$/.test(profile ?? "") && following === ":");
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
