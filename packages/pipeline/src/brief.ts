import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { decode, encodeTyped } from "@hyperidle/shared";

// @lore Runner-owned durable state surface for the pipeline. memory =
// story-level static context; brief = per-step persona handover delta;
// prefetch = per-persona inevitable reads. Personas consume these via the
// SessionStart hook (`.claude/hooks/session-start*.ts`), never by calling
// Read on `.pipeline/`. The hard rule: adversarial personas receive raw
// artifact paths only — formatAdversarialContext drops the producer's
// summaries so critics don't inherit the producer's framing.

export interface MemoryData {
	story: {
		id: string;
		spec: { headline: string; acs: string[] };
	};
	plan: {
		locked: boolean;
		summary: string;
		routes: string[];
		targetFiles: string[];
	};
	openIssues: string[];
	priorPersona: { headline: string };
}

export interface BriefData {
	fromPersona: string;
	toPersona: string;
	priorScore: string | null;
	targetFiles: string[];
	openIssues: string[];
	ledgerEntry: string;
	/**
	 * Raw artifact paths the next persona may need. Adversarial personas
	 * receive these paths instead of summaries — see formatAdversarialContext.
	 */
	artifactPaths: string[];
}

export interface PrefetchItem {
	kind: string;
	content: string;
}

export interface PrefetchData {
	persona: string;
	items: PrefetchItem[];
	totalBytes: number;
	capBytes: number;
}

const PIPELINE_DIR = ".pipeline";

/**
 * Personas that read raw artifacts, not producer self-summaries. Encoded here
 * so the SessionStart hook variant can be selected by config rather than by
 * an in-prompt rule the agent could ignore.
 */
export const ADVERSARIAL_PERSONAS: ReadonlySet<string> = new Set([
	"adversary",
	"adversary-review",
	"architecture-critique",
	"design-critique",
	"check-definition-of-done",
	"security-review",
	"slop-scan",
	"simplification-scan",
	"design-lint",
	"review",
]);

export const PREFETCH_CAP_BYTES = 5 * 1024;

export function memoryPath(cwd: string, storyId: string): string {
	return join(cwd, PIPELINE_DIR, "memory", `${storyId}.toon`);
}

export function briefPath(cwd: string, storyId: string): string {
	return join(cwd, PIPELINE_DIR, "briefs", `${storyId}.toon`);
}

export function prefetchPath(cwd: string, storyId: string, persona: string): string {
	return join(cwd, PIPELINE_DIR, "prefetch", `${storyId}-${persona}.toon`);
}

export function activeStoryPath(cwd: string): string {
	return join(cwd, PIPELINE_DIR, "active-story");
}

function ensureDirFor(filePath: string): void {
	const dir = dirname(filePath);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function writeMemory(cwd: string, storyId: string, data: MemoryData): string {
	const p = memoryPath(cwd, storyId);
	ensureDirFor(p);
	writeFileSync(p, encodeTyped(data));
	return p;
}

export function readMemory(cwd: string, storyId: string): MemoryData | null {
	const p = memoryPath(cwd, storyId);
	if (!existsSync(p)) return null;
	const decoded = decode(readFileSync(p, "utf-8")) as Record<string, unknown>;
	return normalizeMemory(decoded);
}

// @lore TOON encodes empty arrays as zero lines, so decode loses the key.
// Memory/brief consumers expect arrays to always be present — normalize on
// read rather than forcing every writer to ensure non-empty arrays.
function normalizeMemory(raw: Record<string, unknown>): MemoryData {
	const story = (raw.story as MemoryData["story"] | undefined) ?? {
		id: "",
		spec: { headline: "", acs: [] },
	};
	const plan = (raw.plan as Partial<MemoryData["plan"]> | undefined) ?? {};
	const priorPersona = (raw.priorPersona as MemoryData["priorPersona"] | undefined) ?? {
		headline: "",
	};
	return {
		story: {
			id: story.id ?? "",
			spec: {
				headline: story.spec?.headline ?? "",
				acs: story.spec?.acs ?? [],
			},
		},
		plan: {
			locked: plan.locked ?? false,
			summary: plan.summary ?? "",
			routes: plan.routes ?? [],
			targetFiles: plan.targetFiles ?? [],
		},
		openIssues: (raw.openIssues as string[] | undefined) ?? [],
		priorPersona: { headline: priorPersona.headline ?? "" },
	};
}

export function writeBrief(cwd: string, storyId: string, data: BriefData): string {
	const p = briefPath(cwd, storyId);
	ensureDirFor(p);
	writeFileSync(p, encodeTyped(data));
	return p;
}

export function readBrief(cwd: string, storyId: string): BriefData | null {
	const p = briefPath(cwd, storyId);
	if (!existsSync(p)) return null;
	const raw = decode(readFileSync(p, "utf-8")) as Record<string, unknown>;
	return {
		fromPersona: (raw.fromPersona as string | undefined) ?? "",
		toPersona: (raw.toPersona as string | undefined) ?? "",
		priorScore: (raw.priorScore as string | null | undefined) ?? null,
		targetFiles: (raw.targetFiles as string[] | undefined) ?? [],
		openIssues: (raw.openIssues as string[] | undefined) ?? [],
		ledgerEntry: (raw.ledgerEntry as string | undefined) ?? "",
		artifactPaths: (raw.artifactPaths as string[] | undefined) ?? [],
	};
}

export function writePrefetch(
	cwd: string,
	storyId: string,
	persona: string,
	data: PrefetchData,
): string {
	const p = prefetchPath(cwd, storyId, persona);
	ensureDirFor(p);
	writeFileSync(p, encodeTyped(truncatePrefetch(data, data.capBytes ?? PREFETCH_CAP_BYTES)));
	return p;
}

export function readPrefetch(cwd: string, storyId: string, persona: string): PrefetchData | null {
	const p = prefetchPath(cwd, storyId, persona);
	if (!existsSync(p)) return null;
	const raw = decode(readFileSync(p, "utf-8")) as Record<string, unknown>;
	return {
		persona: (raw.persona as string | undefined) ?? persona,
		items: (raw.items as PrefetchItem[] | undefined) ?? [],
		totalBytes: Number(raw.totalBytes ?? 0),
		capBytes: Number(raw.capBytes ?? PREFETCH_CAP_BYTES),
	};
}

export function setActiveStory(cwd: string, storyId: string): void {
	const p = activeStoryPath(cwd);
	ensureDirFor(p);
	writeFileSync(p, storyId);
}

export function getActiveStory(cwd: string): string | null {
	const p = activeStoryPath(cwd);
	if (!existsSync(p)) return null;
	const raw = readFileSync(p, "utf-8").trim();
	return raw === "" ? null : raw;
}

export function isAdversarialPersona(persona: string): boolean {
	return ADVERSARIAL_PERSONAS.has(persona);
}

export function truncatePrefetch(data: PrefetchData, capBytes: number): PrefetchData {
	let bytes = 0;
	const items: PrefetchItem[] = [];
	for (const item of data.items) {
		const size = Buffer.byteLength(item.content, "utf-8");
		if (bytes + size > capBytes) break;
		items.push(item);
		bytes += size;
	}
	return { ...data, items, totalBytes: bytes, capBytes };
}

export interface SessionContextInput {
	memory: MemoryData | null;
	brief: BriefData | null;
	prefetch: PrefetchData | null;
}

/**
 * Format the standard SessionStart injection — story memory (stable),
 * handover brief (per-step delta), and pre-fetched data. Sections are
 * labelled explicitly so personas can't conflate "stable" with
 * "just-handed-off".
 */
export function formatSessionContext(input: SessionContextInput): string {
	const sections: string[] = [];
	if (input.memory) {
		sections.push(`## Story context (stable):\n${encodeTyped(input.memory)}`);
	}
	if (input.brief) {
		sections.push(`## Just-handed-off:\n${encodeTyped(input.brief)}`);
	}
	if (input.prefetch) {
		const truncated = truncatePrefetch(input.prefetch, input.prefetch.capBytes);
		sections.push(
			`## Pre-fetched (cap ${truncated.capBytes}B, used ${truncated.totalBytes}B):\n${encodeTyped(truncated)}`,
		);
	}
	return sections.join("\n\n");
}

export interface AdversarialContextInput {
	memory: MemoryData | null;
	brief: BriefData | null;
}

/**
 * Adversarial-persona variant: inject memory + raw artifact paths only. The
 * brief's free-form summary fields are deliberately dropped so critics don't
 * inherit the producer's framing.
 */
export function formatAdversarialContext(input: AdversarialContextInput): string {
	const sections: string[] = [];
	if (input.memory) {
		sections.push(`## Story context (stable):\n${encodeTyped(input.memory)}`);
	}
	if (input.brief) {
		const paths = input.brief.artifactPaths.length
			? input.brief.artifactPaths.map((p) => `- ${p}`).join("\n")
			: "(none)";
		sections.push(`## Raw artifacts to read (do NOT trust producer summaries):\n${paths}`);
	}
	return sections.join("\n\n");
}
