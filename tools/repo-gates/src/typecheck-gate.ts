#!/usr/bin/env tsx
/**
 * AF1: Per-package typecheck gate for the HyperIdle monorepo.
 *
 * Replaces the vacuous `tsc --noEmit -p tsconfig.json` which compiled nothing
 * (root tsconfig has `"include": []`). This script:
 *  1. Discovers all packages dynamically by scanning the role roots
 *     (`layers/`, `framework/`, `applications/`, `tools/`) for `tsconfig.json`.
 *  2. Runs tsc --noEmit per package, capturing stdout+stderr.
 *  3. Filters errors to own-package files, excluding reference-noise codes.
 *  4. Applies the crash guard, non-excepted failure, and stale-ratchet rules.
 *  5. Prints a summary table and exits 0 (PASS) or 1 (FAIL).
 *
 * Exception list: typecheck-debt.json at repo root.
 * Verdict logic:  tools/repo-gates/src/lib/typecheck-verdict.ts (pure function, unit-tested).
 *
 * @lore AF1: The root tsconfig uses `"include": []` + `references`, making
 * `tsc --noEmit -p tsconfig.json` compile nothing and always exit 0. Even the
 * correct `tsc -b` would miss `web` and `pipeline` (both `composite: false`
 * and absent from root references). A per-package fan-out is the only approach
 * that reaches every package with an independent verdict. See architecture.md.
 *
 * @lore AF1 TS6305/TS6307/TS6059: These three codes are cross-package reference
 * noise. TS6305 = "output file has not been built from source" (--noEmit means
 * no .d.ts was emitted, so cross-package refs see stale outputs). TS6307 = "file
 * not listed in project" (a referenced project's file listed by the consumer).
 * TS6059 = "file is not under rootDir" (same root cause). These errors belong to
 * the referenced dependency, not the consumer — filtering them gives the consumer
 * a clean own-error count.
 *
 * @lore AF1 crash-guard: If tsc exits non-zero but produces zero parseable error
 * lines, the naive gate would count 0 errors and wrongly PASS. This happens when
 * tsc crashes (OOM, invalid tsconfig, internal compiler error). The guard detects
 * this case and always fails the gate with diagnostic output. We check
 * rawParsedCount (before own-file filtering) rather than ownErrors to avoid
 * false-triggering on packages that only have reference-noise errors.
 *
 * @lore AF3 (resolved): main's gate could once be RED while CI was GREEN, because
 * CI trusted an HMAC-signed local attestation instead of running this gate. AF2
 * declared design-system/desktop/eval zero-error while they still had 15/1/17
 * errors; the attestation was signed on that red tree and CI validated only the
 * signature. AF3 proposed recording this gate's exit code in the attestation
 * payload, "OR add a CI step that re-runs this script". The latter was done, and
 * the attestation mechanism has since been deleted outright — this gate now runs
 * live in .github/workflows/ci.yml on every PR and push, so its verdict cannot be
 * asserted from anywhere but an actual run. See Z8-166 in plans/Z8/master-flag-register.md.
 */

import { execFile, execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { availableParallelism } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { computeVerdict, type DebtFile, type PackageResult } from "./lib/typecheck-verdict.js";

const execFileAsync = promisify(execFile);

// -- Constants --

/** Error codes that are cross-package reference noise, not own-package errors. */
const REFERENCE_NOISE_CODES: ReadonlySet<string> = new Set(["TS6305", "TS6307", "TS6059"]);

const DEBT_FILE = "typecheck-debt.json";
const MAX_ERROR_LINES = 10;

/**
 * tsc can emit a multi-thousand-line cascade for one package (see the Z8-170
 * `any`-cascade note below), which overruns execFile's 1 MB default and would
 * surface as a spurious CRASHED verdict rather than the real error count.
 */
const TSC_MAX_BUFFER = 64 * 1024 * 1024;

/**
 * Per-package `tsc --noEmit` runs are independent by construction — that
 * independence is the whole point of the AF1 fan-out — so they parallelise
 * freely. Bound it by the machine: each tsc holds a full program in memory
 * (~1 GB for the larger packages), so unbounded fan-out OOMs a small runner.
 *
 * @lore ci-move: this loop was serial, and on the 2-vCPU GitHub-hosted runner a
 * private repo gets, it was 216s of a 326s CI job — 66% of every run, spent
 * waiting on one core while the other idled. Nothing about the work required
 * serialisation; it was just written as a `for` loop. `TYPECHECK_CONCURRENCY`
 * overrides for machines where memory, not cores, is the binding constraint.
 */
const MAX_CONCURRENCY = 6;

function resolveConcurrency(): number {
	const override = process.env["TYPECHECK_CONCURRENCY"];
	if (override !== undefined && override !== "") {
		const n = Number(override);
		if (!Number.isInteger(n) || n <= 0) {
			process.stderr.write(
				`typecheck-gate: FATAL — TYPECHECK_CONCURRENCY must be a positive integer, got "${override}".\n`,
			);
			process.exit(1);
		}
		return n;
	}
	return Math.max(1, Math.min(availableParallelism(), MAX_CONCURRENCY));
}

/**
 * Run `tasks` with at most `limit` in flight, preserving input order in the
 * result. Workers pull from a shared cursor so a slow package never blocks a
 * free slot.
 */
async function mapWithConcurrency<T, R>(
	items: readonly T[],
	limit: number,
	fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let cursor = 0;
	const worker = async (): Promise<void> => {
		for (;;) {
			const index = cursor++;
			if (index >= items.length) return;
			results[index] = await fn(items[index] as T, index);
		}
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
	return results;
}

// @lore AU28 step 2: the four role roots replace the single `packages/` tree.
// A package IDENTITY is now its repo-relative directory (`layers/core-api/work`,
// `framework/db`), which is what every downstream consumer — the error regex, the
// debt-file keys, the `-p` argument — already wanted. Discovery still SCANS; no
// package name is hardcoded, and an empty scan is FATAL below.
const PACKAGE_ROOTS = ["layers", "framework", "applications", "tools"] as const;

// Matches: <root>/<path...>/file.ts(line,col): error TS1234: message
// or:      <root>/<path...>/file.ts:line:col - error TS1234: message
// Group 1 = full repo-relative path; group 2 = TS error code. The owning
// package is resolved by longest-prefix match (AU19: nested Layer/Service
// packages share a top-level segment, so a bare first-segment match would
// mis-attribute a Service's error to its Layer).
const ERROR_LINE_RE = new RegExp(
	`^((?:${PACKAGE_ROOTS.join("|")})\\/[^:]+)[:(].*\\berror (TS\\d+)\\b`,
);

// -- Discovery --

// @lore AU19: package discovery recurses ONE level so the nested Layer/Service
// packages (`layers/<layer>/<service>/tsconfig.json`) are typechecked. Without
// this, the nested Service packages are never `tsc`-checked and Mechanisms B/C
// (execution + composition boundaries) go silently unenforced by `npm run check`
// — the single biggest silent-failure risk the AU19 architecture flags (§9.2).
function discoverPackages(root: string): string[] {
	const found: string[] = [];
	for (const rootDir of PACKAGE_ROOTS) {
		const base = resolve(root, rootDir);
		if (!existsSync(base)) continue;
		const topLevel = readdirSync(base, { withFileTypes: true }).filter((e) => e.isDirectory());
		for (const top of topLevel) {
			if (existsSync(resolve(base, top.name, "tsconfig.json"))) {
				found.push(`${rootDir}/${top.name}`);
			}
			// Recurse one level: <root>/<layer>/<service>/tsconfig.json
			const nested = readdirSync(resolve(base, top.name), {
				withFileTypes: true,
			}).filter((e) => e.isDirectory());
			for (const sub of nested) {
				if (existsSync(resolve(base, top.name, sub.name, "tsconfig.json"))) {
					found.push(`${rootDir}/${top.name}/${sub.name}`);
				}
			}
		}
	}
	return found.sort();
}

/**
 * Resolve which discovered package owns an error path via longest-prefix match.
 * `layers/core-api/knowledge/src/x.ts` must attribute to `layers/core-api/knowledge`,
 * not `layers/core-api`, so a Service error never counts against its Layer.
 */
function ownerOf(path: string, allPackages: readonly string[]): string | null {
	let owner: string | null = null;
	for (const pkg of allPackages) {
		const prefix = `${pkg}/`;
		if (path.startsWith(prefix) && (owner === null || pkg.length > owner.length)) {
			owner = pkg;
		}
	}
	return owner;
}

// -- Debt file reading --

function readDebtFile(root: string): { excepted: Set<string>; raw: DebtFile } {
	const debtPath = resolve(root, DEBT_FILE);
	if (!existsSync(debtPath)) {
		process.stderr.write(
			`typecheck-gate: FATAL — ${DEBT_FILE} not found at ${debtPath}.\n` +
				`Create it or run AF1 setup to generate it.\n`,
		);
		process.exit(1);
	}
	let raw: DebtFile;
	try {
		raw = JSON.parse(readFileSync(debtPath, "utf-8")) as DebtFile;
	} catch (err) {
		process.stderr.write(
			`typecheck-gate: FATAL — ${DEBT_FILE} is not valid JSON: ${String(err)}\n`,
		);
		process.exit(1);
	}
	if (!raw.packages || typeof raw.packages !== "object" || Array.isArray(raw.packages)) {
		process.stderr.write(
			`typecheck-gate: FATAL — ${DEBT_FILE} is malformed: missing "packages" object.\n`,
		);
		process.exit(1);
	}
	return { excepted: new Set(Object.keys(raw.packages)), raw };
}

// -- Per-package tsc runner --

async function runPackage(
	root: string,
	tscBin: string,
	pkg: string,
	allPackages: readonly string[],
): Promise<PackageResult> {
	const tsconfig = `${pkg}/tsconfig.json`;
	let rawOutput = "";
	let exitCode = 0;

	try {
		// @lore ci-move: invoke the resolved `tsc` binary rather than `npx tsc`.
		// npx re-resolves the package on every call, and this runs once per
		// package — pure spawn overhead repeated ~35 times per gate run.
		const { stdout } = await execFileAsync(tscBin, ["--noEmit", "-p", tsconfig], {
			encoding: "utf-8",
			cwd: root,
			maxBuffer: TSC_MAX_BUFFER,
		});
		rawOutput = stdout;
		// tsc exits 0 → clean (or only reference noise)
	} catch (err: unknown) {
		// execFile rejects on non-zero exit; attach output and record exit code.
		const nodeErr = err as NodeJS.ErrnoException & {
			stdout?: string;
			stderr?: string;
			code?: number | string;
		};
		rawOutput = (nodeErr.stdout ?? "") + (nodeErr.stderr ?? "");
		exitCode = typeof nodeErr.code === "number" ? nodeErr.code : 1;
	}

	// Parse error lines
	const lines = rawOutput.split("\n");
	let rawParsedCount = 0;
	const ownErrorLines: string[] = [];

	for (const line of lines) {
		const m = ERROR_LINE_RE.exec(line);
		if (!m) continue;
		rawParsedCount++;
		const linePath = m[1] ?? ""; // full repo-relative path
		const tsCode = m[2] ?? ""; // e.g. "TS2322"
		const linePkg = ownerOf(linePath, allPackages); // longest-prefix owner
		if (linePkg === pkg && !REFERENCE_NOISE_CODES.has(tsCode)) {
			ownErrorLines.push(line);
		}
	}

	const ownErrors = ownErrorLines.length;

	// @lore AF1 crash-guard: check rawParsedCount (not ownErrors) to avoid
	// false-triggering on packages with only reference-noise errors.
	const crashed = exitCode !== 0 && rawParsedCount === 0;

	return {
		name: pkg,
		ownErrors,
		excepted: false, // set by caller after reading debt file
		crashed,
		errorLines: ownErrorLines.slice(0, MAX_ERROR_LINES),
		rawOutput,
	};
}

// -- Summary table printer --

type RowStatus = "PASS" | `QUARANTINED (${string})` | "FAIL" | "CRASHED" | "STALE";

function printSummary(
	results: PackageResult[],
	debtRaw: DebtFile,
	crashedSet: Set<string>,
	failedSet: Set<string>,
	staleSet: Set<string>,
): void {
	process.stdout.write("\n");
	process.stdout.write(`${"Package".padEnd(28)} ${"Errors".padStart(8)}   Status\n`);
	process.stdout.write(`${"-".repeat(28)} ${"-".repeat(8)}   ${"-".repeat(30)}\n`);

	for (const r of results) {
		let status: RowStatus;
		if (crashedSet.has(r.name)) {
			status = "CRASHED";
		} else if (failedSet.has(r.name)) {
			status = "FAIL";
		} else if (staleSet.has(r.name)) {
			status = "STALE";
		} else if (r.excepted) {
			const owner = debtRaw.packages[r.name]?.owner ?? "?";
			status = `QUARANTINED (${owner})`;
		} else {
			status = "PASS";
		}
		process.stdout.write(`${r.name.padEnd(28)} ${String(r.ownErrors).padStart(8)}   ${status}\n`);
	}
	process.stdout.write("\n");
}

// -- Leaf declaration pre-build --

/**
 * @lore Z8-170: Build composite leaf declarations (shared, db) to `dist/` before
 * the per-package measurement loop. Without fresh leaf `.d.ts`, reference-consumers
 * (server/web) resolve cross-package imports to `any`, producing a ~3400-error
 * TS7031 fixture-binding cascade phantom — which silently passes while those
 * packages are quarantined but makes DRAINING them (AF4 server / AF5 web)
 * impossible. CI re-runs this gate live on a dist-free `npm ci` tree (post-#246),
 * so the build must happen here for the gate to measure real errors deterministically.
 *
 * @lore AF5: design-system also added to the leaf pre-build. Web imports
 * `computeSenderGrouping` and `TAG_KIND_ICONS` from `@hyperidle/design-system`.
 * Without a pre-built design-system dist, TypeScript cannot resolve the unexported
 * `SenderGroupedMessage` interface and the `TagKindMeta` value type, so it infers
 * `any`/`unknown` for map callbacks — producing 5 spurious TS7006/TS18046 errors in
 * `ThreadShell.test.tsx` and `tag-kinds.test.ts`. Adding design-system to the leaf
 * build (after shared, which it depends on) fixes this deterministically.
 *
 * Built SEPARATELY in dependency order (shared, then db, then design-system). A
 * combined `tsc -b shared db` scatters generated files into the packages' `src` dirs,
 * which the downstream biome lint step then flags as ~714 phantom noBannedTypes errors;
 * separate ordered builds emit cleanly to `dist/` (gitignored) only. The `tsc -b`
 * exit code is ignored — db emits TS6059 reference-noise (its tsconfig declares no
 * `references` entry for shared) but still emits the declarations, and any genuine
 * shared/db error is still caught by their own `tsc --noEmit -p` measurement below.
 *
 * fabric is intentionally NOT built: building it exposes a real pre-existing eval
 * bug (AD8c — `clearBuiltinCostSentinelCache` removed from fabric, unpropagated to
 * eval scenarios) that is out of scope here. fabric stays source-resolved, exactly
 * as on origin/main. See plans/Z8/master-flag-register.md Z8-170.
 */
function buildLeafDeclarations(root: string, tscBin: string): void {
	// @lore AF5: design-system added after shared — web typechecks import from
	// @hyperidle/design-system; without a pre-built dist the tsc reference resolver
	// can't find SenderGroupedMessage / TagKindMeta and infers `any`/`unknown` for
	// callbacks, producing 5 spurious TS7006/TS18046 errors. Building design-system
	// declarations (which depend on shared) before the measurement loop fixes this.
	//
	// @lore AU19 Increment 1a: `core-api/knowledge` added — the exact same TS6305
	// "output file has not been built" cascade hits `server` (its first real Service
	// package dependency, replacing the old in-package `knowledge/` dir) without a
	// pre-built dist: 12 spurious TS7031/TS7006/TS18046 errors across
	// routes/knowledge.ts, server-factory.ts, context-assembly.ts, writeback.ts,
	// query-practice.ts — confirmed by building `core-api/knowledge` in isolation
	// and re-measuring `server`, which then drops to 0. Every future Increment that
	// migrates a Service consumed by `server` (or another non-Layer package) will
	// need the same addition here.
	//
	// @lore AU19 Increment 1b: `core-api/work` added — same TS6305 cascade hits
	// `server` again (43+ consumer files across routes/tools/services now import
	// `@hyperidle/work`) without a pre-built dist.
	//
	// @lore AU19 Increment 1c: `core-api/org` added — same TS6305 cascade;
	// routes/tools/services now import `@hyperidle/org`.
	//
	// @lore AU19 Increment 1d: `core-api/users` added — same TS6305 cascade;
	// ~30 routes/tools/services now import `@hyperidle/users`.
	//
	// @lore AU19 Increment 1e: `core-api/conversation` added — same TS6305
	// cascade; ~27 routes/tools/services now import `@hyperidle/conversation`.
	//
	// @lore AU19 Increment 1f: `core-api/settings` added — same TS6305 cascade;
	// ~25 routes/notifications/services/config files now import
	// `@hyperidle/settings`.
	//
	// @lore AU19 Increment 1g: `core-api/notifications` added — same TS6305
	// cascade; routes/services (retention-reaper, lifecycle-propagation,
	// policy-engine)/app.ts/server-factory.ts now import `@hyperidle/notifications`.
	//
	// @lore AU19 Increment 1h: `core-api/connections` added — same TS6305
	// cascade; routes/connections.ts, routes/credentials.ts, routes/filesystems.ts,
	// harness/cli-harness-adapter.ts, services/model-gateway.ts,
	// services/filesystem-reachability.ts, services/session-provisioning.ts,
	// app.ts/server-factory.ts now import `@hyperidle/connections`.
	//
	// @lore AU19 Increment 1i: `core-api/routine` added — same TS6305 cascade;
	// routes/routines-routes.ts, routes/teams-routes.ts, tools/create-routine.ts,
	// tools/update-routine.ts, services/agent-lifecycle-projectors.ts,
	// services/agent-work-intent-worker.ts, services/builtin-routine-handlers.ts,
	// services/routine-scheduler.ts, services/routine-session-reaper.ts,
	// services/session-context.ts, services/session-lifecycle.ts,
	// services/session-provisioning.ts, server-factory.ts now import
	// `@hyperidle/routine`.
	//
	// @lore AU19 Increment 1j: `core-api/review` added — closes Increment 1
	// (the last unmigrated core-api SQL-owning Service). Same TS6305 cascade;
	// routes/threads.ts, routes/reviews.ts, tools/score-attention.ts,
	// services/builtin-routine-handlers.ts, server-factory.ts now import
	// `@hyperidle/review`.
	//
	// @lore AU19 Increment 2a: `core-api/policy` added — same TS6305 cascade;
	// routes/tasks.ts, routes/agent-profile.ts, tools/handoff-to.ts,
	// services/policy-bindings.ts, server-factory.ts now import
	// `@hyperidle/policy`.
	//
	// @lore AU19 Increment 2b: `core-api/filesystems` added — same TS6305
	// cascade; routes/filesystems.ts, routes/knowledge.ts, app.ts,
	// server-factory.ts, services/session-provisioning.ts,
	// services/agent-context/assemble-context.ts,
	// filesystem/__tests__/scaffolding-drift-guard.test.ts now import
	// `@hyperidle/filesystems`.
	//
	// @lore AU26 C1: `core-api/git-export` REMOVED — the exporter is deleted by
	// founder verdict and the package with it. The live half, `createGitRunner`,
	// moved to `@hyperidle/host-process` in A2, so `filesystems`' Increment-2b
	// `FilesystemsGitRunner` forward-reference is still closed, just from
	// `shared` rather than from a core-api Service.
	//
	// @lore AU26 C2: `core-api/observability` REMOVED — the package dissolved
	// (translator + adapter → `@hyperidle/diagnostics`, config pair →
	// `@hyperidle/settings`, runtime → the composition layer, routes deleted).
	//
	// @lore AU19 Increment 2e: `core-api/model-gateway` added — same TS6305
	// cascade; server-factory.ts, services/agent-work-assistant.ts, and
	// tools/eval/src/runner.ts now import `@hyperidle/model-gateway`.
	//
	// @lore AU26 C3: `core-api/realtime` dissolved — package removed; the hub and
	// its subscribe authorizer are core-api Layer transport now
	// (`src/ws-connection-hub.ts` + `src/ws-subscribe-authorizer.ts`).
	//
	// @lore AU20 C1: `core-api/retention` dissolved — package removed, sweeps
	// distributed to owning services, propagation_log reaper at composition root.
	//
	// @lore AU19 Increment 3a: `agent-orchestration/trigger-resolution` added —
	// same TS6305 cascade; services/agent-work-intent-worker.ts and
	// __tests__/AR4b-formation-seam.test.ts /
	// __tests__/trigger-resolution.integration.test.ts now import
	// `@hyperidle/trigger-resolution`.
	//
	// @lore AU19 Increment 3b: `agent-orchestration/session-requests` added —
	// same TS6305 cascade; server-factory.ts, session-requests-bindings.ts,
	// and many other `packages/server` call sites now import
	// `@hyperidle/session-requests`.
	//
	// @lore AU19 Increment 3c: `agent-orchestration/run-orchestration` added —
	// same TS6305 cascade; agent-work-assistant.ts, session-requests-bindings.ts,
	// server-factory.ts, and the new run-orchestration-bindings.ts now import
	// `@hyperidle/run-orchestration`.
	//
	// @lore AU19 Increment 3d: `agent-orchestration/lifecycle-projection`
	// added — same TS6305 cascade; server-factory.ts, session-requests-
	// bindings.ts, and the new lifecycle-projection-bindings.ts now import
	// `@hyperidle/lifecycle-projection`.
	//
	// @lore AU19 Increment 3e: `agent-orchestration/agent-selection` added —
	// same TS6305 cascade; server-factory.ts, session-requests-bindings.ts,
	// and many `packages/server` route/tool call sites now import
	// `@hyperidle/agent-selection`.
	//
	// @lore AU19 Increment 3f: `agent-orchestration/capture-writeback` added —
	// same TS6305 cascade; app.ts, routes/sessions-routes.ts, and
	// server-factory.ts now import `@hyperidle/capture-writeback`.
	// @lore AU20 B2c: `agent-orchestration/capture-writeback` folded into
	// run-orchestration — removed from this list.
	//
	// @lore AU19 Increment 3g: `agent-orchestration/cost` added — same TS6305
	// cascade; server-factory.ts and the new cost-bindings.ts now import
	// `@hyperidle/cost`.
	//
	// @lore AU19 Increment 3i: `agent-orchestration/session-lifecycle` added —
	// same TS6305 cascade; server-factory.ts, session.ts,
	// routes/sessions-routes.ts, routes/tasks.ts, tools/handoff-to.ts,
	// run-orchestration-bindings.ts, and the new session-lifecycle-bindings.ts
	// now import `@hyperidle/session-lifecycle`.
	//
	// @lore AU19 Increment 3 (context-assembly finalize, closes Increment 3):
	// `agent-orchestration/context-assembly` added — same TS6305 cascade; the
	// new context-assembly-bindings.ts, session-lifecycle-bindings.ts,
	// __tests__/R7-knowledge-e2e.integration.test.ts, and
	// filesystem/__tests__/scaffolding-drift-guard.test.ts now import
	// `@hyperidle/context-assembly`.
	//
	// @lore AU19 Increment 4: `agent-execution/harness-registry` finalized
	// (was the Increment-0 single-file slice) — same TS6305 cascade; app.ts,
	// session.ts, server-factory.ts, tools/return-status-tool.ts,
	// services/{harness-capability-read-model,session-lifecycle-bindings,
	// run-orchestration-bindings,dispatch-bindings,mcp-route}.ts, and dozens
	// of __tests__/routes/__tests__ files now import
	// `@hyperidle/harness-registry` (repointed from the deleted
	// `packages/server/src/harness/*`). `agent-execution/mcp-provider` and
	// `agent-execution/tool-provider` added the same increment for the same
	// reason (mcp-route.ts + the tool-provider/tool-handlers split).
	//
	// @lore AU19 Increment 5 (item 2): `core-api` itself (the Layer package —
	// `app.ts`/`server-factory.ts`/`routes/*`/`middleware/*`/`auth/*`/`schemas/*`,
	// moved wholesale from the dissolved `packages/server`) added — same TS6305
	// cascade; the new `applications/desktop/src/boot-server.ts`,
	// `applications/remote-server/src/index.ts`, `tools/eval/src/{routines
	// scenarios,provision-harness}.ts`, and `layers/core-ui/__scripts__/ah{1,5,6}-
	// test-server.ts`/`src/api/client.ts` now import `@hyperidle/core-api`
	// (repointed from the deleted `@hyperidle/server`). `remote-server` and
	// `remote-worker` added the same increment — `remote-server` is itself a
	// leaf-consumed-by-nothing-else Application, but building its declarations
	// here keeps its own measurement (below) deterministic the same way every
	// other leaf's does; `remote-worker` is consumed by `applications/desktop`.
	for (const leaf of [
		"framework/domain-model",
		"framework/diagnostics",
		"framework/harness-capability",
		"framework/event-bus",
		"framework/harness-protocol",
		"framework/db",
		"layers/core-api",
		"layers/core-api/knowledge",
		"layers/core-api/work",
		"layers/core-api/org",
		"layers/core-api/users",
		"layers/core-api/conversation",
		"layers/core-api/settings",
		"layers/core-api/notifications",
		"layers/core-api/credentials",
		"layers/core-api/routine",
		"layers/core-api/review",
		"layers/core-api/policy",
		// @lore AU20 C1: core-api/retention dissolved — sweeps distributed to owning services
		// (users/knowledge/notifications) + propagation_log reaper co-located at composition root.
		// @lore AU20 B1b: agent-orchestration/trigger-resolution folded into session-requests.
		"layers/agent-orchestration/connections",
		// @lore AU26 F2 (§D-I, founder ruling): `core-api/filesystems` relocated
		// here whole — record, injections and reachability probe follow F1's mount
		// engine into the agent-orchestration Layer.
		"layers/agent-orchestration/filesystems",
		"layers/agent-orchestration/session-requests",
		"layers/agent-orchestration/run-orchestration",
		// @lore AU21 §6 Decision F1 (Increment 8): agent-orchestration/agent-selection
		// dissolved — bet_task/bet_decomposer selection folded into core-api/work's
		// own agent-assignment.ts, routine_delegate into core-api/routine's
		// agent-delegation.ts, isAtCapacity into this list's own run-orchestration
		// (concurrency.ts), resolveScaffoldSpecs into db's agent-scaffold.ts.
		// @lore AU20 B2c: agent-orchestration/capture-writeback folded into run-orchestration.
		// @lore AU21 Increment 14a: agent-orchestration/cost HARD-DELETED (founder) — removed from this list.
		// @lore AU20 B2b: agent-orchestration/session-lifecycle folded into run-orchestration.
		// @lore AU20 B2a: agent-orchestration/context-assembly folded into run-orchestration.
		"layers/agent-execution/harness-registry",
		// @lore AU20 B3b: agent-execution/mcp-provider folded into harness-registry.
		"layers/agent-orchestration/tool-handlers",
		// @lore AU31 §2.7/[P9]: the Layer barrel itself now has a real consumer —
		// `RemoteWorkerClient` relocated here, and `applications/desktop`/
		// `applications/remote-worker` import the face directly. Same TS6305
		// cascade as every other leaf without a pre-built dist.
		"layers/agent-execution",
		"applications/remote-server",
		"applications/remote-worker",
	]) {
		try {
			// Stays SERIAL: these are a dependency chain writing shared `dist/`
			// outputs, so concurrent builds would race. Only the `npx` indirection
			// is removed here — the ordering is load-bearing.
			execSync(`${JSON.stringify(tscBin)} -b ${leaf}`, { cwd: root, stdio: "ignore" });
		} catch {
			// tsc -b exits non-zero on reference-noise (TS6059) but still emits the
			// declarations to dist/. Real errors surface in the per-package measurement.
		}
	}
	cleanEmittedGovernanceArtifacts(root);
}

/**
 * Remove compiled copies this build emitted beside their own sources.
 *
 * @lore AU28: the governance tests in `framework/db` import `tools/governance/src/lib/*.js`, which
 * pulls those files into a composite build whose rootDir they sit outside. tsc emits `.js`/`.d.ts` next to the
 * `.ts` (hiding the reason as TS6059, which this gate filters as reference noise) — and then Node,
 * tsx and vitest ALL resolve the compiled copy first. The guard runs stale logic while the source on
 * disk says something else, and the only symptom is a failure that makes no sense. This build makes
 * them, so this build cleans them; `no-stale-build-artifacts` catches any that survive.
 *
 * @lore AU34: the sweep covers the four package roots, because the same
 * out-of-rootDir emit now happens between framework packages: one package's development files import
 * a sibling by workspace name, the sibling's sources enter a composite program whose rootDir they sit
 * outside, and tsc drops the compiled copy in the sibling's own `src/`. It was invisible while the
 * framework was one package that imported nothing. Deleting is safe by construction — a file is only
 * removed when a `.ts` of the same name sits beside it, so a hand-written declaration like
 * `vite-env.d.ts` is never touched.
 */
function cleanEmittedGovernanceArtifacts(root: string): void {
	const suffixes = [".d.ts.map", ".js.map", ".d.ts", ".js"];
	const walk = (dir: string): void => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const full = resolve(dir, entry.name);
			if (entry.isDirectory()) {
				// `dist/` is where the emit is SUPPOSED to land, and a dependency shipping both `.ts` and
				// `.js` inside node_modules is none of this sweep's business.
				if (entry.name === "node_modules" || entry.name === "dist") continue;
				walk(full);
				continue;
			}
			const suffix = suffixes.find((s) => entry.name.endsWith(s));
			if (suffix === undefined) continue;
			if (existsSync(`${full.slice(0, -suffix.length)}.ts`)) rmSync(full, { force: true });
		}
	};
	for (const dir of PACKAGE_ROOTS) {
		const full = resolve(root, dir);
		if (existsSync(full)) walk(full);
	}
}

// -- Main --

async function main(): Promise<void> {
	const root = process.cwd();

	// Resolve `tsc` once. A missing binary is FATAL: silently falling back would
	// make every package "pass" with zero parsed errors.
	//
	// @lore ci-move: TYPECHECK_TSC selects the compiler. This gate is the ONE
	// TypeScript consumer in the repo that can move independently, because it
	// never imports the API — it shells out and parses text. Everything else
	// (tools/governance's crossing detectors and repo census, dep-manifest-lint,
	// typescript-eslint) needs the full compiler API, and `typescript@7` no longer
	// ships one: its main export is `./lib/version.cjs` and the API lives behind
	// `./unstable/*` until 7.1. So TS 7 goes in under an npm ALIAS, used only
	// here, while `typescript@^6` stays the library everything else imports.
	// Preference order: explicit override, then the TS 7 alias, then the classic
	// compiler. Which one ran is PRINTED, never silent — a gate whose verdict
	// depends on an invisible choice of compiler is a gate you cannot trust.
	const override = process.env["TYPECHECK_TSC"];
	const nativeBin = resolve(root, "node_modules", "typescript-native", "bin", "tsc");
	const classicBin = resolve(root, "node_modules", ".bin", "tsc");
	const tscBin = override
		? resolve(root, override)
		: existsSync(nativeBin)
			? nativeBin
			: classicBin;
	if (!existsSync(tscBin)) {
		process.stderr.write(
			`typecheck-gate: FATAL — tsc not found at ${tscBin}.` +
				(override ? " TYPECHECK_TSC points at a missing binary.\n" : " Run `npm ci`.\n"),
		);
		process.exit(1);
	}

	// 1. Discover packages
	const allPackages = discoverPackages(root);
	if (allPackages.length === 0) {
		process.stderr.write(
			`typecheck-gate: FATAL — no packages found under ${PACKAGE_ROOTS.join("/, ")}/. Is this the repo root?\n`,
		);
		process.exit(1);
	}

	// 2. Read debt file
	const { excepted, raw: debtRaw } = readDebtFile(root);

	// 3. Validate: every excepted package must exist on disk
	for (const name of excepted) {
		if (!allPackages.includes(name)) {
			process.stderr.write(
				`typecheck-gate: FATAL — typecheck-debt.json references unknown package "${name}".\n` +
					`Remove the entry or create the package.\n`,
			);
			process.exit(1);
		}
	}

	// 3.5 Build leaf declarations so reference-consumers (server/web) measure real
	// errors instead of the dist-free `any`-cascade phantom. See @lore above (Z8-170).
	process.stderr.write("typecheck-gate: building leaf declarations (shared, db)...\n");
	buildLeafDeclarations(root, tscBin);

	const concurrency = resolveConcurrency();
	process.stderr.write(
		`typecheck-gate: checking ${allPackages.length} packages ` +
			`(concurrency ${concurrency}, compiler ${tscBin.replace(`${root}/`, "")} ` +
			`${execSync(`${JSON.stringify(tscBin)} --version`, { encoding: "utf-8" }).trim()})...\n`,
	);

	// 4. Run tsc per package, up to `concurrency` at a time. Results keep input
	//    order regardless of completion order, so the summary table is stable.
	//    Status is printed on completion (not before the run) because with a
	//    parallel pool a "starting X..." line no longer pairs with its result.
	const results = await mapWithConcurrency(allPackages, concurrency, async (pkg) => {
		const result = await runPackage(root, tscBin, pkg, allPackages);
		result.excepted = excepted.has(pkg);

		if (result.crashed) {
			process.stderr.write(`  tsc ${pkg} CRASHED\n`);
		} else if (result.ownErrors === 0) {
			process.stderr.write(`  tsc ${pkg} ok\n`);
		} else if (result.excepted) {
			process.stderr.write(`  tsc ${pkg} ${result.ownErrors} errors (quarantined)\n`);
		} else {
			process.stderr.write(`  tsc ${pkg} ${result.ownErrors} errors FAIL\n`);
		}
		return result;
	});

	// 5. Compute verdict
	const verdict = computeVerdict(results);

	const crashedSet = new Set(verdict.crashedPackages.map((r) => r.name));
	const failedSet = new Set(verdict.failedNonExcepted.map((r) => r.name));
	const staleSet = new Set(verdict.staleExcepted.map((r) => r.name));

	// 6. Print summary table
	printSummary(results, debtRaw, crashedSet, failedSet, staleSet);

	// 7. Print failure details
	if (verdict.messages.length > 0) {
		for (const msg of verdict.messages) {
			process.stderr.write(`\n${msg}\n`);
		}
	}

	// 8. Final verdict
	if (verdict.outcome === "PASS") {
		process.stderr.write(`typecheck-gate: PASS — all ${allPackages.length} packages checked.\n`);
		process.exit(0);
	} else {
		process.stderr.write(
			`typecheck-gate: FAIL — fix the issues above, then re-run npm run check.\n`,
		);
		process.exit(1);
	}
}

main().catch((err: unknown) => {
	// An unhandled rejection would otherwise exit 0 on some Node versions —
	// a gate that fails open is worse than no gate.
	process.stderr.write(`typecheck-gate: FATAL — ${String(err)}\n`);
	process.exit(1);
});
