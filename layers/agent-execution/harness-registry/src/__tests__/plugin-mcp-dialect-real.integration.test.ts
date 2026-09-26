/**
 * Plugin stdio MCP dialect shape live-proof.
 *
 * The dialect config file produced by writePluginStdioMcpEntries is read and
 * accepted by the real binary in a sandbox.
 *
 * Proof method (codex-toml and opencode-json dialects):
 *   1. Write a minimal stdio MCP server script that advertises one uniquely-named tool
 *      (XPROBE_TOOL_BA9B) to a temp file.
 *   2. Call the production writePluginStdioMcpEntries() with the dialect under test,
 *      producing the dialect config file in a sandbox directory.
 *   3. Run `codex mcp list` / `opencode mcp list` in the sandbox and assert the
 *      probe server key appears in output, proving the dialect shape is accepted.
 *
 * This settles the ⚠️ UNVERIFIED markers that were in cli-mcp-config.ts:
 *
 *   codex-toml: [mcp_servers.key] with separate command/args TOML fields — VERIFIED.
 *     `codex mcp list` shows the server as "enabled" with the correct command.
 *
 *   opencode-json: type:"local" with command as a merged [binary, ...args] array —
 *     VERIFIED. `opencode mcp list` shows the server as "connected". A string command
 *     + separate args is silently rejected ("Ignoring MCP config entry without type").
 *
 * Sanity-break:
 *   Temporarily replace `type: "local"` with `type: "wrong"` in
 *   writePluginEntriesOpencodeJson. Re-run. The opencode test goes RED because
 *   the server no longer appears as connected (opencode ignores entries with unknown
 *   types). Restore before committing.
 *
 *   For codex: temporarily change `[mcp_servers.key]` to `[mcp_server.key]` (missing
 *   's'). Re-run. The codex test goes RED because `codex mcp list` shows no servers.
 *
 * HARNESS LANE: real binaries, zero stubs, no LLM calls.
 * Gate: requireHarness("codex") / requireHarness("opencode") — hard-fail if absent.
 * Local-only: no CI job exists for this lane by design.
 *
 * @lore BA9b AC6 dialect-proof: placed in harness-registry/__tests__/ so it can
 *   import writePluginStdioMcpEntries directly from the harness-registry package
 *   (within the same layer — no governance boundary crossed). No DB needed; the test
 *   only exercises file writing + binary config reading.
 *
 * @lore BA9b AC6 opencode-command-array: opencode 1.18.x requires command to be a
 *   SINGLE array [binary, ...args]. A string command + separate args array is rejected
 *   with "Ignoring MCP config entry without type". Verified 2026-08-26.
 *
 * @lore BA9b AC6 codex-mcp-list-status: `codex mcp list` shows status "enabled" for
 *   configured servers regardless of whether the subprocess is currently running.
 *   The server appearing in the list (with the correct command) proves the TOML shape
 *   is accepted. A full connection handshake would require `codex mcp get <name>`.
 */

import { execFileSync, execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { writePluginStdioMcpEntries } from "@hyperidle/harness-registry";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { requireHarness } from "./require-harness.js";

// ---------------------------------------------------------------------------
// Minimal stdio MCP probe server script.
// Implements MCP 2024-11-05: initialize + tools/list (returns XPROBE_TOOL_BA9B).
// ---------------------------------------------------------------------------

const PROBE_SERVER_SCRIPT = `#!/usr/bin/env node
// Minimal stdio MCP 2024-11-05 server: exposes XPROBE_TOOL_BA9B
import { createInterface } from 'node:readline';
const rl = createInterface({ input: process.stdin });
function send(obj) { process.stdout.write(JSON.stringify(obj) + '\\n'); }
rl.on('line', (line) => {
  const raw = line.trim(); if (!raw) return;
  let req; try { req = JSON.parse(raw); } catch { return; }
  if (req.method === 'initialize') {
    send({ jsonrpc:'2.0', id:req.id, result:{
      protocolVersion:'2024-11-05',
      capabilities:{tools:{}},
      serverInfo:{name:'ba9b-dialect-probe',version:'1.0.0'}
    }});
  } else if (req.method === 'initialized') {
    // notification — no response
  } else if (req.method === 'tools/list') {
    send({ jsonrpc:'2.0', id:req.id, result:{ tools:[{
      name:'XPROBE_TOOL_BA9B',
      description:'BA9b MCP dialect probe tool',
      inputSchema:{type:'object',properties:{}}
    }]}});
  } else if (req.id != null) {
    send({ jsonrpc:'2.0', id:req.id, error:{code:-32601,message:'Method not found'}});
  }
});
`;

const NODE_BIN = "/opt/homebrew/opt/node@24/bin/node";

// ---------------------------------------------------------------------------
// Per-test sandbox state
// ---------------------------------------------------------------------------

let sandboxPath: string;
let probeServerScript: string;

beforeEach(() => {
	sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "ba9b-dialect-probe-"));
	probeServerScript = path.join(sandboxPath, "probe-server.mjs");
	fs.writeFileSync(probeServerScript, PROBE_SERVER_SCRIPT, { mode: 0o755 });
});

afterEach(() => {
	fs.rmSync(sandboxPath, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// codex-toml dialect
// ---------------------------------------------------------------------------

describe("BA9b AC6: codex-toml dialect", () => {
	it("writePluginStdioMcpEntries writes .codex-home/config.toml that codex mcp list accepts", () => {
		requireHarness("codex");

		writePluginStdioMcpEntries({
			dialect: "codex-toml",
			sandboxPath,
			servers: [
				{
					key: "ba9b-probe",
					config: { command: NODE_BIN, args: [probeServerScript] },
				},
			],
		});

		// Verify config file was written.
		const tomlPath = path.join(sandboxPath, ".codex-home", "config.toml");
		expect(fs.existsSync(tomlPath), `config.toml must exist at ${tomlPath}`).toBe(true);
		const tomlContent = fs.readFileSync(tomlPath, "utf-8");
		expect(tomlContent).toContain("[mcp_servers.ba9b-probe]");
		expect(tomlContent).toContain(NODE_BIN);

		// Run `codex mcp list` with CODEX_HOME pointing at .codex-home/.
		const codexHomeDir = path.join(sandboxPath, ".codex-home");
		const result = execFileSync("codex", ["mcp", "list"], {
			env: { ...process.env, CODEX_HOME: codexHomeDir },
			timeout: 15_000,
			encoding: "utf-8",
		});
		// The server name must appear in the list output.
		expect(result).toContain("ba9b-probe");
	});

	it("env and cwd fields are written to TOML and read by codex", () => {
		requireHarness("codex");

		writePluginStdioMcpEntries({
			dialect: "codex-toml",
			sandboxPath,
			servers: [
				{
					key: "ba9b-probe-env",
					config: {
						command: NODE_BIN,
						args: [probeServerScript],
						env: { XPROBE_ENV_KEY: "xprobe-env-value" },
						cwd: sandboxPath,
					},
				},
			],
		});

		const tomlPath = path.join(sandboxPath, ".codex-home", "config.toml");
		const tomlContent = fs.readFileSync(tomlPath, "utf-8");
		expect(tomlContent).toContain("XPROBE_ENV_KEY");
		expect(tomlContent).toContain("xprobe-env-value");
		expect(tomlContent).toContain(`cwd = "${sandboxPath}"`);

		const codexHomeDir = path.join(sandboxPath, ".codex-home");
		const result = execFileSync("codex", ["mcp", "list"], {
			env: { ...process.env, CODEX_HOME: codexHomeDir },
			timeout: 15_000,
			encoding: "utf-8",
		});
		expect(result).toContain("ba9b-probe-env");
	});
});

// ---------------------------------------------------------------------------
// opencode-json dialect
// ---------------------------------------------------------------------------

describe("BA9b AC6: opencode-json dialect", () => {
	it("writePluginStdioMcpEntries writes opencode.json with command array that opencode connects to", () => {
		requireHarness("opencode");

		writePluginStdioMcpEntries({
			dialect: "opencode-json",
			sandboxPath,
			servers: [
				{
					key: "ba9b-probe",
					config: { command: NODE_BIN, args: [probeServerScript] },
				},
			],
		});

		// Verify config file shape: command must be an array.
		const jsonPath = path.join(sandboxPath, "opencode.json");
		expect(fs.existsSync(jsonPath), `opencode.json must exist at ${jsonPath}`).toBe(true);
		const parsed = JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as {
			mcp?: Record<string, { type: string; command?: string[] }>;
		};
		const entry = parsed.mcp?.["ba9b-probe"];
		expect(entry?.type).toBe("local");
		expect(Array.isArray(entry?.command)).toBe(true);
		expect(entry?.command?.[0]).toBe(NODE_BIN);

		// Run `opencode mcp list` in the sandbox cwd.
		// opencode reads opencode.json from the cwd when run with `--pure` to skip
		// plugin loading, and merges with the global config (~/.config/opencode/).
		const result = execSync("opencode mcp list", {
			cwd: sandboxPath,
			env: { ...process.env, PWD: sandboxPath },
			timeout: 20_000,
			encoding: "utf-8",
		});
		// The server must appear and be connected (successful MCP handshake).
		expect(result).toContain("ba9b-probe");
		expect(result).toContain("connected");
	});

	it("env field is written to opencode.json and does not break connection", () => {
		requireHarness("opencode");

		writePluginStdioMcpEntries({
			dialect: "opencode-json",
			sandboxPath,
			servers: [
				{
					key: "ba9b-probe-env",
					config: {
						command: NODE_BIN,
						args: [probeServerScript],
						env: { XPROBE_ENV_KEY: "xprobe-env-value" },
					},
				},
			],
		});

		const jsonPath = path.join(sandboxPath, "opencode.json");
		const parsed = JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as {
			mcp?: Record<string, { env?: Record<string, string> }>;
		};
		const envObj = parsed.mcp?.["ba9b-probe-env"]?.env;
		expect(envObj).toEqual({ XPROBE_ENV_KEY: "xprobe-env-value" });

		const result = execSync("opencode mcp list", {
			cwd: sandboxPath,
			env: { ...process.env, PWD: sandboxPath },
			timeout: 20_000,
			encoding: "utf-8",
		});
		expect(result).toContain("ba9b-probe-env");
		expect(result).toContain("connected");
	});
});
