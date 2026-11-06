import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyProvisioningPlan, type ProvisioningPlan } from "../connection-provisioning.js";

let sandboxPath: string;

beforeEach(() => {
	sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "conn-prov-test-"));
});

afterEach(() => {
	fs.rmSync(sandboxPath, { recursive: true, force: true });
});

describe("applyProvisioningPlan codex-toml", () => {
	it("escapes special chars in URL for -c args", async () => {
		// URL containing a double-quote, backslash, and newline
		const url = `http://host/path?a="value"&b=\\path\nend`;
		const plan: ProvisioningPlan = {
			mcpServers: [{ name: "conn-test", url, bearerToken: "tok" }],
			envInjections: {},
		};

		const result = await applyProvisioningPlan({
			plan,
			sandboxPath,
			cliMcpDialect: "codex-toml",
			claudeNative: false,
		});

		expect(result.cliConfigArgs).toBeDefined();
		const urlArg = result.cliConfigArgs?.find((a) => a.startsWith("mcp_servers.conn-test.url="));
		expect(urlArg).toBeDefined();
		// Must NOT contain raw quote, raw backslash (unescaped), or raw newline
		expect(urlArg).not.toContain('="value"');
		// Escaped quote must be present
		expect(urlArg).toContain('\\"');
		// Escaped backslash must be present
		expect(urlArg).toContain("\\\\");
		// Escaped newline must be present
		expect(urlArg).toContain("\\n");
		// No raw newline
		expect(urlArg).not.toMatch(/[^\n]?\n/);
	});

	it("passes bearer_token_env_var arg through unescaped", async () => {
		const plan: ProvisioningPlan = {
			mcpServers: [{ name: "my-svc", url: "http://host/mcp", bearerToken: "tok" }],
			envInjections: {},
		};

		const result = await applyProvisioningPlan({
			plan,
			sandboxPath,
			cliMcpDialect: "codex-toml",
			claudeNative: false,
		});

		expect(
			result.cliConfigArgs?.some((a) => a.startsWith("mcp_servers.my-svc.bearer_token_env_var=")),
		).toBe(true);
		expect(result.mcpTokenEnv).toMatchObject({ MY_SVC_MCP_TOKEN: "tok" });
	});
});
