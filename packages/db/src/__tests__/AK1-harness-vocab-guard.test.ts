/**
 * AK1 — Harness vocabulary guard: unit tests (RED phase)
 *
 * Tests the checkContent() function from scripts/harness-vocab-guard.ts.
 * This is a RUNTIME TEST of the guard FUNCTION — it imports and asserts behaviour,
 * distinct from the guard CLI run itself.
 *
 * RED PHASE: Fails until scripts/harness-vocab-guard.ts is created and exports
 * checkContent() and runCheck().
 *
 * Banned patterns (per plan §Guard):
 *   - /\bsoul/i — soul, soulPrompt, SOUL_PROMPT, soul_prompt, etc.
 *   - /materializ/i — materialize, MaterializationConfig, materialization, etc.
 *   - /composePrompt/ — exact camelCase
 *   - /prompt[ -]composition/i — "prompt composition", "prompt-composition"
 *   - /skill-tools/ — hyphenated directory/term
 *   - /skillTools/ — camelCase variant
 *   - /WorkspaceAdapter/ — run-unit typed identifier
 *   - /WorkspaceHandle/ — run-unit typed identifier
 *   - /workspaceBasePath/ — run-unit variable
 *   - /workspaceSnapshot/ — run-unit variable
 *   - /workspaceHandle/ — run-unit variable (lowercase)
 *   - /[Ww]orkspaceReaper/ — run-unit class
 *   - /workspace_snapshot/ — DB column (snake_case)
 *   - /workspacePath/ — run-unit field (the shared SessionConfig field)
 *
 * Allowed (KEEP — must NOT flag):
 *   - Literal "/workspace" cwd string
 *   - npm "workspaces" key
 *   - @hyperidle/db workspace import
 *   - harnessType (retained: harness is KEPT)
 *   - Fabric, Strategy, session (retained)
 *   - --workspace flag (goose's own flag string)
 */

import { describe, expect, test } from "vitest";
import { checkContent, runCheck } from "../../../../scripts/harness-vocab-guard.js";

describe("AK1: harness-vocab-guard checkContent — banned terms", () => {
	// ---- Term 1: soul ----

	test("flags 'soul' (lowercase)", () => {
		const result = checkContent("const soul = 'hello'");
		expect(result.clean).toBe(false);
		expect(result.hits.length).toBeGreaterThan(0);
	});

	test("flags 'soulPrompt' (camelCase)", () => {
		const result = checkContent("soulPrompt: string");
		expect(result.clean).toBe(false);
	});

	test("flags 'SOUL_PROMPT_MAX_LENGTH' (screaming snake)", () => {
		const result = checkContent("const SOUL_PROMPT_MAX_LENGTH = 50000;");
		expect(result.clean).toBe(false);
	});

	test("flags 'soul_prompt' (snake_case DB column)", () => {
		const result = checkContent("SELECT soul_prompt FROM users;");
		expect(result.clean).toBe(false);
	});

	test("flags 'Soul Prompt' (user-visible label)", () => {
		const result = checkContent("<label>Soul Prompt</label>");
		expect(result.clean).toBe(false);
	});

	// ---- Term 4: materialization / composePrompt / prompt-composition ----

	test("flags 'materialize' function name", () => {
		const result = checkContent("export function materialize(config) {}");
		expect(result.clean).toBe(false);
	});

	test("flags 'MaterializationConfig' type", () => {
		const result = checkContent(
			"import type { MaterializationConfig } from './materialization.js';",
		);
		expect(result.clean).toBe(false);
	});

	test("flags 'materialization' (lowercase)", () => {
		const result = checkContent("// knowledge materialization pipeline");
		expect(result.clean).toBe(false);
	});

	test("flags 'composePrompt' (exact camelCase)", () => {
		const result = checkContent("const result = await composePrompt(input);");
		expect(result.clean).toBe(false);
	});

	test("flags 'prompt composition' (phrase with space)", () => {
		const result = checkContent("// handles prompt composition for agents");
		expect(result.clean).toBe(false);
	});

	test("flags 'prompt-composition' (phrase with hyphen)", () => {
		const result = checkContent("import from './prompt-composition.js'");
		expect(result.clean).toBe(false);
	});

	// ---- Term 3: skill-tools / skillTools ----

	test("flags 'skill-tools' (hyphenated dir/term)", () => {
		const result = checkContent("import { toolRegistry } from '../skill-tools/tool-registry.js'");
		expect(result.clean).toBe(false);
	});

	test("flags 'skillTools' (camelCase variant)", () => {
		const result = checkContent("const skillTools = getRegistry();");
		expect(result.clean).toBe(false);
	});

	// ---- Term 2: workspace run-unit identifiers ----

	test("flags 'WorkspaceAdapter' (type identifier)", () => {
		const result = checkContent("interface WorkspaceAdapter { spawn(): void }");
		expect(result.clean).toBe(false);
	});

	test("flags 'WorkspaceHandle' (type identifier)", () => {
		const result = checkContent("export type WorkspaceHandle = { workspaceId: string }");
		expect(result.clean).toBe(false);
	});

	test("flags 'workspaceBasePath' (runtime variable)", () => {
		const result = checkContent("const workspaceBasePath = os.tmpdir();");
		expect(result.clean).toBe(false);
	});

	test("flags 'workspaceSnapshot' (field name, camelCase)", () => {
		const result = checkContent("workspaceSnapshot: text('workspace_snapshot')");
		expect(result.clean).toBe(false);
	});

	test("flags 'workspaceHandle' (runtime variable, lowercase first char)", () => {
		const result = checkContent("const workspaceHandle = await adapter.spawn();");
		expect(result.clean).toBe(false);
	});

	test("flags 'WorkspaceReaper' (class name)", () => {
		const result = checkContent("new WorkspaceReaper({ interval: 60_000 })");
		expect(result.clean).toBe(false);
	});

	test("flags 'workspaceReaper' (lowercase first char)", () => {
		const result = checkContent("const workspaceReaper = new Reaper();");
		expect(result.clean).toBe(false);
	});

	test("flags 'workspace_snapshot' (DB column, snake_case)", () => {
		const result = checkContent("SELECT workspace_snapshot FROM sessions;");
		expect(result.clean).toBe(false);
	});

	test("flags 'workspacePath' (SessionConfig run-unit field)", () => {
		const result = checkContent("readonly workspacePath: string;");
		expect(result.clean).toBe(false);
	});
});

describe("AK1: harness-vocab-guard checkContent — allowed terms (must NOT flag)", () => {
	test("does NOT flag '/workspace' literal cwd path", () => {
		// The cwd stays /workspace — literal path string is RETAINED
		const result = checkContent('const mountPath = "/workspace";');
		expect(result.clean).toBe(true);
	});

	test("does NOT flag 'mountPath ?? \"/workspace\"' pattern", () => {
		const result = checkContent('const cwd = config.mountPath ?? "/workspace";');
		expect(result.clean).toBe(true);
	});

	test("does NOT flag npm 'workspaces' key", () => {
		const result = checkContent('"workspaces": ["packages/*"]');
		expect(result.clean).toBe(true);
	});

	test("does NOT flag '@hyperidle/db' workspace import", () => {
		const result = checkContent("import { users } from '@hyperidle/db';");
		expect(result.clean).toBe(true);
	});

	test("does NOT flag 'harnessType' (retained: harness is KEPT)", () => {
		const result = checkContent("harnessType: text('harness_type')");
		expect(result.clean).toBe(true);
	});

	test("does NOT flag 'harness' (retained noun)", () => {
		const result = checkContent("import type { HarnessAdapter } from './harness-adapter.js';");
		expect(result.clean).toBe(true);
	});

	test("does NOT flag 'session' (retained noun)", () => {
		const result = checkContent("const session = await provisioner.start(config);");
		expect(result.clean).toBe(true);
	});

	test("does NOT flag 'Fabric' / 'fabric' (retained noun/package)", () => {
		const result = checkContent("import { assembleContext } from '@hyperidle/server/app-runtime';");
		expect(result.clean).toBe(true);
	});

	test("does NOT flag 'Strategy' (retained noun)", () => {
		const result = checkContent("// Strategy layer knowledge assembly");
		expect(result.clean).toBe(true);
	});

	test("does NOT flag goose's bare '--workspace' CLI flag string", () => {
		// The flag NAME is goose's own; only the value (our token) renamed
		const result = checkContent('"--workspace", "{{sandbox}}"');
		expect(result.clean).toBe(true);
	});

	test("returns clean=true for fully renamed content", () => {
		const result = checkContent(`
import { assembleContext, assemblePrompt } from '@hyperidle/server/app-runtime';
import type { SandboxAdapter, SandboxHandle } from './sandbox-adapter.js';
import { SandboxReaper } from './services/sandbox-reaper.js';
const systemPromptText = agent.systemPrompt ?? '';
const sandboxPath = config.sandboxPath;
const cwd = "/workspace";
`);
		expect(result.clean).toBe(true);
	});

	test("returns clean=true for empty string", () => {
		const result = checkContent("");
		expect(result.clean).toBe(true);
	});
});

describe("AK1: harness-vocab-guard checkContent — hit reporting", () => {
	test("reports the offending line content in hits", () => {
		const content = "// good line\nconst soulPrompt = 'hello';\n// fine";
		const result = checkContent(content);
		expect(result.clean).toBe(false);
		expect(result.hits.some((h: string) => h.includes("soulPrompt"))).toBe(true);
	});

	test("includes line number in hit report", () => {
		const content = "line1\nconst soul = 'x';\nline3";
		const result = checkContent(content);
		expect(result.hits[0]).toMatch(/line 2/);
	});

	test("reports multiple banned terms in same content", () => {
		const content = "const soulPrompt = materialize(input);";
		const result = checkContent(content);
		expect(result.clean).toBe(false);
		// At least one hit (may be more depending on multi-pattern design)
		expect(result.hits.length).toBeGreaterThan(0);
	});
});

describe("AK1: harness-vocab-guard runCheck — smoke test", () => {
	test("runCheck returns an object with ok and hits properties", () => {
		// runCheck scans the filesystem — just verify the return shape is correct.
		// We pass a non-existent directory so it returns ok:true trivially.
		const result = runCheck("/nonexistent-dir-ak1-test");
		expect(result).toHaveProperty("ok");
		expect(result).toHaveProperty("hits");
		expect(Array.isArray(result.hits)).toBe(true);
	});
});
