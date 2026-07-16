#!/usr/bin/env tsx
/**
 * Test coverage structural check.
 *
 * Verifies that every API route file has integration tests and every
 * routed page has E2E specs. Does NOT measure line coverage — that's
 * vitest --coverage. This checks structural coverage: "does a test
 * file exist for this production file?"
 *
 * Usage:
 *   npx tsx scripts/test-coverage-check.ts          # exit 1 on gaps
 *   npx tsx scripts/test-coverage-check.ts --report  # print report only
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { basename, join } from "node:path";

// @lore AU19 Increment 5 item 5: repointed from the dissolved packages/server
// (commit cee027ab) — routes now live under packages/core-api.
const ROUTES_DIR = "packages/core-api/src/routes";
const ROUTE_TESTS_DIR = "packages/core-api/src/routes/__tests__";
const E2E_DIR = "packages/web/e2e";
const ROUTER_FILE = "packages/web/src/router.tsx";

// Route files that are not actual HTTP route handlers
const ROUTE_EXCLUDES = new Set([
	"threads-schema", // Zod schemas, not routes
	"test-routes", // Debug-only routes
]);

// Routes whose test files don't follow the naming convention
const ROUTE_TEST_OVERRIDES: Record<string, string> = {
	settings: "status-settings-write",
	ws: "worker-ws",
	agents: "X3-agents", // X3: agent CRUD tests live in X3-agents.test.ts
	"model-gateway": "X4-model-gateway", // X4: gateway tests live in X4-model-gateway.test.ts
};

// Pages that don't need E2E (redirects, error boundaries, shells)
const PAGE_EXCLUDES = new Set([
	"AppShell", // Layout wrapper, not a page
	"NotFound", // Error boundary
]);

// Minimum E2E spec count per page (top 3 actions = at least 1 spec file)
const MIN_E2E_SPECS = 1;

interface Gap {
	type: "route" | "e2e";
	name: string;
	detail: string;
}

function checkRoutes(): Gap[] {
	const gaps: Gap[] = [];
	const routeFiles = readdirSync(ROUTES_DIR)
		.filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
		.map((f) => basename(f, ".ts"))
		.filter((f) => !ROUTE_EXCLUDES.has(f));

	const testFiles = existsSync(ROUTE_TESTS_DIR)
		? readdirSync(ROUTE_TESTS_DIR).filter((f) => f.endsWith(".test.ts"))
		: [];

	for (const route of routeFiles) {
		const stem = route.replace(/-routes$/, "");
		const override = ROUTE_TEST_OVERRIDES[route];
		const hasTest = testFiles.some(
			(t) =>
				t.startsWith(route + ".") ||
				t.startsWith(route + "-") ||
				t.startsWith(stem + ".") ||
				t.startsWith(stem + "-") ||
				(override && t.startsWith(override)),
		);
		if (!hasTest) {
			gaps.push({
				type: "route",
				name: route,
				detail: `${ROUTES_DIR}/${route}.ts has no integration test in ${ROUTE_TESTS_DIR}/`,
			});
		}
	}
	return gaps;
}

function checkE2E(): Gap[] {
	const gaps: Gap[] = [];

	if (!existsSync(ROUTER_FILE)) return gaps;

	const router = readFileSync(ROUTER_FILE, "utf-8");
	const pageRegex = /element:\s*<(\w+)/g;
	const pages = new Set<string>();
	let match: RegExpExecArray | null;
	while ((match = pageRegex.exec(router)) !== null) {
		if (!PAGE_EXCLUDES.has(match[1])) {
			pages.add(match[1]);
		}
	}

	const e2eFiles = existsSync(E2E_DIR)
		? readdirSync(E2E_DIR).filter((f) => f.endsWith(".spec.ts"))
		: [];

	// Map page components to expected E2E coverage keywords
	const pageKeywords: Record<string, string[]> = {
		Conversations: ["conversation"],
		KnowledgeList: ["knowledge"],
		KnowledgeDetail: ["knowledge-detail", "knowledge-edit", "knowledge"],
		WorkPortfolio: ["work", "portfolio", "bet-creation"],
		WorkBet: ["work-bet", "bet-action", "bet-description", "bet-thread"],
		WorkTeam: ["product-drilldown", "work-surface"],
		ArtifactPermalink: ["artifact"],
		SetupFlow: ["setup-flow"],
	};

	for (const page of pages) {
		const keywords = pageKeywords[page];
		if (!keywords) continue;

		const matchingSpecs = e2eFiles.filter((f) =>
			keywords.some((kw) => f.includes(kw)),
		);

		if (matchingSpecs.length < MIN_E2E_SPECS) {
			gaps.push({
				type: "e2e",
				name: page,
				detail: `Page ${page} has ${matchingSpecs.length} E2E specs (minimum: ${MIN_E2E_SPECS}). Needs specs covering top 3 user actions.`,
			});
		}
	}

	return gaps;
}

const reportOnly = process.argv.includes("--report");
const routeGaps = checkRoutes();
const e2eGaps = checkE2E();
const allGaps = [...routeGaps, ...e2eGaps];

if (allGaps.length === 0) {
	console.log("✓ test-coverage-check: all routes and pages have test coverage");
	process.exit(0);
}

console.log(`test-coverage-check: ${allGaps.length} gap(s) found\n`);

if (routeGaps.length > 0) {
	console.log(`Routes without integration tests (${routeGaps.length}):`);
	for (const g of routeGaps) {
		console.log(`  ✗ ${g.detail}`);
	}
	console.log();
}

if (e2eGaps.length > 0) {
	console.log(`Pages without E2E coverage (${e2eGaps.length}):`);
	for (const g of e2eGaps) {
		console.log(`  ✗ ${g.detail}`);
	}
	console.log();
}

process.exit(reportOnly ? 0 : 1);
