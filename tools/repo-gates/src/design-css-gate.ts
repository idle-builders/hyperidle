#!/usr/bin/env tsx
import { evaluateDesignCss } from "./lib/design-css-verdict.js";
import { discoverDesignSources } from "./lib/design-source-discovery.js";

const root = process.cwd();
const discovered = discoverDesignSources(
	root,
	new Set([".css"]),
	new Set(["@hyperidle/core-ui", "@hyperidle/design-system"]),
);
if (discovered.discoveredPackages.length === 0 || discovered.files.length === 0) {
	throw new Error("design-css-gate: dynamic package/CSS discovery matched zero files");
}
const findings = evaluateDesignCss(
	discovered.files.map((file) => ({ path: file.path, css: file.content })),
);
if (findings.length > 0) {
	for (const item of findings) {
		process.stderr.write(`${item.path}:${item.line} ${item.family} ${item.message}\n`);
	}
	process.exitCode = 1;
} else {
	process.stdout.write(`design-css-gate: OK (${discovered.files.length} production CSS files)\n`);
}
