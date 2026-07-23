import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const browser = JSON.parse(fs.readFileSync(path.join(root, "plans/AU20/browser-validation-ledger.json"), "utf8"));
const system = JSON.parse(fs.readFileSync(path.join(root, "plans/AU20/system-validation-ledger.json"), "utf8"));
const diagnosticPaths = ["lane-ah.json", "core-work-runtime.json"].map((name) =>
	path.join(root, "plans/AU20/diagnostics", name),
);
const diagnostics = diagnosticPaths.map((file) => ({ file, value: JSON.parse(fs.readFileSync(file, "utf8")) }));

const explicit = new Map();
for (const { value } of diagnostics) {
	for (const identity of value.identities ?? []) {
		if (identity.disposition !== "feature_regression") continue;
		const raw = identity.causalFileSymbol;
		if (!raw && identity.exactSymbols?.length) {
			explicit.set(identity.id, { exactSymbols: identity.exactSymbols, redProof: identity.redProof });
			continue;
		}
		if (!raw) throw new Error(`${identity.id}: missing exact causal projection`);
		let file;
		let symbol;
		if (raw.includes(".tsx:")) {
			const split = raw.indexOf(".tsx:");
			file = raw.slice(0, split + 4);
			symbol = raw.slice(split + 5);
		} else if (raw.includes(".ts:")) {
			const split = raw.indexOf(".ts:");
			file = raw.slice(0, split + 3);
			symbol = raw.slice(split + 4);
		} else {
			const split = raw.indexOf(" ");
			file = raw.slice(0, split);
			symbol = raw.slice(split + 1);
		}
		identity.exactSymbols = [{ file, symbol }];
		delete identity.causalFileSymbol;
		explicit.set(identity.id, { exactSymbols: identity.exactSymbols, redProof: identity.redProof });
	}
}

function settledBrowserProjection(c) {
	if (explicit.has(c.id)) return explicit.get(c.id);
	const title = c.title;
	const register = c.primaryProblemRegisterId;
	if (register === "BR-ACCESS") {
		return {
			exactSymbols: [{ file: "packages/web/src/index.css", symbol: "responsive touch-target and accessibility declarations" }],
			redProof: `Focused axe/touch-target failure for ${title}`,
		};
	}
	if (register === "BR-ARTIFACT-BLOCK" && title.includes("Block-anchored comment")) {
		return {
			exactSymbols: [{ file: "packages/web/src/pages/WorkBet.tsx", symbol: "handleDiscussBlock" }],
			redProof: `Focused block discussion failure for ${title}`,
		};
	}
	if (register === "BR-ARTIFACT-BLOCK") {
		return {
			exactSymbols: [{ file: "packages/design-system/src/ArtifactPreviewSurface.tsx", symbol: "ArtifactPreviewSurface" }],
			redProof: `Focused keyboard block-action failure for ${title}`,
		};
	}
	if (register === "BR-NAV" && title.includes("Assistant")) {
		return {
			exactSymbols: [{ file: "packages/web/src/layouts/AppShell.tsx", symbol: "handleAssistantClick" }],
			redProof: `Focused sidebar Assistant affordance failure for ${title}`,
		};
	}
	if (register === "BR-NAV") {
		return {
			exactSymbols: [{ file: "packages/web/src/layouts/AppShell.tsx", symbol: "global-search keydown effect" }],
			redProof: `Focused Command-K/Escape failure for ${title}`,
		};
	}
	if (register === "BR-RESPONSIVE") {
		return {
			exactSymbols: [{ file: "packages/web/src/hooks/useTheme.ts", symbol: "useTheme matchMedia change effect" }],
			redProof: `Focused system-theme change failure for ${title}`,
		};
	}
	throw new Error(`${c.id}: no exact regression projection`);
}

const systemProjection = {
	"review-critical-runtime-disposal": {
		exactSymbols: [{ file: "packages/core-api/src/server-factory.ts", symbol: "createServer.dispose" }],
		redProof: "async teardown ordering integration red proof",
	},
	"review-critical-retro-snapshot": {
		exactSymbols: [{ file: "packages/core-api/src/routes/bets.ts", symbol: "registerBetRoutes POST /:id/retro handler" }],
		redProof: "immutable retro snapshot integration red proof",
	},
	"review-warning-notification-catch": {
		exactSymbols: [{ file: "packages/core-api/notifications/src/install.ts", symbol: "writeSecret" }],
		redProof: "unexpected encryption failure propagation red proof",
	},
	"review-warning-filesystem-watcher": {
		exactSymbols: [{ file: "packages/core-api/filesystems/src/file-watcher.ts", symbol: "startWatcher" }],
		redProof: "setup and runtime watcher error red proof",
	},
};

const projections = [
	...browser.cases
		.filter((c) => c.disposition === "feature_regression")
		.map((c) => ({ id: c.id, ...settledBrowserProjection(c) })),
	...[...explicit.entries()]
		.filter(([id]) => !browser.cases.some((c) => c.id === id && c.disposition === "feature_regression"))
		.map(([id, projection]) => ({ id, ...projection })),
	...system.cases
		.filter((c) => c.disposition === "feature regression")
		.map((c) => ({ id: c.id, ...systemProjection[c.id] })),
].sort((a, b) => a.id.localeCompare(b.id));

if (projections.length !== 32 || projections.some((p) => !p.exactSymbols?.length || !p.redProof)) {
	throw new Error(`invalid regression projection count/shape: ${projections.length}`);
}
const core = diagnostics.find(({ file }) => file.endsWith("core-work-runtime.json"));
core.value.regressionProjections = projections;
for (const diagnostic of diagnostics) {
	fs.writeFileSync(diagnostic.file, `${JSON.stringify(diagnostic.value, null, 2)}\n`);
}
