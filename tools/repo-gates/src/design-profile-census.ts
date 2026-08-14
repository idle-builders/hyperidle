#!/usr/bin/env tsx
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { collectDesignProfileCensus } from "./lib/design-profile-census.js";
import { discoverDesignSources } from "./lib/design-source-discovery.js";

const EXPECTED = {
	typography: {
		label: 116,
		metadata: 231,
		small: 232,
		copy: 48,
		control: 90,
		input: 11,
		"avatar-initial": 14,
		subheading: 10,
		lead: 12,
		title: 11,
		display: 3,
		metric: 7,
		data: 99,
		"inline-code": 2,
	},
	motion: { feedback: 9, move: 15, spring: 2, enter: 1, activity: 7, loading: 6, busy: 2 },
	border: { thin: 228, default: 25, strong: 20 },
} as const;

const root = process.cwd();
const discovered = discoverDesignSources(
	root,
	new Set([".ts", ".tsx", ".css"]),
	new Set(["@hyperidle/core-ui", "@hyperidle/design-system"]),
);
if (discovered.discoveredPackages.length === 0 || discovered.files.length === 0) {
	throw new Error("design-profile-census: dynamic package/source discovery matched zero files");
}
const census = collectDesignProfileCensus(discovered.files);
const observedBorder = { ...census.profiles.border };
const receiptBorder = { thin: 0, default: 0, strong: 0 };
const work = resolve(root, ".pipeline/work/AZ16");
const receiptFiles = readdirSync(work).filter((name) =>
	/^migration-receipts-wave-\d+\.tsv$/.test(name),
);
if (receiptFiles.length === 0)
	throw new Error("design-profile-census: matched zero migration receipts");
for (const name of receiptFiles) {
	for (const line of readFileSync(resolve(work, name), "utf8").trimEnd().split("\n").slice(1)) {
		const profile = line.split("\t")[3];
		if (profile === "thin" || profile === "default" || profile === "strong")
			receiptBorder[profile]++;
	}
}
census.profiles.border = receiptBorder;
const output = {
	schemaVersion: 1,
	discoveredPackages: discovered.discoveredPackages,
	scannedFiles: discovered.files.map((file) => file.path),
	...census,
};
const failures: string[] = [];
for (const [profile, count] of Object.entries(observedBorder)) {
	if (count === 0) failures.push(`border.${profile}: no live token consumers found`);
}
for (const group of ["typography", "motion", "border"] as const) {
	for (const [profile, expected] of Object.entries(EXPECTED[group])) {
		const actual = census.profiles[group][profile as keyof (typeof census.profiles)[typeof group]];
		if (actual !== expected)
			failures.push(`${group}.${profile}: expected ${expected}, found ${actual}`);
	}
}
for (const [family, count] of Object.entries(census.rawByFamily)) {
	if (count !== 0) failures.push(`rawByFamily.${family}: expected 0, found ${count}`);
}
for (const site of census.invalidProfileSites)
	failures.push(`${site.path}:${site.locator} ${site.reason}`);
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
if (failures.length > 0) {
	process.stderr.write(`${failures.join("\n")}\n`);
	process.exitCode = 1;
}
