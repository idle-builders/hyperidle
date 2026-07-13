#!/usr/bin/env tsx
/**
 * AU17 §7c/§9 package-boundary guard. Replaces au9-direct-handoff-guard.ts +
 * au11-runtime-ownership-guard.ts, both retired: their premise (a hand-typed
 * allowlist of agent-owned files inside a single shared `packages/server/src`
 * tree) is gone now that `@hyperidle/core-app` and `@hyperidle/agent-layer`
 * are real workspace packages — the core→harness invariant they encoded is
 * now *stronger* and enforced by `tsc` itself (core-app cannot import
 * agent-layer at all; see the AC-2 fixture below).
 *
 * Three checks:
 *  (a) au9/au11 are actually gone — a `.ts` allowlist guard reappearing would
 *      mean someone re-introduced the very allowlist pattern this WP replaced.
 *  (b) no `app-runtime/` path segment, no `bootstrapAppRuntime` symbol, no
 *      `./app-runtime` package export, across all three packages (server,
 *      core-app, agent-layer) — carried over from au11 AC-1, generalized to
 *      the new package roots.
 *  (c) `packages/agent-layer/src/routines.ts` — the curated cross-package
 *      export for `@hyperidle/eval` — re-exports EXACTLY
 *      {checkAndFireRoutine, provisionTeamRoutines, runBuiltinRoutine},
 *      never regrowing into a general barrel (carried over from au11 AC-1).
 *
 * `--fixtures` self-tests (a)+(b)+(c) with synthetic inputs (au11-style). The
 * AC-2 "unexported deep import fails typecheck" proof (§9) is a SEPARATE,
 * slower proof — `--ac2-fixture` — because it shells out to `tsc`.
 */
import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative } from "node:path";
import ts from "typescript";

interface Finding {
	readonly file: string;
	readonly reason: string;
}

const PACKAGE_ROOTS = ["packages/server", "packages/core-app", "packages/agent-layer"] as const;
const RETIRED_GUARD_SCRIPTS = ["scripts/au9-direct-handoff-guard.ts", "scripts/au11-runtime-ownership-guard.ts"];
const ROUTINES_TS = "packages/agent-layer/src/routines.ts";
const BOOTSTRAP_SYMBOL = "bootstrapAppRuntime";

function walk(dir: string): string[] {
	if (!existsSync(dir)) return [];
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === "node_modules" || entry.name === "dist") continue;
		const full = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...walk(full));
		else if ([".ts", ".tsx"].includes(extname(entry.name))) out.push(full);
	}
	return out;
}

function productionFile(rel: string): boolean {
	return !rel.includes("/__tests__/") && !/\.(?:test|spec)\.tsx?$/.test(rel) && !rel.includes(".integration.test.");
}

export function inspect(root: string): Finding[] {
	const findings: Finding[] = [];

	// (a) au9/au11 must be gone.
	for (const scriptPath of RETIRED_GUARD_SCRIPTS) {
		if (existsSync(join(root, scriptPath))) {
			findings.push({
				file: scriptPath,
				reason: "retired allowlist guard must not be reintroduced — the real package boundary replaces it (AU17)",
			});
		}
	}

	// (b) no app-runtime/ resurrection, no bootstrapAppRuntime, no ./app-runtime export.
	for (const pkgRoot of PACKAGE_ROOTS) {
		const srcFiles = walk(join(root, pkgRoot, "src")).filter((abs) =>
			productionFile(relative(root, abs)),
		);
		for (const abs of srcFiles) {
			const rel = relative(root, abs).split("\\").join("/");
			if (rel.includes("app-runtime/")) {
				findings.push({ file: rel, reason: "app-runtime path segment must not exist (AU17/AC-1)" });
				continue;
			}
			const text = readFileSync(abs, "utf8");
			if (new RegExp(`\\b${BOOTSTRAP_SYMBOL}\\b`).test(text)) {
				const ast = ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, true);
				let usesSymbol = false;
				const visit = (node: ts.Node): void => {
					if (usesSymbol) return;
					if (ts.isIdentifier(node) && node.text === BOOTSTRAP_SYMBOL) {
						usesSymbol = true;
						return;
					}
					ts.forEachChild(node, visit);
				};
				visit(ast);
				if (usesSymbol) {
					findings.push({
						file: rel,
						reason: "bootstrapAppRuntime must not exist — retired app-runtime shell (AU17/AC-1)",
					});
				}
			}
		}

		const packageJsonPath = join(root, pkgRoot, "package.json");
		if (existsSync(packageJsonPath)) {
			const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { exports?: Record<string, string> };
			if (pkg.exports && "./app-runtime" in pkg.exports) {
				findings.push({
					file: `${pkgRoot}/package.json`,
					reason: "./app-runtime export must not exist (AU17/AC-1)",
				});
			}
		}
	}

	// (c) routines.ts exact-3-export shape.
	const routinesAbs = join(root, ROUTINES_TS);
	if (existsSync(routinesAbs)) {
		const text = readFileSync(routinesAbs, "utf8");
		const ast = ts.createSourceFile(routinesAbs, text, ts.ScriptTarget.Latest, true);
		const exported = new Set<string>();
		for (const stmt of ast.statements) {
			if (!ts.isExportDeclaration(stmt)) continue;
			if (!stmt.exportClause || !ts.isNamedExports(stmt.exportClause)) continue;
			for (const el of stmt.exportClause.elements) exported.add(el.name.text);
		}
		const allowed = new Set(["checkAndFireRoutine", "provisionTeamRoutines", "runBuiltinRoutine"]);
		const extra = [...exported].filter((name) => !allowed.has(name));
		const missing = [...allowed].filter((name) => !exported.has(name));
		if (extra.length > 0 || missing.length > 0) {
			findings.push({
				file: ROUTINES_TS,
				reason: `must re-export exactly {checkAndFireRoutine, provisionTeamRoutines, runBuiltinRoutine} — found extra:[${extra.join(",")}] missing:[${missing.join(",")}] (AC-1/AC-4: not a grouping barrel)`,
			});
		}
	}

	return findings;
}

// --- fixtures self-test (a + b + c) ---

function fixtureCheck(): void {
	const root = mkdtempSync(join(tmpdir(), "au17-boundary-guard-"));
	try {
		// (a) positive: a retired guard script reappears → finding.
		mkdirSync(join(root, "scripts"), { recursive: true });
		writeFileSync(join(root, "scripts/au9-direct-handoff-guard.ts"), "export {};");

		// (b) positive: app-runtime path + bootstrapAppRuntime symbol + export, in each package.
		mkdirSync(dirname(join(root, "packages/server/src/app-runtime/index.ts")), { recursive: true });
		writeFileSync(join(root, "packages/server/src/app-runtime/index.ts"), "export const x = 1;");
		mkdirSync(dirname(join(root, "packages/server/src/server-factory.ts")), { recursive: true });
		writeFileSync(
			join(root, "packages/server/src/server-factory.ts"),
			"export function bootstrapAppRuntime() { return []; }",
		);
		mkdirSync(join(root, "packages/server"), { recursive: true });
		writeFileSync(
			join(root, "packages/server/package.json"),
			JSON.stringify({ exports: { "./app-runtime": "./src/app-runtime/index.ts" } }),
		);
		// clean packages for the other two roots' package.json checks (no app-runtime export).
		for (const pkgRoot of ["packages/core-app", "packages/agent-layer"]) {
			mkdirSync(join(root, pkgRoot), { recursive: true });
			writeFileSync(join(root, pkgRoot, "package.json"), JSON.stringify({ exports: {} }));
		}

		// (c) positive: routines.ts regrows into a barrel → finding.
		mkdirSync(dirname(join(root, ROUTINES_TS)), { recursive: true });
		writeFileSync(
			join(root, ROUTINES_TS),
			[
				'export { checkAndFireRoutine } from "./services/routine-scheduler.js";',
				'export { provisionTeamRoutines, runBuiltinRoutine, registerBuiltinRoutineHandlers } from "./services/builtin-routine-handlers.js";',
			].join("\n"),
		);

		const findings = inspect(root).map((f) => f.file);
		for (const expected of [
			"scripts/au9-direct-handoff-guard.ts",
			"packages/server/src/app-runtime/index.ts",
			"packages/server/src/server-factory.ts",
			"packages/server/package.json",
			ROUTINES_TS,
		]) {
			if (!findings.includes(expected)) throw new Error(`fixture guard missed ${expected}`);
		}

		// (d) negative: a clean routines.ts (exactly the 3 exports) → no finding.
		writeFileSync(
			join(root, ROUTINES_TS),
			[
				'export { provisionTeamRoutines, runBuiltinRoutine } from "./services/builtin-routine-handlers.js";',
				'export { checkAndFireRoutine } from "./services/routine-scheduler.js";',
			].join("\n"),
		);
		const cleanFindings = inspect(root).map((f) => f.file);
		if (cleanFindings.includes(ROUTINES_TS)) {
			throw new Error("fixture guard false-positived on a clean routines.ts");
		}

		process.stdout.write("au17-package-boundary-guard fixtures: PASS\n");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

// --- AC-2 proof: an unexported deep import fails typecheck (§9) ---

function ac2Fixture(): void {
	const root = process.cwd();
	// Must live INSIDE the repo (not system tmpdir) so bare-specifier
	// "@hyperidle/agent-layer" resolves through the workspace's own
	// node_modules symlinks via ordinary upward node_modules resolution.
	const tmpDir = join(root, ".tmp-au17-ac2-fixture");
	rmSync(tmpDir, { recursive: true, force: true });
	mkdirSync(join(tmpDir, "positive"), { recursive: true });
	mkdirSync(join(tmpDir, "negative"), { recursive: true });
	try {
		// Negative case (must resolve): the curated barrel entry point.
		writeFileSync(
			join(tmpDir, "positive/index.ts"),
			'import { bootAgentLayer } from "@hyperidle/agent-layer";\nbootAgentLayer;\n',
		);
		// Positive case (must NOT resolve): a deep path not in agent-layer's exports map.
		writeFileSync(
			join(tmpDir, "negative/index.ts"),
			'import { provisionSession } from "@hyperidle/agent-layer/services/session-provisioning";\nprovisionSession;\n',
		);

		// A minimal, un-extended tsconfig per fixture (no "extends": running
		// through the repo's own root tsconfig conflicts with passing an
		// explicit file — TS5112). moduleResolution "bundler" resolves
		// "@hyperidle/agent-layer" via plain node_modules package resolution
		// (npm workspaces symlinks + package.json "exports"), independent of
		// the root tsconfig's `paths` map.
		const tsconfigFor = (dir: string): string =>
			JSON.stringify({
				compilerOptions: {
					noEmit: true,
					moduleResolution: "bundler",
					module: "ES2022",
					target: "ES2022",
					strict: true,
					skipLibCheck: true,
				},
				include: [`${dir}/*.ts`],
			});
		writeFileSync(join(tmpDir, "positive.tsconfig.json"), tsconfigFor("positive"));
		writeFileSync(join(tmpDir, "negative.tsconfig.json"), tsconfigFor("negative"));

		const tscBin = join(root, "node_modules/.bin/tsc");
		function runTsc(configName: string): { failed: boolean; output: string } {
			try {
				execFileSync(tscBin, ["-p", join(tmpDir, configName)], { cwd: tmpDir, stdio: "pipe" });
				return { failed: false, output: "" };
			} catch (err) {
				return { failed: true, output: String((err as { stdout?: Buffer }).stdout ?? "") };
			}
		}

		const negative = runTsc("negative.tsconfig.json");
		if (!negative.failed) {
			process.stderr.write(
				"AC-2 FAIL: an unexported deep import (@hyperidle/agent-layer/services/session-provisioning) resolved at typecheck — the package boundary is not enforced.\n",
			);
			process.exit(1);
		}
		if (!/Cannot find module|has no exported member|TS2307|TS2305/.test(negative.output)) {
			process.stderr.write(
				`AC-2 FAIL: negative fixture failed, but not with a module-resolution error — got:\n${negative.output}\n`,
			);
			process.exit(1);
		}

		const positive = runTsc("positive.tsconfig.json");
		if (positive.failed) {
			process.stderr.write(
				`AC-2 FAIL: the curated barrel import (@hyperidle/agent-layer) unexpectedly failed to resolve:\n${positive.output}\n`,
			);
			process.exit(1);
		}

		process.stdout.write("au17-package-boundary-guard AC-2 fixture: PASS (unexported deep import fails typecheck)\n");
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}
}

if (process.argv.includes("--fixtures")) {
	fixtureCheck();
} else if (process.argv.includes("--ac2-fixture")) {
	ac2Fixture();
} else {
	const findings = inspect(process.cwd());
	for (const finding of findings) process.stderr.write(`${finding.file}: ${finding.reason}\n`);
	if (findings.length > 0) {
		process.stderr.write(`au17-package-boundary-guard: ${findings.length} finding(s)\n`);
		process.exit(1);
	}
	if (process.argv.includes("--check")) {
		process.stdout.write("au17-package-boundary-guard: PASS\n");
	}
}
