#!/usr/bin/env node
/**
 * Transaction-threading audit: name-independent.
 *
 * Step 1: every production `.transaction(` in the shipping roots.
 * Step 2: for each, brace-match the callback body.
 * Step 3: inside the body, every call expression whose FIRST argument is the tx
 *         binding (bare, aliased via `as`, or a local alias assigned from it).
 * Step 4: print callee expression text -> a human resolves the callee's package.
 *
 * This finds injected/generic spellings (`deps.a.b(tx, …)`) because it keys on
 * the tx handle reaching a call, never on the callee's name.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const roots = ["layers", "framework", "applications"];
const files = execFileSync(
	"rg",
	["-l", "--glob", "!**/node_modules/**", "--glob", "!**/__*/**", "--glob", "!*.test.ts", "--glob", "!*.test.tsx", "--glob", "!*.spec.ts", "\\.transaction\\(", ...roots],
	{ encoding: "utf8" },
)
	.trim()
	.split("\n")
	.filter(Boolean);

const CALL = /(?:^|[^\w.$])((?:[A-Za-z_$][\w$]*)(?:\s*\.\s*[A-Za-z_$][\w$]*)*)\s*\(/g;

function lineOf(src, idx) {
	return src.slice(0, idx).split("\n").length;
}

let total = 0;
for (const file of files) {
	const src = readFileSync(file, "utf8");
	const re = /\.transaction\(\s*(?:async\s*)?\(\s*([A-Za-z_$][\w$]*)/g;
	let m;
	while ((m = re.exec(src)) !== null) {
		const txName = m[1];
		// brace-match from the callback's opening brace
		const arrow = src.indexOf("=>", re.lastIndex);
		const braceStart = arrow === -1 ? -1 : src.indexOf("{", arrow);
		if (braceStart === -1) continue;
		if (src.slice(arrow + 2, braceStart).trim() !== "") {
			console.log(`\n${file}:${lineOf(src, m.index)}  EXPRESSION-BODY callback — manual read required`);
			continue;
		}
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
		const body = src.slice(braceStart, end + 1);
		const bodyStart = braceStart;
		// aliases: const X = tx as HyperIdleDb / const X = tx
		const aliases = new Set([txName]);
		const aliasRe = new RegExp(
			`(?:const|let)\\s+([A-Za-z_$][\\w$]*)\\s*(?::[^=]+)?=\\s*${txName}\\b`,
			"g",
		);
		let a;
		while ((a = aliasRe.exec(body)) !== null) aliases.add(a[1]);

		const hits = [];
		CALL.lastIndex = 0;
		let c;
		while ((c = CALL.exec(body)) !== null) {
			const callee = c[1].replace(/\s+/g, "");
			if (/^(if|for|while|switch|catch|return|await|function|typeof|new|JSON|Object|Array|String|Number|Boolean|Promise|Math|Date)$/.test(callee)) continue;
			// first argument text: up to the first top-level comma
			const open = body.indexOf("(", c.index + c[0].length - 1);
			let d = 0;
			let arg = "";
			for (let i = open; i < body.length; i++) {
				const ch = body[i];
				if (ch === "(" || ch === "[" || ch === "{") d++;
				else if (ch === ")" || ch === "]" || ch === "}") {
					d--;
					if (d === 0) break;
				} else if (ch === "," && d === 1) break;
				if (d >= 1 && !(i === open)) arg += ch;
			}
			const first = arg.trim();
			const bare = first.replace(/\s+as\s+[\w.<>[\]]+$/, "").trim();
			if (aliases.has(bare)) {
				hits.push({ callee, line: lineOf(src, bodyStart + c.index) });
			}
		}
		if (hits.length) {
			total++;
			console.log(`\n${file}:${lineOf(src, m.index)}  tx="${txName}" aliases=[${[...aliases].join(",")}]`);
			for (const h of hits) console.log(`    ${h.line}: ${h.callee}(${txName}, …)`);
		}
	}
}
console.error(`\n-- ${files.length} files scanned, ${total} transaction bodies with tx-threaded calls --`);
