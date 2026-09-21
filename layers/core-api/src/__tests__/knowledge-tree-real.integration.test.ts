/**
 * @lore nested-knowledge-items: proof against a REAL agent, real harness binaries.
 *
 * The founder's ask: "testing this against agents and then the nested
 * structure works on their setup materialised." Every other lane proves the
 * DB/repository/writeback wiring; this file is the one that spawns a real
 * installed harness CLI inside a real sandbox and watches it actually read
 * and write the nested tree.
 *
 * Five things, each proven against every installed harness:
 *   1. Materialisation — a nested tree lands as real directories, an
 *      unselected ancestor still gets its index (title-only, no fabricated
 *      body), and the real binary reads a file nested two levels down.
 *   1b. A selected parent WITH a body AND selected children — the ordinary
 *      shape of a real knowledge tree — gets its real body in its own
 *      `index.md`, with no stray sibling leaf file next to its directory.
 *   2. Scope — the agent's slice is factory + its own team + its own; a
 *      branch scoped to another team is entirely absent from the sandbox,
 *      proven both by our own file walk and by asking the real agent.
 *   3. Round trip — a real agent creates a new nested folder+file; the real
 *      writeback processor turns the resulting file-system diff into a real
 *      knowledge item with the right parent, and the new folder becomes its
 *      own item inheriting the (root) parent's scope.
 *   4. Move — a real agent moves an EXISTING materialised file (one that
 *      therefore already carries the `_<id8>` filename suffix, architecture.md
 *      §5 D3) into a different folder. The real reparent() runs: same item,
 *      new parent, body untouched.
 *
 * @lore nested-knowledge-real: a probe run against `writeContextBundle`
 * directly (hand-built bundle, two items sharing a parent, both independently
 * selected) showed a parent-with-children item that is ALSO independently
 * selected got its real body dumped into a stray sibling leaf file
 * (`Title_<id8>.md`) next to its own directory, while the directory's
 * `index.md` only ever got the bare title — never the real body, even
 * though it was available. This contradicted plan.md's "a parent as a
 * directory containing index.md with its own body." FIXED in
 * `writeOrdinaryItems` (run-orchestration/src/context.ts) — the ordinary-item
 * write moved to a two-pass materialiser: pass 1 creates every ancestor
 * directory, pass 2 writes each item's own content, and an item that pass 1
 * already turned into a directory (because it is an ancestor of another
 * selected item) gets its real body written into that directory's
 * `index.md` instead of a separate leaf file. Regression-covered at the unit
 * level in `run-orchestration/src/__tests__/knowledge-materialisation.test.ts`
 * and, below, test 1b covers the same path against real harness binaries.
 *
 * HARNESS LANE: real binaries, real LLM calls, zero stubs.
 * Gate: requireHarness() — hard-fail (never skip) if a binary is absent.
 * Local-only: no CI job exists for this lane by design.
 */

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { knowledgeItems } from "@hyperidle/db";
import { test as dbTest } from "@hyperidle/db/test-fixtures";
import { type BakedContextBundle, toBakedContextKnowledgeItems } from "@hyperidle/domain-model";
import { EventBus } from "@hyperidle/event-bus";
import { HARNESS_TEST_MODELS, requireHarness } from "@hyperidle/harness-registry/test-utils";
import { assembleSessionKnowledge, create, reparent, update } from "@hyperidle/knowledge";
import { createWritebackProcessor } from "@hyperidle/run-orchestration";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import { buildTestRunOrchestrationComposition } from "./run-orchestration-test-runtime.js";

// ---------------------------------------------------------------------------
// Shared identities
// ---------------------------------------------------------------------------

const TEAM_ID = "team-nkt-own";
const OTHER_TEAM_ID = "team-nkt-rival";
const AGENT_ID = "agent-nkt";
const OTHER_USER_ID = "user-nkt-other";

// ---------------------------------------------------------------------------
// The real repository, shaped to the writeback processor's port — same idiom
// as knowledge-writeback-e2e.integration.test.ts's realKnowledgeWriter().
// ---------------------------------------------------------------------------

function realKnowledgeWriter() {
	return {
		create,
		async update(
			db2: Parameters<typeof update>[0],
			id: string,
			patch: { body: string; updatedBy: string },
			expectedVersion: number,
		) {
			return { ok: true as const, item: await update(db2, id, patch, expectedVersion) };
		},
		async reparentKnowledgeItem(
			db2: Parameters<typeof reparent>[0],
			id: string,
			input: { parentKind: "knowledge_item" | null; parentId: string | null; updatedBy: string },
		) {
			await reparent(db2, id, input);
		},
	};
}

// ---------------------------------------------------------------------------
// Spawn helper — identical shape to BA9b's, kept file-local per the
// established per-file idiom (no shared harness-spawn export exists).
// ---------------------------------------------------------------------------

async function spawnWithClosedStdin(
	bin: string,
	args: string[],
	opts: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number },
): Promise<{ stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		const child = spawn(bin, args, {
			cwd: opts.cwd,
			env: opts.env,
			stdio: ["ignore", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";

		child.stdout?.on("data", (chunk: Buffer) => {
			stdout += chunk.toString();
		});
		child.stderr?.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});

		const guard = setTimeout(() => {
			child.kill("SIGTERM");
			reject(
				new Error(
					`Command timed out after ${opts.timeoutMs}ms: ${bin} ${args.join(" ")}\n` +
						`stdout so far: ${stdout.slice(0, 400)}\nstderr so far: ${stderr.slice(0, 400)}`,
				),
			);
		}, opts.timeoutMs);

		child.on("exit", (code) => {
			clearTimeout(guard);
			if (code !== 0) {
				reject(
					new Error(
						`Command failed (exit ${code}): ${bin} ${args.join(" ")}\n` +
							`stdout: ${stdout.slice(0, 600)}\nstderr: ${stderr.slice(0, 400)}`,
					),
				);
			} else {
				resolve({ stdout, stderr });
			}
		});

		child.on("error", (err) => {
			clearTimeout(guard);
			reject(err);
		});
	});
}

function envFor(harness: string, sandboxPath: string): NodeJS.ProcessEnv {
	const base: NodeJS.ProcessEnv = { ...process.env, PWD: sandboxPath };
	if (harness === "claude") {
		// @lore real-claude-full-binary: zero these so claude does not detect it
		// is running inside claude-code (would skip the run).
		return {
			...base,
			CLAUDECODE: "",
			CLAUDE_CODE_ENTRYPOINT: "",
			CLAUDE_CODE_EXECPATH: "",
			CLAUDE_CODE_SESSION_ID: "",
			AI_AGENT: "",
			CLAUDE_EFFORT: "",
		};
	}
	return base;
}

async function runHarness(
	harness: "claude" | "codex" | "opencode" | "cursor-agent",
	prompt: string,
	sandboxPath: string,
	timeoutMs: number,
): Promise<string> {
	const env = envFor(harness, sandboxPath);
	if (harness === "claude") {
		const { model } = HARNESS_TEST_MODELS.claude;
		const { stdout } = await spawnWithClosedStdin(
			"claude",
			["-p", prompt, "--dangerously-skip-permissions", "--output-format", "text", "--model", model],
			{ cwd: sandboxPath, env, timeoutMs },
		);
		return stdout;
	}
	if (harness === "codex") {
		const { model } = HARNESS_TEST_MODELS.codex;
		const { stdout } = await spawnWithClosedStdin(
			"codex",
			[
				"exec",
				"--skip-git-repo-check",
				prompt,
				"--model",
				model,
				"--json",
				"--dangerously-bypass-approvals-and-sandbox",
			],
			{ cwd: sandboxPath, env, timeoutMs },
		);
		return stdout;
	}
	if (harness === "opencode") {
		const { stdout, stderr } = await spawnWithClosedStdin(
			"opencode",
			["run", prompt, "--pure", "--model", HARNESS_TEST_MODELS.opencode.model],
			{ cwd: sandboxPath, env, timeoutMs },
		);
		return stdout + stderr;
	}
	const { model } = HARNESS_TEST_MODELS["cursor-agent"];
	const { stdout } = await spawnWithClosedStdin(
		"cursor-agent",
		["-p", prompt, "--print", "--model", model, "--trust"],
		{ cwd: sandboxPath, env, timeoutMs },
	);
	return stdout;
}

/**
 * @lore nested-knowledge-real-opencode-model: the "read + reason across
 * several files" probe is the same class of task that earned BA9b's
 * coordinator-authorized qwen3-8b override (the locked baseline cannot drive
 * multi-file recall reliably). The create/move probes are mechanical file
 * operations with no comprehension requirement, so they run on the LOCKED
 * baseline (glm-4.7-flash) — no override without a fresh authorization.
 */
const OPENCODE_READ_MODEL = "openrouter/qwen/qwen3-8b";

async function runOpencodeWithModel(
	prompt: string,
	sandboxPath: string,
	model: string,
	timeoutMs: number,
): Promise<string> {
	const { stdout, stderr } = await spawnWithClosedStdin(
		"opencode",
		["run", prompt, "--pure", "--model", model],
		{
			cwd: sandboxPath,
			env: envFor("opencode", sandboxPath),
			timeoutMs,
		},
	);
	return stdout + stderr;
}

const TIMEOUT_MS: Record<"claude" | "codex" | "opencode" | "cursor-agent", number> = {
	claude: 60_000,
	codex: 90_000,
	opencode: 180_000,
	"cursor-agent": 90_000,
};

// ---------------------------------------------------------------------------
// fs helpers
// ---------------------------------------------------------------------------

function listFilesUnder(root: string): Set<string> {
	const out = new Set<string>();
	if (!fs.existsSync(root)) return out;
	for (const entry of fs.readdirSync(root, { withFileTypes: true, recursive: true })) {
		if (entry.isFile()) {
			out.add(path.relative(root, path.join(entry.parentPath, entry.name)));
		}
	}
	return out;
}

interface DiskChange {
	type: "create" | "delete";
	relativePath: string;
	fullPath: string;
}

function diffKnowledgeFiles(root: string, before: Set<string>, after: Set<string>): DiskChange[] {
	const changes: DiskChange[] = [];
	for (const p of after) {
		if (!before.has(p) && p.startsWith("knowledge/")) {
			changes.push({ type: "create", relativePath: p, fullPath: path.join(root, p) });
		}
	}
	for (const p of before) {
		if (!after.has(p) && p.startsWith("knowledge/")) {
			changes.push({ type: "delete", relativePath: p, fullPath: path.join(root, p) });
		}
	}
	return changes;
}

// ---------------------------------------------------------------------------
// Production-path assembly helper — the exact wire admitSession uses:
// assembleSessionKnowledge -> toBakedContextKnowledgeItems -> runSession(assemble).
// ---------------------------------------------------------------------------

async function assembleIntoSandbox(
	db: import("@hyperidle/db").HyperIdleDb,
	sandboxPath: string,
	sessionId: string,
): Promise<void> {
	const knowledge = await assembleSessionKnowledge(db, {
		teamId: TEAM_ID,
		agentRole: "builder",
		taskDescription: "Nested knowledge tree materialisation probe",
		agentId: AGENT_ID,
	});

	const bundle: BakedContextBundle = {
		kind: "task",
		task: { id: `task-${sessionId}`, title: "NKT probe task", description: null, state: "active" },
		ancestors: [],
		agent: { id: AGENT_ID, name: "NKT Probe Agent", role: "builder" },
		team: { id: TEAM_ID, name: "NKT Probe Team" },
		knowledge: toBakedContextKnowledgeItems(knowledge),
	};

	const assembled = await buildTestRunOrchestrationComposition().runSession(
		{ db, eventBus: new EventBus() },
		{
			mode: "assemble",
			input: {
				sandboxPath,
				sessionId,
				taskId: `task-${sessionId}`,
				agentId: AGENT_ID,
				agentRole: "builder",
				teamId: TEAM_ID,
				isRoutine: false,
				sourceKind: null,
				sourceId: null,
				sourceCorrelation: null,
				contextBundle: bundle,
			},
		},
	);

	if (assembled.mode !== "assembled") {
		throw new Error(`Expected assembled mode, got: ${assembled.mode}`);
	}
}

function manifestPathFor(sandboxPath: string): string {
	return path.join(sandboxPath, ".fabric", "manifest.json");
}

const HARNESSES = ["claude", "codex", "opencode", "cursor-agent"] as const;

for (const harness of HARNESSES) {
	describe(`${harness} — nested knowledge tree, real binary`, () => {
		requireHarness(harness);

		// -------------------------------------------------------------------
		// 1 + 2: materialisation (incl. unselected-ancestor index-only) and
		// team-scope isolation, proven by a real agent reading its sandbox.
		// -------------------------------------------------------------------
		dbTest(
			"materialises a nested tree with an index-only unselected ancestor, and hides another team's branch entirely — proven by the real binary reading its own sandbox",
			// @lore nested-knowledge-real-retry: unlike the create/move probes below
			// (mechanical file operations, retry:0), this probe asks the model to find
			// and reason across several nested files — the same class of task the repo's
			// own harness-retry lore names as real-LLM nondeterminism, not a logic break.
			// Observed live: opencode/qwen3-8b globbed the wrong filename pattern once
			// and aborted, then succeeded on a second run with identical fixtures. No
			// override here — this inherits the harness project's own retry:2, the
			// sanctioned mechanism (`.claude/rules/testing.md` "@lore harness-retry").
			async ({ db }) => {
				const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), `nkt-${harness}-read-`));
				const leafSecret = `LEAF-${randomUUID().slice(0, 8).toUpperCase()}`;
				const teamSecret = `TEAM-${randomUUID().slice(0, 8).toUpperCase()}`;
				const rivalSecret = `RIVAL-${randomUUID().slice(0, 8).toUpperCase()}`;
				const parentBodySecret = `PARENTBODY-${randomUUID().slice(0, 8).toUpperCase()}`;
				const childOfParentSecret = `CHILDOFPARENT-${randomUUID().slice(0, 8).toUpperCase()}`;

				// Ancestor NOT independently selected: it belongs to a different
				// user, so fetchOrdinaryItemsByScope("user", AGENT_ID) never fetches
				// it directly — it is only reachable through resolveParentChain's
				// ancestor walk, which has no ownership filter. This is the real,
				// natural condition under which architecture.md §5's "index written
				// anyway" case fires in production.
				const ancestor = await create(db, {
					title: "Findings Archive",
					body: "Ancestor real body text — must NEVER appear verbatim in the materialised index.md.",
					format: "markdown",
					status: "active",
					updatedBy: "seed",
					scopeKind: "user",
					scopeId: OTHER_USER_ID,
				});
				const leaf = await create(db, {
					title: "Deploy Checklist",
					body: `Deploy checklist body.\nSECRET: ${leafSecret}`,
					format: "markdown",
					status: "active",
					updatedBy: "seed",
					scopeKind: "user",
					scopeId: AGENT_ID,
					parentKind: "knowledge_item",
					parentId: ancestor.id,
				});
				await create(db, {
					title: "Team Rituals",
					body: `Team-only info.\nTEAM_TOKEN: ${teamSecret}`,
					format: "markdown",
					status: "active",
					updatedBy: "seed",
					scopeKind: "team",
					scopeId: TEAM_ID,
				});
				await create(db, {
					title: "Rival Team Secrets",
					body: `Must never leave this team.\nRIVAL_TOKEN: ${rivalSecret}`,
					format: "markdown",
					status: "active",
					updatedBy: "seed",
					scopeKind: "team",
					scopeId: OTHER_TEAM_ID,
				});

				// @lore nested-knowledge-real: a selected parent WITH a body AND
				// selected children — the ordinary shape of a real knowledge tree.
				// Both "Roadmap" and its child are independently selected (own team
				// scope, fetched directly by fetchOrdinaryItemsByScope), so Roadmap
				// is ALSO reached as an ancestor through the child's parentChain.
				// Proves the fix in writeOrdinaryItems: Roadmap's real body lands in
				// its own directory's index.md, not a stray sibling leaf file.
				const selectedParent = await create(db, {
					title: "Roadmap",
					body: `Roadmap parent body.\nPARENT_TOKEN: ${parentBodySecret}`,
					format: "markdown",
					status: "active",
					updatedBy: "seed",
					scopeKind: "team",
					scopeId: TEAM_ID,
				});
				const childOfParent = await create(db, {
					title: "Q3 Plan",
					body: `Child under selected parent.\nCHILD_TOKEN: ${childOfParentSecret}`,
					format: "markdown",
					status: "active",
					updatedBy: "seed",
					scopeKind: "team",
					scopeId: TEAM_ID,
					parentKind: "knowledge_item",
					parentId: selectedParent.id,
				});

				await assembleIntoSandbox(db, sandboxPath, `sess-${harness}-read`);

				// --- Deterministic, sanity-break-sensitive assertions ---------
				const ancestorIndexPath = path.join(
					sandboxPath,
					"knowledge",
					"Findings_Archive",
					"index.md",
				);
				expect(fs.existsSync(ancestorIndexPath)).toBe(true);
				const ancestorIndexBody = fs.readFileSync(ancestorIndexPath, "utf8");
				expect(ancestorIndexBody).toBe("# Findings Archive\n");
				expect(ancestorIndexBody).not.toContain("Ancestor real body");

				const leafDirEntries = fs.readdirSync(
					path.join(sandboxPath, "knowledge", "Findings_Archive"),
				);
				const leafFilename = leafDirEntries.find((f) =>
					f.startsWith(`Deploy_Checklist_${leaf.id.slice(0, 8)}`),
				);
				expect(leafFilename).toBeDefined();
				const leafPath = path.join(
					sandboxPath,
					"knowledge",
					"Findings_Archive",
					leafFilename as string,
				);
				expect(fs.readFileSync(leafPath, "utf8")).toContain(leafSecret);

				// Own team branch present; rival team branch absent EVERYWHERE
				// under the sandbox — not just filtered from one card.
				const allFiles = [...listFilesUnder(sandboxPath)];
				const teamFile = allFiles.find((p) => p.startsWith("knowledge/Team_Rituals_"));
				expect(teamFile).toBeDefined();
				expect(fs.readFileSync(path.join(sandboxPath, teamFile as string), "utf8")).toContain(
					teamSecret,
				);
				const rivalFile = allFiles.find((p) => p.includes("Rival"));
				expect(rivalFile).toBeUndefined();
				for (const p of allFiles) {
					expect(fs.readFileSync(path.join(sandboxPath, p), "utf8")).not.toContain(rivalSecret);
				}

				// A selected parent WITH a body AND selected children: its real
				// body lands in its own directory's index.md...
				const roadmapDir = path.join(sandboxPath, "knowledge", "Roadmap");
				const roadmapIndexBody = fs.readFileSync(path.join(roadmapDir, "index.md"), "utf8");
				expect(roadmapIndexBody).toContain(parentBodySecret);
				// ...no stray sibling leaf file next to its own directory...
				const knowledgeRootEntries = fs.readdirSync(path.join(sandboxPath, "knowledge"));
				const strayParentLeaf = knowledgeRootEntries.find((f) =>
					f.startsWith(`Roadmap_${selectedParent.id.slice(0, 8)}`),
				);
				expect(strayParentLeaf).toBeUndefined();
				// ...and its selected child still lands inside its directory.
				const roadmapEntries = fs.readdirSync(roadmapDir);
				const childOfParentFilename = roadmapEntries.find((f) =>
					f.startsWith(`Q3_Plan_${childOfParent.id.slice(0, 8)}`),
				);
				expect(childOfParentFilename).toBeDefined();
				expect(
					fs.readFileSync(path.join(roadmapDir, childOfParentFilename as string), "utf8"),
				).toContain(childOfParentSecret);

				// --- Real agent injection proof --------------------------------
				const prompt =
					`Inside the "knowledge" directory of your current working directory, find a nested document ` +
					`about a "Deploy Checklist" and report the exact value after "SECRET:". Also find a document ` +
					`about "Team Rituals" and report the exact value after "TEAM_TOKEN:". Also find the "Roadmap" ` +
					`document itself (its own index file, not one of its children) and report the exact value after ` +
					`"PARENT_TOKEN:". Finally, search the ENTIRE knowledge directory tree for the exact string ` +
					`"RIVAL_TOKEN" and state YES if you find it or NO if you do not. Respond with exactly four ` +
					`lines, in this format and nothing else:\n` +
					`SECRET=<value>\nTEAM_TOKEN=<value>\nPARENT_TOKEN=<value>\nRIVAL_TOKEN_FOUND=<YES or NO>`;

				const stdout =
					harness === "opencode"
						? await runOpencodeWithModel(
								prompt,
								sandboxPath,
								OPENCODE_READ_MODEL,
								TIMEOUT_MS.opencode,
							)
						: await runHarness(harness, prompt, sandboxPath, TIMEOUT_MS[harness]);

				expect(stdout).toContain(leafSecret);
				expect(stdout).toContain(teamSecret);
				expect(stdout).toContain(parentBodySecret);
				expect(stdout).not.toContain(rivalSecret);

				fs.rmSync(sandboxPath, { recursive: true, force: true });
			},
		);

		// -------------------------------------------------------------------
		// 3: round trip — a real agent creates a nested folder + file.
		// -------------------------------------------------------------------
		dbTest(
			"a real agent creating a nested folder with a file in it produces a real knowledge item with the right parent, and the new folder becomes its own scope-inheriting item",
			{ retry: 0 },
			async ({ db }) => {
				const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), `nkt-${harness}-create-`));
				const writeback = createWritebackProcessor();
				const knowledgeWriter = realKnowledgeWriter();

				// A trivial factory item so the sandbox is a real, non-empty
				// materialised tree — not the substitute of a hand-built manifest.
				await create(db, {
					title: "Welcome",
					body: "Welcome to the team.",
					format: "markdown",
					status: "active",
					updatedBy: "seed",
					scopeKind: "factory",
				});
				await assembleIntoSandbox(db, sandboxPath, `sess-${harness}-create`);

				const before = listFilesUnder(sandboxPath);
				const marker = `CREATE-${randomUUID().slice(0, 8).toUpperCase()}`;
				const content = `Roadmap notes.\nMARKER: ${marker}`;

				const prompt =
					`Create a new file at the exact relative path "knowledge/newideas/roadmap.md" from your current ` +
					`working directory. Create the "newideas" directory first if it does not already exist. The file's ` +
					`content must be EXACTLY the following, with no extra text before or after it:\n\n${content}`;

				await runHarness(harness, prompt, sandboxPath, TIMEOUT_MS[harness]);

				const after = listFilesUnder(sandboxPath);
				const changes = diffKnowledgeFiles(sandboxPath, before, after);
				const created = changes.filter((c) => c.type === "create");
				expect(created.length).toBeGreaterThan(0);

				await writeback.process(
					{
						db,
						sandboxPath,
						sessionId: `sess-${harness}-create`,
						manifestPath: manifestPathFor(sandboxPath),
						knowledge: knowledgeWriter,
					},
					created,
				);

				const roadmapRows = await db
					.select()
					.from(knowledgeItems)
					.where(eq(knowledgeItems.title, "roadmap"));
				expect(roadmapRows).toHaveLength(1);
				// @lore nested-knowledge-real-trailing-newline: a real agent's file-write
				// tool commonly appends a trailing newline (the POSIX "file ends with a
				// newline" convention) — the writeback processor stores whatever bytes are
				// on disk verbatim (production behaviour, correct), so the exact-content
				// assertion is trimmed on the END only. The marker check right after this
				// still fails if the agent altered the CONTENT itself, which is what this
				// assertion exists to catch.
				expect(roadmapRows[0]?.body.trimEnd()).toBe(content);
				expect(roadmapRows[0]?.body).toContain(marker);
				expect(roadmapRows[0]?.parentKind).toBe("knowledge_item");

				const folderRows = await db
					.select()
					.from(knowledgeItems)
					.where(eq(knowledgeItems.title, "newideas"));
				expect(folderRows).toHaveLength(1);
				expect(folderRows[0]?.parentId).toBeNull();
				// D4: a new directory at the knowledge/ root inherits the implicit
				// root scope, "factory" — and the created leaf inherits ITS scope.
				expect(folderRows[0]?.scopeKind).toBe("factory");
				expect(roadmapRows[0]?.parentId).toBe(folderRows[0]?.id);
				expect(roadmapRows[0]?.scopeKind).toBe("factory");

				fs.rmSync(sandboxPath, { recursive: true, force: true });
			},
		);

		// -------------------------------------------------------------------
		// 4: move — a real agent moves an ALREADY-MATERIALISED file (id
		// suffix intact) into a different directory.
		// -------------------------------------------------------------------
		dbTest(
			"a real agent moving an existing materialised file reparents the same item by its id suffix — no duplicate, body untouched",
			{ retry: 0 },
			async ({ db }) => {
				const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), `nkt-${harness}-move-`));
				const writeback = createWritebackProcessor();
				const knowledgeWriter = realKnowledgeWriter();

				// Same "different owner" trick as the read test, so the folder
				// with a child does not also get independently selected (see the
				// file-header @lore for why that combination is avoided here).
				const folder = await create(db, {
					title: "Folder A",
					body: "folder body — never independently selected",
					format: "markdown",
					status: "active",
					updatedBy: "seed",
					scopeKind: "user",
					scopeId: OTHER_USER_ID,
				});
				const originalBody = "The original roadmap body. Do not change this text.";
				const doc = await create(db, {
					title: "Roadmap Doc",
					body: originalBody,
					format: "markdown",
					status: "active",
					updatedBy: "seed",
					scopeKind: "user",
					scopeId: AGENT_ID,
					parentKind: "knowledge_item",
					parentId: folder.id,
				});

				await assembleIntoSandbox(db, sandboxPath, `sess-${harness}-move`);

				const docFilename = fs
					.readdirSync(path.join(sandboxPath, "knowledge", "Folder_A"))
					.find((f) => f.startsWith(`Roadmap_Doc_${doc.id.slice(0, 8)}`));
				expect(docFilename).toBeDefined();

				const before = listFilesUnder(sandboxPath);

				const prompt =
					`Move the file at the exact relative path "knowledge/Folder_A/${docFilename}" to the exact relative ` +
					`path "knowledge/Reviewed/${docFilename}" from your current working directory. Create the ` +
					`"Reviewed" directory if it does not already exist. Preserve the filename EXACTLY — do not rename ` +
					`it — and do not change the file's content.`;

				await runHarness(harness, prompt, sandboxPath, TIMEOUT_MS[harness]);

				const after = listFilesUnder(sandboxPath);
				const changes = diffKnowledgeFiles(sandboxPath, before, after);
				expect(changes.some((c) => c.type === "delete")).toBe(true);
				expect(changes.some((c) => c.type === "create")).toBe(true);

				await writeback.process(
					{
						db,
						sandboxPath,
						sessionId: `sess-${harness}-move`,
						manifestPath: manifestPathFor(sandboxPath),
						knowledge: knowledgeWriter,
					},
					changes,
				);

				const rows = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, doc.id));
				expect(rows).toHaveLength(1);
				expect(rows[0]?.body).toBe(originalBody);

				const reviewedRows = await db
					.select()
					.from(knowledgeItems)
					.where(eq(knowledgeItems.title, "Reviewed"));
				expect(reviewedRows).toHaveLength(1);
				expect(rows[0]?.parentId).toBe(reviewedRows[0]?.id);
				expect(rows[0]?.parentId).not.toBe(folder.id);

				const allRoadmapDocs = await db
					.select()
					.from(knowledgeItems)
					.where(eq(knowledgeItems.title, "Roadmap Doc"));
				expect(allRoadmapDocs).toHaveLength(1);

				fs.rmSync(sandboxPath, { recursive: true, force: true });
			},
		);
	});
}
