#!/usr/bin/env node
/**
 * Frame 2 of the transaction-threading audit.
 *
 * `find-tx-threaded-calls.mjs` answers "which calls get the transaction handle
 * as their first argument". That is one frame. A callee can take the handle and
 * pass it on again, so a seam call can sit one frame further down. This script
 * checks that second frame mechanically, in two parts.
 *
 * PART 1 — which files can reach agent-orchestration at all.
 *   Every production file under `layers/core-api/` that imports an
 *   agent-orchestration package. If that set is entirely inside
 *   `layers/core-api/src/`, then no core service package (`work/`, `policy/`,
 *   `routine/`, `review/`, `knowledge/`, `users/`, `settings/`, `org/`) can
 *   name an orchestration function at all — it can only reach the seam through
 *   a function handed to it, which is the injected-port case Part 2 lists.
 *   Hard-fails if the scan finds nothing (a guard matching zero files reads as
 *   passing forever).
 *
 * PART 2 — the onward hop, per callee.
 *   Reads the recorded `output.txt`, takes every callee the first frame
 *   reported, and splits it:
 *     - a plain name (`resolveRoutineRunRequest`) is resolved to its production
 *       definition and its body is re-scanned with the same rule — every call
 *       whose first argument is that function's own executor parameter. Those
 *       are the frame-2 calls, printed for the reader to judge.
 *     - a dotted expression (`deps.workIntents.record`) has no definition to
 *       find by name; it is listed as needing the composition root, which is
 *       the manual resolution step the README already describes and §3.1
 *       records per site.
 *
 * Run from the repository root:
 *   node .pipeline/work/AU31/probes/p3b-transaction-threading/find-frame2-forwarding.mjs
 *
 * Recorded run: `frame2-output.txt`. Written-up verdict: `frame2.md`.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const HERE = dirname(new URL(import.meta.url).pathname);

const ORCHESTRATION_PACKAGES = [
	"agent-orchestration",
	"agent-run-config",
	"connections",
	"filesystem-mounting",
	"filesystems",
	"run-orchestration",
	"session-requests",
	"tool-handlers",
];

const PRODUCTION_GLOBS = [
	"--glob",
	"!**/node_modules/**",
	"--glob",
	"!**/__*/**",
	"--glob",
	"!*.test.ts",
	"--glob",
	"!*.test.tsx",
	"--glob",
	"!*.spec.ts",
];

function rg(args) {
	try {
		return execFileSync("rg", args, { encoding: "utf8" }).trim();
	} catch (err) {
		// rg exits 1 on "no matches"; anything else is a real failure.
		if (err.status === 1) return "";
		throw err;
	}
}

function lineOf(src, idx) {
	return src.slice(0, idx).split("\n").length;
}

// ---------------------------------------------------------------------------
// PART 1 — who can name an orchestration function
// ---------------------------------------------------------------------------

const importPattern = `from "@hyperidle/(${ORCHESTRATION_PACKAGES.join("|")})`;
const seamImporters = rg(["-l", ...PRODUCTION_GLOBS, importPattern, "layers/core-api"])
	.split("\n")
	.filter(Boolean)
	.sort();

if (seamImporters.length === 0) {
	throw new Error(
		"PART 1 scan matched zero files. Either the package list is stale or the glob is wrong — " +
			"a zero-match scan must fail, not report a clean result.",
	);
}

const outsideSrc = seamImporters.filter((f) => !f.startsWith("layers/core-api/src/"));

console.log("== PART 1 — production core-api files that import an agent-orchestration package ==");
for (const f of seamImporters) console.log(`  ${f}`);
console.log(`\n  ${seamImporters.length} files.`);
console.log(
	outsideSrc.length === 0
		? "  All inside layers/core-api/src/. No core SERVICE package names an orchestration\n" +
				"  function, so a service package reaches the seam only through an injected port."
		: `  ${outsideSrc.length} OUTSIDE layers/core-api/src/ — check each:\n${outsideSrc
				.map((f) => `    ${f}`)
				.join("\n")}`,
);

// ---------------------------------------------------------------------------
// PART 2 — the onward hop for every callee frame 1 reported
// ---------------------------------------------------------------------------

const recorded = readFileSync(join(HERE, "output.txt"), "utf8");
const callees = new Set();
for (const line of recorded.split("\n")) {
	const m = line.match(/^\s+\d+:\s+([\w$.]+)\(/);
	if (m) callees.add(m[1]);
}

const plain = [...callees].filter((c) => !c.includes(".")).sort();
const dotted = [...callees].filter((c) => c.includes(".")).sort();

const CALL = /(?:^|[^\w.$])((?:[A-Za-z_$][\w$]*)(?:\s*\.\s*[A-Za-z_$][\w$]*)*)\s*\(/g;

/** Locates a production definition `export? (async)? function NAME(` or `const NAME = (async)? (`. */
function findDefinition(name) {
	const pattern = `(function ${name}\\(|const ${name}\\s*=\\s*(async\\s*)?\\()`;
	const hit = rg(["-n", ...PRODUCTION_GLOBS, pattern, "layers", "framework", "applications"]);
	return hit
		.split("\n")
		.filter(Boolean)
		.map((l) => {
			const [file, lineNo] = l.split(":");
			return { file, line: Number(lineNo) };
		});
}

/**
 * A callee can be an import alias (`import { create as createKnowledgeItem }`),
 * in which case no definition carries the local name. Returns the original
 * names the alias could stand for.
 */
function aliasOrigins(name) {
	const hit = rg(["-n", ...PRODUCTION_GLOBS, `\\bas ${name}\\b`, "layers", "framework", "applications"]);
	const origins = new Set();
	for (const line of hit.split("\n").filter(Boolean)) {
		const m = line.match(/([A-Za-z_$][\w$]*)\s+as\s+/);
		if (m) origins.add(m[1]);
	}
	return [...origins];
}

/**
 * Body of the function whose signature starts at `sigIdx`, brace-matched from
 * the first `{` after the parameter list closes, plus the first parameter name.
 */
function bodyOf(src, sigIdx) {
	const open = src.indexOf("(", sigIdx);
	if (open === -1) return null;
	let d = 0;
	let close = -1;
	for (let i = open; i < src.length; i++) {
		const ch = src[i];
		if (ch === "(") d++;
		else if (ch === ")") {
			d--;
			if (d === 0) {
				close = i;
				break;
			}
		}
	}
	if (close === -1) return null;
	const params = src.slice(open + 1, close);
	const firstParam = (params.split(",")[0] ?? "").trim().split(":")[0].replace(/^\.\.\./, "").trim();
	const braceStart = src.indexOf("{", close);
	if (braceStart === -1 || !firstParam) return null;
	let depth = 0;
	let end = braceStart;
	for (let i = braceStart; i < src.length; i++) {
		const ch = src[i];
		if (ch === "{") depth++;
		else if (ch === "}") {
			depth--;
			if (depth === 0) {
				end = i;
				break;
			}
		}
	}
	return { firstParam, body: src.slice(braceStart, end), bodyStart: braceStart };
}

/** Every call inside `body` whose first argument is `param` (bare or `as`-cast) or a local alias. */
function forwardedCalls(src, body, bodyStart, param) {
	const aliases = new Set([param]);
	const aliasRe = new RegExp(
		`(?:const|let)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*(?:${param})(?:\\s+as\\s+[\\w.<>[\\]]+)?\\s*;`,
		"g",
	);
	let a;
	while ((a = aliasRe.exec(body)) !== null) aliases.add(a[1]);

	const hits = [];
	CALL.lastIndex = 0;
	let c;
	while ((c = CALL.exec(body)) !== null) {
		const callee = c[1].replace(/\s+/g, "");
		const open = body.indexOf("(", c.index + c[0].length - 1);
		if (open === -1) continue;
		let d = 0;
		let arg = "";
		for (let i = open; i < body.length; i++) {
			const ch = body[i];
			if (ch === "(" || ch === "[" || ch === "{") d++;
			else if (ch === ")" || ch === "]" || ch === "}") {
				d--;
				if (d === 0) break;
			} else if (ch === "," && d === 1) break;
			if (d >= 1 && i !== open) arg += ch;
		}
		const bare = arg
			.trim()
			.replace(/\s+as\s+[\w.<>[\]]+$/, "")
			.trim();
		if (aliases.has(bare)) hits.push({ callee, line: lineOf(src, bodyStart + c.index) });
	}
	return hits;
}

console.log(
	`\n== PART 2 — onward hop for the ${callees.size} callees frame 1 reported ` +
		`(${plain.length} by name, ${dotted.length} injected) ==`,
);

for (const name of plain) {
	let defs = findDefinition(name);
	let via = "";
	if (defs.length === 0) {
		// Try the import-alias spelling before giving up.
		const origins = aliasOrigins(name);
		for (const origin of origins) {
			const originDefs = findDefinition(origin);
			if (originDefs.length > 0) {
				defs = originDefs;
				via = ` (import alias of \`${origin}\`)`;
				break;
			}
		}
	}
	if (defs.length === 0) {
		console.log(`\n${name} — NO production definition found by name or alias; resolve by hand.`);
		continue;
	}
	for (const def of defs) {
		const src = readFileSync(def.file, "utf8");
		const lines = src.split("\n");
		const sigIdx = lines.slice(0, def.line - 1).join("\n").length + 1;
		const parsed = bodyOf(src, sigIdx);
		if (!parsed) {
			console.log(`\n${name} (${def.file}:${def.line}) — body not parsed; read by hand.`);
			continue;
		}
		const hits = forwardedCalls(src, parsed.body, parsed.bodyStart, parsed.firstParam);
		console.log(
			`\n${name}${via} (${def.file}:${def.line}) executor="${parsed.firstParam}" — ` +
				`${hits.length} onward call(s) receiving it`,
		);
		for (const h of hits) console.log(`    ${h.line}: ${h.callee}(${parsed.firstParam}, …)`);
	}
}

console.log("\n-- injected callees: no definition by name; resolved at the composition root --");
for (const name of dotted) console.log(`  ${name}`);
