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
// +1 BA9a: SettingsPlugins contribution list left border.
const APPROVED_BORDER_RECEIPT_EXPANSION = { thin: 207, default: 17, strong: 11 } as const;

const EXPECTED = {
	typography: {
		label: 118, // -1: read-mode ConversationHeader strip removed (was FR-3 +1); +1: BA1 review N7 RoutineDetailPane "Event" field label (event routines show an Event select instead of Schedule); +1: BA9a SettingsPlugins contribution key label; +1: BA9d D11 RoutineDetailPane "Transition to" edit-mode label
		metadata: 233, // -1: FR-3 read-mode header wrapper; -2: deletion pass removed Toast.tsx; +1: BA1 D8 RoutineCreateDialog "When" field label (team Select removed, When+Event Selects added net +1); +1: AgentEditor "Applied to every run of this agent." helper under the model-options section
		small: 227, // -1: FR-21 StaleRetryCard restyle; -3: deletion pass removed Toast.tsx; +2: BA9a SettingsPlugins contribution secondary text
		copy: 45,
		control: 97, // +2: UI-084 skip-to-main-content link; -2: AU44 B0 deleted select+boolean option pills from SessionView; +1: BA9a SettingsPlugins plugin row name
		input: 11, // +1: AgentEditor model-option select (a harness's declared select for the chosen model)
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
