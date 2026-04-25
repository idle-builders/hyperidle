/**
 * K1 AESTHETICS.md contract spec — TDD harness.
 *
 * This is the Definition-of-Done harness for story K1 (Track K — Aesthetics
 * Uplift). It validates the structural contract of
 * `packages/design-system/AESTHETICS.md` and its per-topic appendices under
 * `packages/design-system/research/`. Until those docs exist with the right
 * shape, this spec fails (red phase).
 *
 * @lore Each gate maps 1:1 to an acceptance criterion in
 *   `docs/work-packages/TRACK-K.md` story K1, and to a verification row in
 *   `docs/plans/K1-plan.md` Section 5. The list of expected per-topic research
 *   files is hardcoded from `docs/plans/K1-plan.md` Section 2 (Phase 1 fan-out
 *   plus the Phase 0 reference-systems matrix). Update this list if the plan's
 *   topic list changes.
 *
 * "Lint hint" gate convention (Gate 5): when a row's Lintable cell is `yes` or
 *   `partial`, the test accepts ANY of the following as evidence of a hint:
 *     (a) a non-empty cell under a column titled `Lint hint` (case-insensitive),
 *     (b) a `regex:` token anywhere in the row's Rationale or trailing cells,
 *     (c) an `ast:` token anywhere in the row's Rationale or trailing cells.
 *   This matches the K1 plan column shape (`Lint hint` is the canonical column)
 *   while tolerating inline `regex:`/`ast:` shorthand for very simple rules.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const DS_ROOT = resolve(__dirname, "..");
const AESTHETICS_PATH = resolve(DS_ROOT, "AESTHETICS.md");
const RESEARCH_DIR = resolve(DS_ROOT, "research");

// Per-topic research files derived from docs/plans/K1-plan.md Section 2.
// Phase 0 foundation + Phase 1 fan-out (8 topic agents). Plan total: 9 files.
const EXPECTED_RESEARCH_FILES = [
	"reference-systems-matrix.md", // Phase 0 foundation
	"spacing-density.md",
	"typography.md",
	"color-dark.md",
	"borders-radii-shadows.md",
	"motion.md",
	"mobile-touch.md",
	"ai-aesthetic.md",
	"ai-design-agents.md",
] as const;

// Required H2 sections — case-insensitive match on the heading text.
const REQUIRED_SECTIONS = [
	"Spacing & Density",
	"Typography",
	"Color & Dark Mode",
	"Borders/Radii/Shadows",
	"Motion",
	"Mobile & Touch",
	"AI-Aesthetic Anti-Patterns",
] as const;

// Required column headers, in order. Trailing columns (e.g., `Lint hint`) are
// allowed beyond these.
const REQUIRED_COLUMNS = [
	"Token",
	"Current value",
	"Recommended value",
	"Rationale",
	"Sources",
	"Lintable",
] as const;

// Gate 6: every required section's token-driving recommendations require >= 3
// distinct organization domains. Previously this set excluded Mobile and
// AI-Aesthetic — that exemption was a hole the adversary review caught. The
// rule applies uniformly now: any row with Recommended != Current AND
// Recommended != "no change" / "designer-call" must cite >= 3 distinct domains.
const TOKEN_DRIVING_SECTIONS = new Set<string>(REQUIRED_SECTIONS);

// Source-id resolver: source-ids of the form "S1", "S22" in the Sources column
// resolve to URLs in the Appendix A register. The register is parsed once per
// test run; if the doc renames its appendix or changes the source-id format,
// update SOURCE_ID_RE and the appendix-finder block below.
const SOURCE_ID_RE = /\bS(\d{1,3})\b/g;
const APPENDIX_LINE_RE = /^-\s*\[S(\d{1,3})\]\s+.+?—\s+([^—\n]+?)\s+—\s+(https?:\/\/\S+)/;

function buildSourceIdMap(markdown: string): Map<string, string> {
	const map = new Map<string, string>();
	const lines = markdown.split(/\r?\n/);
	for (const line of lines) {
		const m = line.match(APPENDIX_LINE_RE);
		if (m) map.set(`S${m[1]}`, m[3]);
	}
	return map;
}

function resolveSourceIds(cell: string, idMap: Map<string, string>): string[] {
	const urls: string[] = [];
	const matches = cell.matchAll(SOURCE_ID_RE);
	for (const m of matches) {
		const url = idMap.get(`S${m[1]}`);
		if (url) urls.push(url);
	}
	return urls;
}

type Section = {
	title: string;
	body: string;
};

type Table = {
	headers: string[];
	rows: string[][];
};

function readAesthetics(): string {
	if (!existsSync(AESTHETICS_PATH)) {
		throw new Error(
			`AESTHETICS.md not found at ${AESTHETICS_PATH}. ` +
				`This is K1's primary deliverable — see docs/work-packages/TRACK-K.md story K1.`,
		);
	}
	return readFileSync(AESTHETICS_PATH, "utf-8");
}

/**
 * Parse top-level H2 sections (`## Title`). Body of a section is everything
 * between its heading and the next H2 (or EOF). Headings inside fenced code
 * blocks are ignored.
 */
function parseSections(markdown: string): Section[] {
	const lines = markdown.split(/\r?\n/);
	const sections: Section[] = [];
	let current: Section | null = null;
	let inFence = false;
	const bodyLines: string[] = [];

	const flush = (): void => {
		if (current) {
			current.body = bodyLines.join("\n");
			sections.push(current);
		}
	};

	for (const line of lines) {
		if (/^```/.test(line)) {
			inFence = !inFence;
			if (current) bodyLines.push(line);
			continue;
		}
		if (!inFence) {
			const h2 = line.match(/^##\s+(.+?)\s*$/);
			if (h2) {
				flush();
				current = { title: h2[1].trim(), body: "" };
				bodyLines.length = 0;
				continue;
			}
		}
		if (current) bodyLines.push(line);
	}
	flush();
	return sections;
}

function findSection(sections: Section[], wanted: string): Section | undefined {
	const w = wanted.toLowerCase();
	return sections.find((s) => s.title.toLowerCase() === w);
}

/**
 * Strip a single leading and trailing `|` and split on unescaped `|`. A pipe
 * preceded by a backslash (`\|`) is treated as literal content and does not
 * split the row — this matches GitHub-flavoured Markdown table semantics so
 * that `regex: /\b(p\|m)\b/` inside a Lint hint cell does not bleed into a
 * spurious extra cell.
 */
function splitRow(row: string): string[] {
	const trimmed = row.trim().replace(/^\|/, "").replace(/\|$/, "");
	const cells: string[] = [];
	let buf = "";
	for (let i = 0; i < trimmed.length; i++) {
		const ch = trimmed[i];
		if (ch === "\\" && trimmed[i + 1] === "|") {
			buf += "|";
			i++;
			continue;
		}
		if (ch === "|") {
			cells.push(buf.trim());
			buf = "";
			continue;
		}
		buf += ch;
	}
	cells.push(buf.trim());
	return cells;
}

/** Read data rows starting at `start`, terminating on blank, fence, or no-pipe. */
function readDataRows(
	lines: string[],
	start: number,
	columnCount: number,
): { rows: string[][]; nextIdx: number } {
	const rows: string[][] = [];
	let j = start;
	while (j < lines.length) {
		const line = lines[j];
		if (line.trim().length === 0 || /^```/.test(line) || !line.includes("|")) break;
		const r = splitRow(line);
		while (r.length < columnCount) r.push("");
		rows.push(r);
		j++;
	}
	return { rows, nextIdx: j };
}

/** True if line+next look like a markdown table header followed by a separator row. */
function isTableStart(line: string, next: string | undefined): boolean {
	if (!next) return false;
	if (!line.includes("|")) return false;
	if (!/^\s*\|?\s*:?-{2,}/.test(next.trim())) return false;
	const sepCells = splitRow(next);
	return sepCells.length > 0 && sepCells.every((c) => /^:?-{2,}:?$/.test(c));
}

/**
 * Extract every markdown table from a chunk of text. A table is detected as
 * a header row followed by a separator row (`---|---|...`) followed by zero or
 * more data rows. Tables inside fenced code blocks are ignored.
 */
function parseTables(body: string): Table[] {
	const lines = body.split(/\r?\n/);
	const tables: Table[] = [];
	let inFence = false;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (/^```/.test(line)) {
			inFence = !inFence;
			continue;
		}
		if (inFence) continue;
		const next = lines[i + 1];
		if (!isTableStart(line, next)) continue;
		const headers = splitRow(line);
		const sepCells = splitRow(next ?? "");
		if (headers.length === 0 || headers.length !== sepCells.length) continue;
		const { rows, nextIdx } = readDataRows(lines, i + 2, headers.length);
		tables.push({ headers, rows });
		i = nextIdx - 1;
	}
	return tables;
}

function tableHasRequiredColumns(table: Table): boolean {
	if (table.headers.length < REQUIRED_COLUMNS.length) return false;
	for (let i = 0; i < REQUIRED_COLUMNS.length; i++) {
		if (table.headers[i].trim().toLowerCase() !== REQUIRED_COLUMNS[i].toLowerCase()) {
			return false;
		}
	}
	return true;
}

function findRecommendationsTable(section: Section): Table | undefined {
	return parseTables(section.body).find(tableHasRequiredColumns);
}

function getCell(table: Table, row: string[], header: string): string {
	const idx = table.headers.findIndex((h) => h.trim().toLowerCase() === header.toLowerCase());
	if (idx === -1) return "";
	return row[idx] ?? "";
}

function extractUrls(cell: string): string[] {
	const re = /https?:\/\/[^\s)\]|<>"]+/g;
	return cell.match(re) ?? [];
}

function extractDomain(url: string): string {
	const stripped = url.replace(/^https?:\/\/(?:www\.)?/i, "");
	const host = stripped.split("/")[0] ?? "";
	return host.toLowerCase();
}

function distinctDomains(urls: string[]): Set<string> {
	const set = new Set<string>();
	for (const u of urls) {
		const d = extractDomain(u);
		if (d) set.add(d);
	}
	return set;
}

/** Per-row checks for Gate 5. Returns failure messages (empty array if OK). */
function checkRecommendationRow(
	sectionName: string,
	table: Table,
	row: string[],
	rIdx: number,
	sourceIdMap: Map<string, string>,
): string[] {
	const failures: string[] = [];
	const token = getCell(table, row, "Token") || `row#${rIdx}`;
	const sources = getCell(table, row, "Sources");
	const lintable = getCell(table, row, "Lintable").toLowerCase();
	const rationale = getCell(table, row, "Rationale");

	const inlineUrls = extractUrls(sources);
	const resolvedUrls = resolveSourceIds(sources, sourceIdMap);
	if (inlineUrls.length === 0 && resolvedUrls.length === 0) {
		failures.push(
			`[${sectionName}] row "${token}": Sources cell has no URL or recognised source-id ("${sources}")`,
		);
	}
	if (!["yes", "no", "partial"].includes(lintable)) {
		failures.push(
			`[${sectionName}] row "${token}": Lintable must be yes/no/partial, got "${lintable}"`,
		);
		return failures;
	}
	if (lintable === "yes" || lintable === "partial") {
		const lintHintIdx = table.headers.findIndex((h) => h.trim().toLowerCase() === "lint hint");
		const lintHintCell = lintHintIdx !== -1 ? (row[lintHintIdx] ?? "").trim() : "";
		const trailing = row.slice(REQUIRED_COLUMNS.length).join(" ");
		const hintHaystack = `${rationale} ${trailing}`;
		const hasInlineHint = /\bregex:/i.test(hintHaystack) || /\bast:/i.test(hintHaystack);
		if (!(lintHintCell || hasInlineHint)) {
			failures.push(
				`[${sectionName}] row "${token}": Lintable=${lintable} requires a non-empty "Lint hint" column or an inline regex:/ast: token in Rationale or trailing cells`,
			);
		}
	}
	return failures;
}

/** Per-row checks for Gate 6. Returns failure message or null if OK / not applicable. */
function checkTokenDrivingRow(
	sectionName: string,
	table: Table,
	row: string[],
	rIdx: number,
	sourceIdMap: Map<string, string>,
): string | null {
	const token = getCell(table, row, "Token") || `row#${rIdx}`;
	const current = getCell(table, row, "Current value").trim();
	const recommended = getCell(table, row, "Recommended value").trim();
	if (!recommended) return null;
	if (recommended === current) return null;
	if (/^no change\b/i.test(recommended)) return null;
	// `(designer-call)` is a deliberate stance that admits research did not
	// converge on a single value — it is its own resolution category and is
	// exempt from the >=3 distinct-domain rule. The Rationale must still cite
	// sources for the cluster the call sits inside; Gate 5 enforces non-empty
	// sources separately.
	if (/\(designer-call\)/i.test(recommended)) return null;
	const sourcesCell = getCell(table, row, "Sources");
	const inlineUrls = extractUrls(sourcesCell);
	const resolvedUrls = resolveSourceIds(sourcesCell, sourceIdMap);
	const allUrls = [...inlineUrls, ...resolvedUrls];
	const domains = distinctDomains(allUrls);
	if (domains.size >= 3) return null;
	return (
		`[${sectionName}] row "${token}" recommends "${recommended}" (was "${current}") ` +
		`but cites only ${domains.size} distinct domain(s): [${Array.from(domains).join(", ")}]. ` +
		`The K1 plan requires >=3 distinct organization domains for token-driving recommendations ` +
		`(or the (designer-call) tag, which exempts the row but must be in the Recommended cell).`
	);
}

describe("K1 AESTHETICS.md contract", () => {
	// Gate 1: file exists.
	it("Gate 1: AESTHETICS.md exists at packages/design-system/AESTHETICS.md", () => {
		expect(existsSync(AESTHETICS_PATH), `AESTHETICS.md missing at ${AESTHETICS_PATH}`).toBe(true);
	});

	// Gate 2: preamble names recommendations table as source of truth for K7.
	it('Gate 2: starts with a "How to read this document" preamble naming the recommendations table as the source of truth for K7', () => {
		const md = readAesthetics();
		const lower = md.toLowerCase();
		const preambleIdx = lower.indexOf("how to read this document");
		expect(
			preambleIdx,
			`Missing "How to read this document" preamble in ${AESTHETICS_PATH}`,
		).toBeGreaterThanOrEqual(0);

		// Must appear before any topic H2 to qualify as a preamble.
		const sections = parseSections(md);
		const firstTopic = sections.find((s) =>
			REQUIRED_SECTIONS.some((r) => r.toLowerCase() === s.title.toLowerCase()),
		);
		const firstTopicIdx = firstTopic ? lower.indexOf(`## ${firstTopic.title.toLowerCase()}`) : -1;
		if (firstTopicIdx >= 0) {
			expect(
				preambleIdx,
				`Preamble must appear before the first topic section ("${firstTopic?.title}")`,
			).toBeLessThan(firstTopicIdx);
		}

		// Within a 2000-char window of the preamble, must mention both
		// "recommendations table" and "K7" and "source of truth".
		const window = md.slice(preambleIdx, preambleIdx + 2000).toLowerCase();
		expect(
			window.includes("recommendations table"),
			'Preamble must mention "recommendations table"',
		).toBe(true);
		expect(window.includes("source of truth"), 'Preamble must mention "source of truth"').toBe(
			true,
		);
		expect(window.includes("k7"), "Preamble must explicitly name K7 as the consumer").toBe(true);
	});

	// Gate 3: required H2 sections all present.
	it("Gate 3: all 7 required top-level sections exist (case-insensitive H2 match)", () => {
		const sections = parseSections(readAesthetics());
		const missing = REQUIRED_SECTIONS.filter((r) => !findSection(sections, r));
		expect(
			missing,
			`Missing top-level sections in ${AESTHETICS_PATH}: ${missing.join(", ")}`,
		).toEqual([]);
	});

	// Gate 4: each section contains a recommendations table with required columns.
	it("Gate 4: each required section contains a recommendations table with required columns in order", () => {
		const sections = parseSections(readAesthetics());
		const failures: string[] = [];
		for (const name of REQUIRED_SECTIONS) {
			const sec = findSection(sections, name);
			if (!sec) {
				failures.push(`section "${name}" missing entirely`);
				continue;
			}
			const tables = parseTables(sec.body);
			if (tables.length === 0) {
				failures.push(`section "${name}" has no markdown tables at all`);
				continue;
			}
			const ok = tables.some(tableHasRequiredColumns);
			if (!ok) {
				const headerSummaries = tables
					.map((t, i) => `  table#${i}: [${t.headers.join(" | ")}]`)
					.join("\n");
				failures.push(
					`section "${name}" has no table with required columns ` +
						`[${REQUIRED_COLUMNS.join(", ")}]. Found tables:\n${headerSummaries}`,
				);
			}
		}
		expect(failures, failures.join("\n")).toEqual([]);
	});

	// Gate 5: every data row has at least one URL in Sources, valid Lintable
	// value, and (for yes/partial) a non-empty Lint hint or inline regex:/ast:.
	it("Gate 5: every recommendation row has Sources URL(s), valid Lintable value, and a Lint hint when applicable", () => {
		const md = readAesthetics();
		const sourceIdMap = buildSourceIdMap(md);
		const sections = parseSections(md);
		const failures: string[] = [];
		for (const name of REQUIRED_SECTIONS) {
			const sec = findSection(sections, name);
			if (!sec) continue;
			const table = findRecommendationsTable(sec);
			if (!table) continue;
			for (const [rIdx, row] of table.rows.entries()) {
				failures.push(...checkRecommendationRow(name, table, row, rIdx, sourceIdMap));
			}
		}
		expect(failures, failures.join("\n")).toEqual([]);
	});

	// Gate 6: token-driving rows (Recommended != Current AND Recommended !=
	// "no change" / "(designer-call)") in EVERY required section cite >= 3
	// distinct organization domains. Source-ids ("S1", "S22") in the Sources
	// column resolve to URLs in Appendix A. Mobile and AI-Aesthetic sections
	// were previously exempt — that exemption was a hole the adversary review
	// caught and is now closed.
	it("Gate 6: token-driving rows in EVERY section cite >= 3 distinct source domains (designer-call rows are exempt)", () => {
		const md = readAesthetics();
		const sourceIdMap = buildSourceIdMap(md);
		const sections = parseSections(md);
		const failures: string[] = [];
		for (const name of REQUIRED_SECTIONS) {
			if (!TOKEN_DRIVING_SECTIONS.has(name)) continue;
			const sec = findSection(sections, name);
			if (!sec) continue;
			const table = findRecommendationsTable(sec);
			if (!table) continue;
			for (const [rIdx, row] of table.rows.entries()) {
				const msg = checkTokenDrivingRow(name, table, row, rIdx, sourceIdMap);
				if (msg) failures.push(msg);
			}
		}
		expect(failures, failures.join("\n")).toEqual([]);
	});

	// Gate 7: Typography section explicitly addresses body/heading bump verdict.
	it('Gate 7: Typography section addresses body/heading bump (mentions "body" or "heading" near bump/increase/decrease/no change)', () => {
		const sections = parseSections(readAesthetics());
		const sec = findSection(sections, "Typography");
		expect(sec, "Typography section missing").toBeDefined();
		if (!sec) return;
		const body = sec.body.toLowerCase();
		const verdictRe = /\b(bump|increase|decrease|no change)\b/g;
		let found = false;
		let match: RegExpExecArray | null = verdictRe.exec(body);
		while (match) {
			const start = Math.max(0, match.index - 200);
			const end = Math.min(body.length, match.index + match[0].length + 200);
			const window = body.slice(start, end);
			if (/\bbody\b/.test(window) || /\bheading\b/.test(window)) {
				found = true;
				break;
			}
			match = verdictRe.exec(body);
		}
		expect(
			found,
			'Typography section must explicitly answer the body/heading bump question (mention "body" or "heading" within ~200 chars of "bump"/"increase"/"decrease"/"no change")',
		).toBe(true);
	});

	// Gate 8: Mobile & Touch section names a numeric breakpoint and density mode.
	it("Gate 8: Mobile & Touch section names a numeric breakpoint (e.g., 768px) AND a density mode word", () => {
		const sections = parseSections(readAesthetics());
		const sec = findSection(sections, "Mobile & Touch");
		expect(sec, "Mobile & Touch section missing").toBeDefined();
		if (!sec) return;
		const body = sec.body;
		const hasBreakpoint = /\d{3,4}\s*px/.test(body);
		const hasDensityWord = /\b(density|comfortable|compact|default)\b/i.test(body);
		expect(
			hasBreakpoint,
			'Mobile & Touch section must name a numeric breakpoint matching /\\d{3,4}\\s*px/ (e.g., "768 px")',
		).toBe(true);
		expect(
			hasDensityWord,
			'Mobile & Touch section must mention one of: "density", "comfortable", "compact", "default"',
		).toBe(true);
	});

	// Gate 9: AI-Aesthetic Anti-Patterns section has a list with >= 5 items.
	it("Gate 9: AI-Aesthetic Anti-Patterns section contains a markdown list with at least 5 items", () => {
		const sections = parseSections(readAesthetics());
		const sec = findSection(sections, "AI-Aesthetic Anti-Patterns");
		expect(sec, "AI-Aesthetic Anti-Patterns section missing").toBeDefined();
		if (!sec) return;
		// Count contiguous bullet-list lines anywhere in the section. The longest
		// contiguous run is what we care about — a single list of >= 5 items.
		const lines = sec.body.split(/\r?\n/);
		let inFence = false;
		let longestRun = 0;
		let currentRun = 0;
		for (const line of lines) {
			if (/^```/.test(line)) {
				inFence = !inFence;
				currentRun = 0;
				continue;
			}
			if (inFence) continue;
			if (/^\s*(?:[-*+]|\d+\.)\s+\S/.test(line)) {
				currentRun++;
				if (currentRun > longestRun) longestRun = currentRun;
			} else if (line.trim() === "") {
				// Blank lines inside a list still keep run alive in markdown,
				// but for our crude check we tolerate one blank without breaking.
				// Reset only on a non-blank, non-list line.
			} else {
				currentRun = 0;
			}
		}
		expect(
			longestRun,
			`AI-Aesthetic Anti-Patterns section must contain a list with >= 5 items (longest run found: ${longestRun})`,
		).toBeGreaterThanOrEqual(5);
	});

	// Gate 10: each per-topic research file exists and is non-empty (> 500 chars).
	it("Gate 10: every expected per-topic research report exists under packages/design-system/research/ and is > 500 chars", () => {
		const failures: string[] = [];
		for (const file of EXPECTED_RESEARCH_FILES) {
			const path = resolve(RESEARCH_DIR, file);
			if (!existsSync(path)) {
				failures.push(`missing: ${path}`);
				continue;
			}
			const content = readFileSync(path, "utf-8");
			if (content.length <= 500) {
				failures.push(`too short (<= 500 chars, got ${content.length}): ${path}`);
			}
		}
		expect(failures, failures.join("\n")).toEqual([]);
	});
});
