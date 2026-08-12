// Renders .pipeline/work/AZ7/migration-backlog.md from a predicates.mjs scan.
//
// Usage (from repo root):
//   node .pipeline/work/AZ7/measurement/predicates.mjs "$PWD" /tmp/az7-after
//   node .pipeline/work/AZ7/measurement/render-backlog.mjs /tmp/az7-after "$PWD"
//
// Reads predicate-sites.json's `controlChrome` and `handrolledChip` arrays
// (the broad, per-element predicates — not the narrower no-handrolled-control
// rule predicate), filters to layers/core-ui/ production files, and emits one
// bug-list item per file per axis in the shape .pipeline/AZ-bugs.md already
// uses. See plan.md §4.2 for why this exists and §4.1 for the
// scope line it enumerates the remainder of.
import { readFileSync, writeFileSync } from "node:fs";

const OUT_DIR = process.argv[2];
const ROOT = process.argv[3];
if (!OUT_DIR || !ROOT) throw new Error("usage: render-backlog.mjs <predicatesOutDir> <repoRoot>");
const data = JSON.parse(readFileSync(`${OUT_DIR}/predicate-sites.json`, "utf8"));

const isProd = (rel) =>
	(rel.startsWith("layers/") || rel.startsWith("framework/") || rel.startsWith("applications/")) &&
	!/\.(test|stories|spec)\.tsx$/.test(rel) &&
	!rel.split("/").some((s) => s.startsWith("__"));
const isCoreUi = (rel) => rel.startsWith("layers/core-ui/");

// ---- axis 1: remaining hand-rolled controls (core-ui only; design-system is
// out of no-handrolled-control's scope by design — Trade-off 4) ------------
const controlSites = data.controlChrome.filter((s) => isProd(s.file) && isCoreUi(s.file));
const controlByFile = new Map();
for (const s of controlSites) {
	if (!controlByFile.has(s.file)) controlByFile.set(s.file, []);
	controlByFile.get(s.file).push(s);
}

// ---- axis 2: hand-rolled chips (pill + fill, non-DS-chip element) --------
const chipSites = data.handrolledChip.filter((s) => isProd(s.file) && isCoreUi(s.file));
const chipByFile = new Map();
for (const s of chipSites) {
	if (!chipByFile.has(s.file)) chipByFile.set(s.file, []);
	chipByFile.get(s.file).push(s);
}

// Dedup against AZ-bugs.md Batch D — sites already tracked under an existing
// UI-### get referenced, not re-filed.
const KNOWN = {
	"layers/core-ui/src/pages/review/ReviewComposition.tsx":
		"UI-062 (the review-thread composer is one of the three UI-062 unifies) and UI-074 (the verdict overflow menu bypasses DS Menu)",
	"layers/core-ui/src/shell/HostThreadSection.tsx":
		"UI-062 (task/knowledge/artifact composer — 'bare input + text Send')",
	"layers/core-ui/src/components/ConversationSurface.tsx":
		"UI-062 (the conversation composer — 'textarea + attach + icon send')",
};

let id = 180;
const lines = [];
lines.push("# AZ7 migration backlog — remaining hand-rolled control/chip sites");
lines.push("");
lines.push(
	"Meant to fold into `.pipeline/AZ-bugs.md` (Batch D — \"adopt the primitives that already exist\"), " +
		"continuing its numbering from UI-172. AZ7 closed radii, inputs and status fully, and buttons " +
		"partly (the 63-site DaisyUI + accent-fill union) — see `.pipeline/work/AZ7/plan.md` " +
		"§4.1. Everything below is the declared-out-of-scope remainder: hand-rolled buttons with " +
		"token-legal chrome (no DaisyUI class, no accent/status fill) and hand-rolled chips (pill radius " +
		"+ a fill, not one of the design-system chip components).",
);
lines.push("");
lines.push(
	"**Sites already tracked under an existing Batch D id are referenced, not re-filed:** " +
		"UI-060 (`Row`'s button branch missing `w-full` — this is why several `no-handrolled-control` " +
		"exceptions AZ7 left in place cite it directly), UI-062 (three message composers), " +
		"UI-066 (two destructive button styles), UI-067 (disabled-primary opacity), " +
		"UI-074 (kebab bypasses `Menu`), UI-150 (the `ACTIVE` chip on every curated-knowledge row).",
);
lines.push("");
lines.push(
	"**Regenerate:** `node .pipeline/work/AZ7/measurement/predicates.mjs \"$PWD\" /tmp/az7-after && " +
		"node .pipeline/work/AZ7/measurement/render-backlog.mjs /tmp/az7-after \"$PWD\"`. The list cannot " +
		"drift from the code — it is a straight read of `predicate-sites.json`'s `controlChrome` and " +
		"`handrolledChip` arrays, filtered to `layers/core-ui/` production files. Re-running after any " +
		"future migration regenerates the whole file (item numbering will shift — that is expected).",
);
lines.push("");
lines.push("---");
lines.push("");
lines.push("## Hand-rolled buttons/inputs — token-legal chrome, no DaisyUI class, no accent/status fill");
lines.push("");
lines.push(
	"Each already passes `design/no-handrolled-control` (E2's honest boundary, plan.md §3.3: " +
		"\"a hand-rolled `<button>` with a token-legal fill in a page still passes E2 unless it uses an " +
		"accent/status fill or a DaisyUI class\"). Migrating to `Button`/`Input` is a look-alike, not a lint fix.",
);
lines.push("");
for (const [file, sites] of [...controlByFile.entries()].sort()) {
	const known = KNOWN[file];
	const lineNos = sites.map((s) => s.line).join(", ");
	const tags = [...new Set(sites.map((s) => s.tag))].join("/");
	if (known) {
		lines.push(
			`- [ ] **UI-${id++}** \`${file}\` — ${sites.length} hand-rolled \`<${tags}>\` site(s) at line(s) ${lineNos} · Already tracked: ${known} · Defer to that item, do not re-file.`,
		);
		continue;
	}
	const size = sites.length >= 4 ? "M" : "S";
	lines.push(
		`- [ ] **UI-${id++}** \`${file}\` — ${sites.length} hand-rolled \`<${tags}>\` site(s) at line(s) ${lineNos} · Now: token-legal chrome hand-rolled per element instead of a shared \`Button\`/\`Input\` recipe · Done: migrated to the design-system component; no visual regression · **${size}**`,
	);
}
lines.push("");
lines.push("## Hand-rolled chips — pill radius + a fill, not a design-system chip component");
lines.push("");
lines.push(
	"Set 1's \"not a button\" note and Set 5's status set don't cover \"a small pill-shaped label,\" which is " +
		"where these live — `StatusChip`/`Tag`/`ReferenceChip`/`ArtifactKindBadge` are the closed set for chip " +
		"*meaning*; these sites paint the same visual shape without going through any of them.",
);
lines.push("");
for (const [file, sites] of [...chipByFile.entries()].sort()) {
	const known = KNOWN[file];
	const lineNos = sites.map((s) => s.line).join(", ");
	if (known) {
		lines.push(
			`- [ ] **UI-${id++}** \`${file}\` — ${sites.length} hand-rolled chip-shaped element(s) at line(s) ${lineNos} · Already tracked: ${known} · Defer to that item, do not re-file.`,
		);
		continue;
	}
	const size = sites.length >= 4 ? "M" : "S";
	lines.push(
		`- [ ] **UI-${id++}** \`${file}\` — ${sites.length} hand-rolled chip-shaped element(s) (pill radius + fill) at line(s) ${lineNos} · Now: a bespoke pill, not one of \`Tag\`/\`ReferenceChip\`/\`ArtifactKindBadge\`/\`StatusChip\` · Done: adopts the matching chip primitive, or is confirmed not to be one of their jobs and left with a \`@lore\` note · **${size}**`,
	);
}
lines.push("");
lines.push("---");
lines.push("");
lines.push(
	`**Totals at generation time:** ${controlSites.length} hand-rolled control sites / ${controlByFile.size} files, ` +
		`${chipSites.length} hand-rolled chip sites / ${chipByFile.size} files (core-ui production only; ` +
		"framework/design-system's own internals are excluded — building a primitive's chrome is not a violation " +
		"of the set it defines).",
);
lines.push("");

writeFileSync(`${ROOT}/.pipeline/work/AZ7/migration-backlog.md`, `${lines.join("\n")}\n`);
console.log("wrote migration-backlog.md:", id - 180, "items");
