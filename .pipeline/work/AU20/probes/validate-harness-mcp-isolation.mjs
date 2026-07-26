import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { build } from "esbuild";

const root = process.cwd();
const packageRoot = path.join(root, "packages/agent-execution/harness-registry");
const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
const failures = [];

const mainTarget = manifest.exports?.["."];
if (typeof mainTarget !== "string") failures.push("package export '.' must resolve to one source entry");
const mainEntry =
	typeof mainTarget === "string" ? path.resolve(packageRoot, mainTarget) : path.join(packageRoot, "");

let metafile = { inputs: {} };
if (!fs.existsSync(mainEntry)) {
	failures.push(`main entry does not exist: ${path.relative(root, mainEntry)}`);
} else {
	try {
		({ metafile } = await build({
			absWorkingDir: root,
			entryPoints: [mainEntry],
			bundle: true,
			platform: "node",
			format: "esm",
			packages: "external",
			plugins: [
				{
					name: "external-packages",
					setup(bundle) {
						bundle.onResolve({ filter: /^[^./]|^@/ }, ({ path: specifier }) => ({
							path: specifier,
							external: true,
						}));
					},
				},
			],
			write: false,
			metafile: true,
			logLevel: "silent",
		}));
	} catch (error) {
		failures.push(`main bundle failed: ${error instanceof Error ? error.message : String(error)}`);
	}
}

const forbiddenPackages = ["@modelcontextprotocol/sdk", "hono", "zod"];
const graphFiles = Object.keys(metafile.inputs).sort();
for (const input of graphFiles) {
	const normalized = input.split(path.sep).join("/");
	const relative = path.relative(packageRoot, path.resolve(root, input)).split(path.sep).join("/");
	if (relative.startsWith("src/mcp/")) {
		failures.push(`main graph includes MCP implementation: ${relative}`);
	}
	const imports = metafile.inputs[input]?.imports ?? [];
	for (const forbidden of forbiddenPackages) {
		if (
			imports.some(
				(entry) =>
					entry.path === forbidden ||
					entry.path.startsWith(`${forbidden}/`) ||
					entry.path.includes(`/node_modules/${forbidden}/`),
			)
		) {
			failures.push(`main graph imports ${forbidden} via ${relative}`);
		}
	}
	if (
		normalized.endsWith("/src/index.ts") &&
		imports.some((entry) => entry.path.endsWith("/src/mcp-tool-bridge.ts"))
	) {
		failures.push("main index re-exports the MCP bridge");
	}
}

const mcpTarget = manifest.exports?.["./mcp"];
if (typeof mcpTarget !== "string") {
	failures.push("package export './mcp' is missing");
} else {
	const mcpEntry = path.resolve(packageRoot, mcpTarget);
	if (!mcpEntry.startsWith(`${packageRoot}${path.sep}`) || !fs.existsSync(mcpEntry)) {
		failures.push("package export './mcp' does not resolve to a package source file");
	} else {
		const probeDir = fs.mkdtempSync(path.join(root, ".au20-mcp-isolation-"));
		const probePath = path.join(probeDir, "probe.mts");
		try {
			fs.writeFileSync(
				probePath,
				[
					'const ns = await import("@hyperidle/harness-registry/mcp");',
					'if (!Object.hasOwn(ns, "createMcpToolBridge")) process.exit(41);',
					'if (typeof ns.createMcpToolBridge !== "function") process.exit(42);',
					'if (!Object.hasOwn(ns, "returnStatusTool")) process.exit(43);',
					'if (typeof ns.returnStatusTool !== "function") process.exit(44);',
				].join("\n"),
			);
			const runtimeProbe = spawnSync(
				process.execPath,
				["--import", "tsx", probePath],
				{ cwd: root, encoding: "utf8" },
			);
			if (runtimeProbe.status !== 0) {
				failures.push(
					`runtime import '@hyperidle/harness-registry/mcp' lacks own createMcpToolBridge/returnStatusTool functions (exit ${runtimeProbe.status ?? "signal"})`,
				);
			}
		} finally {
			fs.rmSync(probeDir, { recursive: true, force: true });
		}
	}
}

if (failures.length > 0) {
	process.stderr.write(`${JSON.stringify({ verdict: "RED", failures }, null, 2)}\n`);
	process.exit(1);
}

process.stdout.write(
	`${JSON.stringify({
		verdict: "PASS",
		mainEntry: path.relative(root, mainEntry),
		mainGraphFiles: graphFiles,
		mcpEntry: path.relative(root, path.resolve(packageRoot, mcpTarget)),
		runtimeCreateMcpToolBridge: "function",
		runtimeReturnStatusTool: "function",
	})}\n`,
);
