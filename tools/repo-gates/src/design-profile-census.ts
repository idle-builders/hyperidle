#!/usr/bin/env tsx
import {
	collectDesignProfileCensus,
	findLiveBorderCountMismatches,
} from "./lib/design-profile-census.js";
import { discoverDesignSources } from "./lib/design-source-discovery.js";

// Immutable audit receipts count pre-migration authored sites, not final source
// declarations. Shared class construction (including the upstream PageHeader
// pane consolidation) combines equivalent sites, so the approved receipt
// expansion is the measured final source-profile population.
// Deletion pass: -1 thin, from select-diff.tsx.
const APPROVED_BORDER_RECEIPT_EXPANSION = { thin: 206, default: 17, strong: 11 } as const;

const EXPECTED = {
	typography: {
		label: 115, // -1: read-mode ConversationHeader strip removed (was FR-3 +1)
		metadata: 231, // -1: FR-3 read-mode header wrapper; -2: deletion pass removed Toast.tsx
		small: 225, // -1: FR-21 StaleRetryCard restyle; -3: deletion pass removed Toast.tsx
		copy: 45,
		control: 96, // +2: UI-084 skip-to-main-content link; -2: AU44 B0 deleted select+boolean option pills from SessionView
		input: 10,
		"avatar-initial": 14,
		subheading: 9,
		lead: 9,
		title: 11,
		display: 3,
		metric: 5, // -1: AZ-bugs-ui-c removed metric span from WorkBet
		data: 89, // -5: FR-20 hint bar + FR-21 restyle; -3: deletion pass removed ArtifactEmbed.tsx
		"inline-code": 2,
	},
	motion: { feedback: 9, move: 16, spring: 2, enter: 1, activity: 7, loading: 6, busy: 2 },
	border: APPROVED_BORDER_RECEIPT_EXPANSION,
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
const output = {
	schemaVersion: 1,
	discoveredPackages: discovered.discoveredPackages,
	scannedFiles: discovered.files.map((file) => file.path),
	...census,
};
const failures: string[] = [];
for (const group of ["typography", "motion"] as const) {
	for (const [profile, expected] of Object.entries(EXPECTED[group])) {
		const actual = census.profiles[group][profile as keyof (typeof census.profiles)[typeof group]];
		if (actual !== expected)
			failures.push(`${group}.${profile}: expected ${expected}, found ${actual}`);
	}
}
failures.push(
	...findLiveBorderCountMismatches(census.profiles.border, APPROVED_BORDER_RECEIPT_EXPANSION),
);
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
