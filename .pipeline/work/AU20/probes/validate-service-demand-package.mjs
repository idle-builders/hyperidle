import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const fail = (message) => {
	throw new Error(`AU20 service demand package invalid: ${message}`);
};
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const sortStrings = (values) => [...new Set(values)].sort((left, right) => left.localeCompare(right));
const root = process.cwd();

const fixtureFlagIndex = process.argv.indexOf("--write-adversarial-fixtures");
const fixtureDirectory =
	fixtureFlagIndex >= 0 ? process.argv[fixtureFlagIndex + 1] : undefined;
const candidatePath = fixtureFlagIndex >= 0 ? undefined : process.argv[2];
if (fixtureFlagIndex >= 0 && !fixtureDirectory) {
	fail("--write-adversarial-fixtures requires an output directory");
}
if (fixtureFlagIndex < 0 && !candidatePath) {
	fail(
		"usage: validate-service-demand-package.mjs <generated.json> | --write-adversarial-fixtures <dir>",
	);
}

const walk = (directory, files = []) => {
	for (const entry of fs.readdirSync(directory)) {
		if (["__tests__", "dist", "node_modules"].includes(entry)) continue;
		const absolute = path.join(directory, entry);
		if (fs.statSync(absolute).isDirectory()) walk(absolute, files);
		else if (
			/\.tsx?$/.test(entry) &&
			!/\.(integration|spec|stories|test)\./.test(entry)
		) {
			files.push(absolute);
		}
	}
	return files;
};
const sourceFile = (absolute) =>
	ts.createSourceFile(absolute, fs.readFileSync(absolute, "utf8"), ts.ScriptTarget.Latest, true);
const isExported = (node) =>
	ts.canHaveModifiers(node) &&
	Boolean(ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));

const layerRoots = [
	["core-api", "packages/core-api"],
	["agent-orchestration", "packages/agent-orchestration"],
	["agent-execution", "packages/agent-execution"],
];
const services = [];
for (const [layer, relativeRoot] of layerRoots) {
	const absoluteRoot = path.join(root, relativeRoot);
	for (const name of fs.readdirSync(absoluteRoot)) {
		const directory = path.join(absoluteRoot, name);
		if (
			fs.existsSync(path.join(directory, "package.json")) &&
			fs.existsSync(path.join(directory, "src/index.ts"))
		) {
			services.push({ name, layer, directory });
		}
	}
}
services.sort((left, right) => left.name.localeCompare(right.name));
const serviceNames = new Set(services.map((service) => service.name));

const exportsByService = new Map();
const providersByMethod = new Map();
for (const service of services) {
	const declarations = new Map();
	for (const absolute of walk(path.join(service.directory, "src"))) {
		const parsed = sourceFile(absolute);
		for (const node of parsed.statements) {
			if (!isExported(node)) continue;
			const record = (name, kind) => declarations.set(`${kind}:${name}`, { name, kind });
			if (ts.isFunctionDeclaration(node) && node.name) record(node.name.text, "method");
			else if (ts.isClassDeclaration(node) && node.name) record(node.name.text, "method");
			else if (ts.isEnumDeclaration(node)) record(node.name.text, "method");
			else if (ts.isVariableStatement(node)) {
				for (const declaration of node.declarationList.declarations) {
					if (ts.isIdentifier(declaration.name)) record(declaration.name.text, "method");
				}
			} else if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
				record(node.name.text, "type");
			}
		}
	}
	const declarationsSorted = [...declarations.values()].sort((left, right) =>
		`${left.kind}:${left.name}`.localeCompare(`${right.kind}:${right.name}`),
	);
	exportsByService.set(service.name, declarationsSorted);
	for (const exported of declarationsSorted.filter(({ kind }) => kind === "method")) {
		providersByMethod.set(exported.name, [
			...(providersByMethod.get(exported.name) ?? []),
			service.name,
		]);
	}
}

const tableGuard = fs.readFileSync(path.join(root, "scripts/table-ownership-guard.ts"), "utf8");
const ownerBody = tableGuard.match(
	/const TABLE_OWNER: Record<string, string> = \{([\s\S]*?)\n\};/,
)?.[1];
if (!ownerBody) fail("cannot derive TABLE_OWNER from table ownership guard");
const ownedTablesByService = new Map(services.map(({ name }) => [name, []]));
for (const match of ownerBody.matchAll(/^\s*([A-Za-z0-9_]+):\s*"packages\/[^"]+\/([^/"]+)",?\s*$/gm)) {
	const [, table, owner] = match;
	if (ownedTablesByService.has(owner)) ownedTablesByService.get(owner).push(table);
}
for (const tables of ownedTablesByService.values()) tables.sort();

const generatorSource = sourceFile(path.join(root, "scripts/generate-dependency-graph.ts"));
const manualOverrides = new Map();
const visitOverrides = (node) => {
	if (
		ts.isVariableDeclaration(node) &&
		ts.isIdentifier(node.name) &&
		node.name.text === "MANUAL_OVERRIDES" &&
		node.initializer &&
		ts.isObjectLiteralExpression(node.initializer)
	) {
		for (const property of node.initializer.properties) {
			if (!ts.isPropertyAssignment(property)) continue;
			const key = ts.isStringLiteral(property.name) ? property.name.text : property.name.getText(generatorSource);
			if (ts.isStringLiteral(property.initializer)) {
				manualOverrides.set(key, [property.initializer.text]);
			} else if (ts.isArrayLiteralExpression(property.initializer)) {
				manualOverrides.set(
					key,
					property.initializer.elements
						.filter(ts.isStringLiteral)
						.map((element) => element.text),
				);
			}
		}
	}
	ts.forEachChild(node, visitOverrides);
};
visitOverrides(generatorSource);

const accessKindsFor = (service, methodNames) => {
	const byMethod = new Map(methodNames.map((method) => [method, new Set()]));
	for (const absolute of walk(path.join(service.directory, "src"))) {
		if (absolute.endsWith("/ports.ts")) continue;
		const parsed = sourceFile(absolute);
		const visit = (node) => {
			if (ts.isBindingElement(node)) {
				const property = node.propertyName ?? node.name;
				if (ts.isIdentifier(property) && byMethod.has(property.text)) {
					byMethod.get(property.text).add("destructured");
				}
			}
			if (ts.isPropertyAccessExpression(node) && byMethod.has(node.name.text)) {
				const parent = node.parent;
				if (
					ts.isVariableDeclaration(parent) &&
					parent.initializer === node &&
					ts.isIdentifier(parent.name) &&
					parent.name.text !== node.name.text
				) {
					byMethod.get(node.name.text).add("aliased");
				} else {
					byMethod.get(node.name.text).add("direct");
				}
			}
			ts.forEachChild(node, visit);
		};
		visit(parsed);
	}
	return sortStrings([...byMethod.values()].flatMap((kinds) => [...kinds]));
};

const receiversByProvider = new Map(services.map(({ name }) => [name, []]));
for (const consumer of services) {
	const portsPath = path.join(consumer.directory, "src/ports.ts");
	if (!fs.existsSync(portsPath)) continue;
	const text = fs.readFileSync(portsPath, "utf8");
	const lines = text.split("\n");
	const parsed = sourceFile(portsPath);
	const headers = [];
	for (const [line, value] of lines.entries()) {
		const match = value.match(/^\/\/\s*([a-z][a-z0-9-]*)\s*—/);
		if (match && serviceNames.has(match[1])) headers.push({ line, target: match[1] });
	}
	const interfaces = new Map(
		parsed.statements
			.filter(ts.isInterfaceDeclaration)
			.map((declaration) => [declaration.name.text, declaration]),
	);
	const methodsFromMembers = (members) => {
		const requests = [];
		for (const member of members) {
			if (ts.isMethodSignature(member) && member.name) {
				requests.push(member.name.getText(parsed));
			} else if (
				ts.isPropertySignature(member) &&
				member.name &&
				member.type &&
				ts.isFunctionTypeNode(member.type)
			) {
				requests.push(member.name.getText(parsed));
			}
		}
		return sortStrings(requests);
	};
	const methodsFromGroupType = (type) => {
		if (ts.isTypeLiteralNode(type)) return methodsFromMembers(type.members);
		if (ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName)) {
			const declaration = interfaces.get(type.typeName.text);
			return declaration ? methodsFromMembers(declaration.members) : [];
		}
		return [];
	};
	const addReceiver = (provider, port, requests) => {
		if (!receiversByProvider.has(provider)) {
			fail(`DI receiver ${consumer.name}:${port} targets unknown service ${provider}`);
		}
		receiversByProvider.get(provider).push({
			consumer: consumer.name,
			port,
			requests,
			accessKinds: accessKindsFor(consumer, requests),
		});
	};
	const resolveFlatTargets = (declaration, requests) => {
		const override = manualOverrides.get(`${consumer.name}:${declaration.name.text}`);
		const startLine = parsed.getLineAndCharacterOfPosition(declaration.getStart(parsed)).line;
		const header = headers
			.filter(({ line }) => line < startLine)
			.sort((left, right) => right.line - left.line)[0];
		const votes = new Map();
		for (const request of requests) {
			for (const provider of providersByMethod.get(request) ?? []) {
				if (provider !== consumer.name) votes.set(provider, (votes.get(provider) ?? 0) + 1);
			}
		}
		const bestVote = [...votes].sort(
			(left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
		)[0]?.[0];
		return override ?? (header ? [header.target] : bestVote ? [bestVote] : []);
	};
	for (const declaration of interfaces.values()) {
		if (!isExported(declaration)) continue;
		const flatRequests = methodsFromMembers(declaration.members);
		if (flatRequests.length > 0) {
			const targets = resolveFlatTargets(declaration, flatRequests);
			if (targets.length === 0) {
				fail(`cannot resolve source DI receiver ${consumer.name}:${declaration.name.text}`);
			}
			for (const provider of targets) addReceiver(provider, declaration.name.text, flatRequests);
		}
		for (const member of declaration.members) {
			if (!ts.isPropertySignature(member) || !member.name || !member.type) continue;
			const requests = methodsFromGroupType(member.type);
			if (requests.length === 0) continue;
			const groupName = member.name.getText(parsed);
			const namedProvider = groupName
				.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
				.toLowerCase();
			// Some dependency groups are composition adapters whose group name
			// is not a Service identity and whose adapter method names differ
			// from the provider's coherent API. They require composition-root
			// lineage. Generic method-name voting is forbidden here: e.g.
			// workspaceFactory.create must never become a knowledge.create edge.
			if (!serviceNames.has(namedProvider)) continue;
			addReceiver(namedProvider, `${declaration.name.text}.${groupName}`, requests);
		}
	}
}
for (const receivers of receiversByProvider.values()) {
	receivers.sort((left, right) =>
		`${left.consumer}:${left.port}`.localeCompare(`${right.consumer}:${right.port}`),
	);
}
const requireNestedRequest = (provider, port, request) => {
	const matches = receiversByProvider
		.get(provider)
		.filter(
			(receiver) =>
				receiver.consumer === "dispatch" &&
				receiver.port === port &&
				receiver.requests.includes(request),
		);
	if (matches.length !== 1) {
		fail(`nested provider contract missing: ${provider}.${request} via ${port}`);
	}
};
requireNestedRequest(
	"agent-selection",
	"DispatchPorts.agentSelection",
	"resolveScaffoldSpecs",
);
requireNestedRequest("conversation", "DispatchPorts.conversation", "insertMessage");
requireNestedRequest("cost", "DispatchPorts.cost", "getFactoryCostActual");
const dispatchReceivers = [...receiversByProvider.entries()].flatMap(([provider, receivers]) =>
	receivers
		.filter(({ consumer }) => consumer === "dispatch")
		.map((receiver) => ({ provider, ...receiver })),
);
if (
	dispatchReceivers.some(({ requests }) =>
		requests.some((request) => ["runOrchestration", "toolHandlers"].includes(request)),
	)
) {
	fail("nested provider group name was emitted as a request");
}
if (
	dispatchReceivers.some(
		({ provider, port, requests }) =>
			port === "DispatchPorts.workspaceFactory" ||
			(provider === "knowledge" && requests.includes("create")),
	)
) {
	fail("non-service workspaceFactory adapter emitted as service demand");
}
const dispatchPortOwners = new Map();
for (const receiver of dispatchReceivers) {
	const owners = dispatchPortOwners.get(receiver.port) ?? new Set();
	owners.add(receiver.provider);
	dispatchPortOwners.set(receiver.port, owners);
}
for (const [port, providers] of dispatchPortOwners) {
	if (providers.size !== 1) fail(`nested provider broadcast detected: ${port}`);
}

const census = JSON.parse(
	execFileSync(path.join(root, "node_modules/.bin/tsx"), [path.join(root, "scripts/surface-census.ts")], {
		cwd: root,
		encoding: "utf8",
	}),
);
const censusByService = new Map(census.services.map((service) => [service.service, service]));
const expected = services.map((service) => {
	const exported = exportsByService.get(service.name);
	const methods = exported.filter(({ kind }) => kind === "method").length;
	const types = exported.filter(({ kind }) => kind === "type").length;
	const surface = { methods, types, total: methods + types };
	const censusSurface = censusByService.get(service.name);
	if (
		!censusSurface ||
		surface.methods !== censusSurface.methods ||
		surface.types !== censusSurface.types ||
		surface.total !== censusSurface.total
	) {
		fail(`${service.name} independent export scan diverges from implementation-site census`);
	}
	const diReceivers = receiversByProvider.get(service.name);
	const demand = new Map();
	for (const receiver of diReceivers) {
		const requests = demand.get(receiver.consumer) ?? new Set();
		for (const request of receiver.requests) requests.add(request);
		demand.set(receiver.consumer, requests);
	}
	const consumers = [...demand]
		.map(([consumer, requests]) => ({ consumer, requests: [...requests].sort() }))
		.sort((left, right) => left.consumer.localeCompare(right.consumer));
	return {
		name: service.name,
		layer: service.layer,
		ownedTables: ownedTablesByService.get(service.name),
		surface,
		exports: exported,
		diReceivers,
		consumers,
	};
});

if (fixtureDirectory) {
	fs.mkdirSync(fixtureDirectory, { recursive: true });
	const clone = () => structuredClone(expected);
	const fixtures = new Map();
	fixtures.set("valid.json", clone());
	fixtures.set("top-level-shape.json", { services: clone() });
	const staleServiceCount = clone();
	while (staleServiceCount.length < 31) {
		staleServiceCount.push({
			...structuredClone(staleServiceCount.at(-1)),
			name: `retired-service-${staleServiceCount.length}`,
		});
	}
	fixtures.set("stale-service-count.json", staleServiceCount);
	const missingField = clone();
	delete missingField[0].ownedTables;
	fixtures.set("missing-field.json", missingField);
	const extraField = clone();
	extraField[0].unexpected = true;
	fixtures.set("extra-field.json", extraField);
	const fabricatedExport = clone();
	fabricatedExport[0].exports[0].name = "fabricatedExport";
	fixtures.set("fabricated-export.json", fabricatedExport);
	const wrongExportKind = clone();
	wrongExportKind[0].exports[0].kind =
		wrongExportKind[0].exports[0].kind === "method" ? "type" : "method";
	fixtures.set("wrong-export-kind.json", wrongExportKind);
	const deletedExport = clone();
	deletedExport[0].exports.shift();
	fixtures.set("deleted-export.json", deletedExport);
	const tableIndex = expected.findIndex((service) => service.ownedTables.length > 0);
	const deletedTable = clone();
	deletedTable[tableIndex].ownedTables.shift();
	fixtures.set("deleted-table.json", deletedTable);
	const receiverIndex = expected.findIndex((service) => service.diReceivers.length > 0);
	const deletedReceiver = clone();
	deletedReceiver[receiverIndex].diReceivers.shift();
	fixtures.set("deleted-receiver.json", deletedReceiver);
	const deletedConsumer = clone();
	deletedConsumer[receiverIndex].consumers.shift();
	fixtures.set("deleted-consumer.json", deletedConsumer);
	const wrongReceiverAccess = clone();
	wrongReceiverAccess[receiverIndex].diReceivers[0].accessKinds = ["fabricated"];
	fixtures.set("wrong-receiver-access.json", wrongReceiverAccess);
	const aliasAccessDrift = clone();
	aliasAccessDrift[receiverIndex].diReceivers[0].accessKinds = ["aliased"];
	fixtures.set("alias-access-drift.json", aliasAccessDrift);
	const nestedMissing = clone();
	const agentSelection = nestedMissing.find(({ name }) => name === "agent-selection");
	const nestedAgentSelection = agentSelection.diReceivers.find(
		({ consumer, port }) =>
			consumer === "dispatch" && port === "DispatchPorts.agentSelection",
	);
	nestedAgentSelection.requests = [];
	fixtures.set("nested-method-missing.json", nestedMissing);
	const groupAsMethod = clone();
	const runOrchestration = groupAsMethod.find(({ name }) => name === "run-orchestration");
	const nestedRunOrchestration = runOrchestration.diReceivers.find(
		({ consumer, port }) =>
			consumer === "dispatch" && port === "DispatchPorts.runOrchestration",
	);
	nestedRunOrchestration.requests = ["runOrchestration"];
	fixtures.set("group-name-as-method.json", groupAsMethod);
	const providerBroadcast = clone();
	const broadcastSource = providerBroadcast
		.find(({ name }) => name === "agent-selection")
		.diReceivers.find(
			({ consumer, port }) =>
				consumer === "dispatch" && port === "DispatchPorts.agentSelection",
		);
	providerBroadcast
		.find(({ name }) => name === "cost")
		.diReceivers.push(structuredClone(broadcastSource));
	fixtures.set("provider-broadcast.json", providerBroadcast);
	const workspaceAdapterFalseEdge = clone();
	const knowledge = workspaceAdapterFalseEdge.find(({ name }) => name === "knowledge");
	knowledge.diReceivers.push({
		consumer: "dispatch",
		port: "DispatchPorts.workspaceFactory",
		requests: ["create"],
		accessKinds: ["direct"],
	});
	fixtures.set("workspace-adapter-false-edge.json", workspaceAdapterFalseEdge);
	const collapsedGroups = clone();
	const collapsedAgentSelection = collapsedGroups.find(
		({ name }) => name === "agent-selection",
	);
	const collapsedConversation = collapsedGroups.find(({ name }) => name === "conversation");
	const conversationReceiverIndex = collapsedConversation.diReceivers.findIndex(
		({ consumer, port }) =>
			consumer === "dispatch" && port === "DispatchPorts.conversation",
	);
	const agentSelectionReceiver = collapsedAgentSelection.diReceivers.find(
		({ consumer, port }) =>
			consumer === "dispatch" && port === "DispatchPorts.agentSelection",
	);
	agentSelectionReceiver.requests.push(
		...collapsedConversation.diReceivers[conversationReceiverIndex].requests,
	);
	collapsedConversation.diReceivers.splice(conversationReceiverIndex, 1);
	fixtures.set("multiple-groups-collapsed.json", collapsedGroups);

	const hashes = {};
	for (const [name, fixture] of fixtures) {
		const bytes = `${JSON.stringify(fixture, null, 2)}\n`;
		fs.writeFileSync(path.join(fixtureDirectory, name), bytes);
		hashes[name] = sha256(Buffer.from(bytes));
	}
	console.log(JSON.stringify(hashes));
	process.exit(0);
}

const candidateBytes = fs.readFileSync(path.resolve(root, candidatePath));
let candidate;
try {
	candidate = JSON.parse(candidateBytes);
} catch (error) {
	fail(`cannot parse generated JSON: ${error instanceof Error ? error.message : String(error)}`);
}
if (!Array.isArray(candidate)) fail("top level must be an array");

const actualCanonical = JSON.stringify(candidate);
const expectedCanonical = JSON.stringify(expected);
if (actualCanonical !== expectedCanonical) {
	let mismatch = "source/package divergence";
	if (candidate.length !== expected.length) {
		mismatch = `service count is stale: generated=${candidate.length} live=${expected.length}`;
	} else {
		const index = expected.findIndex(
			(service, serviceIndex) => JSON.stringify(candidate[serviceIndex]) !== JSON.stringify(service),
		);
		const serviceName = expected[index]?.name ?? `index ${index}`;
		const actualService = candidate[index];
		const expectedService = expected[index];
		if (!isRecord(actualService)) mismatch = `${serviceName} is missing or not an object`;
		else {
			const actualKeys = Object.keys(actualService).sort();
			const expectedKeys = Object.keys(expectedService).sort();
			if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
				mismatch = `${serviceName} shape drift: expected ${expectedKeys.join(",")}; received ${actualKeys.join(",")}`;
			} else {
				const field = Object.keys(expectedService).find(
					(key) => JSON.stringify(actualService[key]) !== JSON.stringify(expectedService[key]),
				);
				mismatch = `${serviceName}.${field} diverges from authoritative source`;
			}
		}
	}
	fail(mismatch);
}

console.log(
	JSON.stringify({
		services: expected.length,
		totals: census.totals,
		sourceSha256: sha256(Buffer.from(expectedCanonical)),
		candidateSha256: sha256(candidateBytes),
	}),
);
