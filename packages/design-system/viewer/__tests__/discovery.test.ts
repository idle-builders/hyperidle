/**
 * AJ6 — AC1: deriveGroup precedence chain.
 *
 * Tests the fixed precedence:
 *   1. meta.group        (explicit escape hatch — highest)
 *   2. deriveFromPath    (path-authoritative; nested dir is the signal)
 *   3. DS_COMPONENT_GROUPS[title]  (DS-src flat root only)
 *   4. null              (classification failure)
 *
 * Table-driven: (path, title, meta) → expected CatalogGroup | null.
 */

import { describe, expect, test } from "vitest";
import {
	type CatalogGroup,
	deriveGroup,
	GROUPS,
	type GroupKind,
	type GroupName,
} from "../discovery.js";

// Helper: build a CatalogGroup value for assertion
function g(kind: GroupKind, name: GroupName): CatalogGroup {
	return { kind, name };
}

describe("deriveGroup — fixed precedence chain", () => {
	// ── Step 1: meta.group override (highest precedence) ────────────
	test("step 1: meta.group explicit override wins over everything", () => {
		// path would resolve to System via deriveFromPath (shell)
		// but meta.group overrides it to Conversations
		const result = deriveGroup("../../web/src/shell/Sidebar.stories.tsx", "Shell/Sidebar", {
			title: "Shell/Sidebar",
			group: "Conversations",
		});
		expect(result).toEqual(g("domain", "Conversations"));
	});

	test("step 1: meta.group overrides DS_COMPONENT_GROUPS registry", () => {
		// Button is in the registry as Foundation
		// but if meta.group = "Primitives" that wins
		const result = deriveGroup("../src/Button.stories.tsx", "Button", {
			title: "Button",
			group: "Primitives",
		});
		expect(result).toEqual(g("tier", "Primitives"));
	});

	// ── Step 2a: deriveFromPath — nested dir wins ────────────────────
	test("step 2: pages/work/* path → Work regardless of title", () => {
		// AC1 explicit row (a): web/src/pages/work/X path carrying a non-Work title → Work
		const result = deriveGroup(
			"../../web/src/pages/work/RoutineCreateDialog.stories.tsx",
			"Page: Knowledge/Body", // deliberately non-Work title
			{ title: "Page: Knowledge/Body" },
		);
		expect(result).toEqual(g("domain", "Work"));
	});

	test("step 2: pages/knowledge/* path → Knowledge regardless of title", () => {
		const result = deriveGroup(
			"../../web/src/pages/knowledge/KnowledgeBody.stories.tsx",
			"Page: Knowledge/Body",
			{ title: "Page: Knowledge/Body" },
		);
		expect(result).toEqual(g("domain", "Knowledge"));
	});

	test("step 2: settings/ path → Settings", () => {
		const result = deriveGroup(
			"../../web/src/settings/SettingsModels.stories.tsx",
			"SettingsModels",
			{ title: "SettingsModels" },
		);
		expect(result).toEqual(g("domain", "Settings"));
	});

	test("step 2: shell/ path → System", () => {
		const result = deriveGroup("../../web/src/shell/Sidebar.stories.tsx", "Shell/Sidebar", {
			title: "Shell/Sidebar",
		});
		expect(result).toEqual(g("domain", "System"));
	});

	test("step 2: layouts/ path → System", () => {
		const result = deriveGroup("../../web/src/layouts/AppShell.stories.tsx", "Layout: AppShell", {
			title: "Layout: AppShell",
		});
		expect(result).toEqual(g("domain", "System"));
	});

	test("step 2: src/kinds/ path → System", () => {
		const result = deriveGroup("../src/kinds/code-renderer.stories.tsx", "Kinds/CodeRenderer", {
			title: "Kinds/CodeRenderer",
		});
		expect(result).toEqual(g("domain", "System"));
	});

	// AC1 explicit row (c): web/src/shell/ path whose title equals a DS_COMPONENT_GROUPS
	// key still resolves to System (path wins over registry)
	test("step 2: shell path with DS registry-colliding title → System (path beats registry)", () => {
		const result = deriveGroup(
			"../../web/src/shell/Button.stories.tsx",
			"Button", // "Button" exists in DS_COMPONENT_GROUPS as Foundation
			{ title: "Button" },
		);
		expect(result).toEqual(g("domain", "System"));
	});

	// ── Step 2b: flat pages/ falls through to title ──────────────────
	test("step 2: flat pages/ + title 'Page: Settings' → Settings (title fallback)", () => {
		// AC1 explicit row (b): flat pages/SettingsPage + title 'Page: Settings' → Settings
		const result = deriveGroup("../../web/src/pages/SettingsPage.stories.tsx", "Page: Settings", {
			title: "Page: Settings",
		});
		expect(result).toEqual(g("domain", "Settings"));
	});

	test("step 2: flat pages/ + title 'Page: Work/Overview' → Work", () => {
		const result = deriveGroup(
			"../../web/src/pages/WorkOverview.stories.tsx",
			"Page: Work/Overview",
			{ title: "Page: Work/Overview" },
		);
		expect(result).toEqual(g("domain", "Work"));
	});

	test("step 2: flat pages/ + title 'Page: Knowledge/List' → Knowledge", () => {
		const result = deriveGroup(
			"../../web/src/pages/KnowledgeList.stories.tsx",
			"Page: Knowledge/List",
			{ title: "Page: Knowledge/List" },
		);
		expect(result).toEqual(g("domain", "Knowledge"));
	});

	test("step 2: flat pages/ + title 'Page: Conversations' → Conversations", () => {
		const result = deriveGroup(
			"../../web/src/pages/Conversations.stories.tsx",
			"Page: Conversations",
			{ title: "Page: Conversations" },
		);
		expect(result).toEqual(g("domain", "Conversations"));
	});

	test("step 2: flat pages/ + title 'Page: Agents/AgentProfile' → Conversations (agents = conversations)", () => {
		const result = deriveGroup(
			"../../web/src/pages/AgentProfile.stories.tsx",
			"Page: Agents/AgentProfile",
			{ title: "Page: Agents/AgentProfile" },
		);
		// Per architecture: "Page: Agents/*" → Conversations domain
		expect(result).toEqual(g("domain", "Conversations"));
	});

	test("step 2: flat pages/ + title 'Page: Setup/SetupFlow' → Work (setup = Work per arch)", () => {
		const result = deriveGroup(
			"../../web/src/pages/SetupFlow.stories.tsx",
			"Page: Setup/SetupFlow",
			{ title: "Page: Setup/SetupFlow" },
		);
		// Per architecture: "Page: Setup/*" → Work
		expect(result).toEqual(g("domain", "Work"));
	});

	// ── Step 2c: area-less page titles need meta.group ───────────────
	// AC1 explicit row (d): area-less titles without meta.group → null
	test("step 2 → null: area-less 'WorkRoutine' without meta.group → null", () => {
		const result = deriveGroup("../../web/src/pages/WorkRoutine.stories.tsx", "WorkRoutine", {
			title: "WorkRoutine",
		});
		expect(result).toBeNull();
	});

	test("step 2 → null: area-less 'WorkTeam' without meta.group → null", () => {
		const result = deriveGroup("../../web/src/pages/WorkTeam.stories.tsx", "WorkTeam", {
			title: "WorkTeam",
		});
		expect(result).toBeNull();
	});

	test("step 2 → null: area-less 'NotFound' without meta.group → null", () => {
		const result = deriveGroup("../../web/src/pages/NotFound.stories.tsx", "NotFound", {
			title: "NotFound",
		});
		expect(result).toBeNull();
	});

	// AC1 explicit row (d): area-less WITH meta.group → resolves
	test("step 1: area-less 'WorkRoutine' with meta.group='Work' → Work (via step 1)", () => {
		const result = deriveGroup("../../web/src/pages/WorkRoutine.stories.tsx", "WorkRoutine", {
			title: "WorkRoutine",
			group: "Work",
		});
		expect(result).toEqual(g("domain", "Work"));
	});

	test("step 1: area-less 'NotFound' with meta.group='System' → System", () => {
		const result = deriveGroup("../../web/src/pages/NotFound.stories.tsx", "NotFound", {
			title: "NotFound",
			group: "System",
		});
		expect(result).toEqual(g("domain", "System"));
	});

	// ── Step 3: DS_COMPONENT_GROUPS registry ────────────────────────
	test("step 3: DS flat src root + known title → resolved from registry (no meta.group)", () => {
		// DS flat root: path starts with ../src/ (not kinds/)
		// no meta.group → step 2 returns null → step 3 hits registry
		const result = deriveGroup("../src/Button.stories.tsx", "Button", { title: "Button" });
		expect(result).not.toBeNull();
		// Button is Foundation tier (domain-agnostic)
		expect(result?.kind).toBe("tier");
		expect(result?.name).toBe("Foundation");
	});

	test("step 3: DS flat src + BetCard → Work domain", () => {
		const result = deriveGroup("../src/BetCard.stories.tsx", "BetCard", { title: "BetCard" });
		expect(result).toEqual(g("domain", "Work"));
	});

	test("step 3: DS flat src + KnowledgeRow → Knowledge domain", () => {
		const result = deriveGroup("../src/KnowledgeRow.stories.tsx", "KnowledgeRow", {
			title: "KnowledgeRow",
		});
		expect(result).toEqual(g("domain", "Knowledge"));
	});

	// ── Step 4: null (no match) ──────────────────────────────────────
	test("step 4: DS flat src + unknown title → null (classification failure)", () => {
		const result = deriveGroup("../src/UnknownWidget.stories.tsx", "UnknownWidget", {
			title: "UnknownWidget",
		});
		expect(result).toBeNull();
	});
});

describe("GROUPS registry", () => {
	test("GROUPS has 9 entries: 3 tiers then 6 domains", () => {
		expect(GROUPS).toHaveLength(9);
	});

	test("GROUPS starts with 3 tiers", () => {
		const tiers = GROUPS.filter((g) => g.kind === "tier");
		expect(tiers).toHaveLength(3);
		expect(tiers.map((g) => g.name)).toEqual(["Foundation", "Primitives", "Blocks"]);
	});

	test("GROUPS ends with 6 domains", () => {
		const domains = GROUPS.filter((g) => g.kind === "domain");
		expect(domains).toHaveLength(6);
		expect(domains.map((g) => g.name)).toEqual([
			"Work",
			"Knowledge",
			"Conversations",
			"Artifacts",
			"Settings",
			"System",
		]);
	});

	test("GROUPS order: all tiers come before any domain", () => {
		let seenDomain = false;
		for (const grp of GROUPS) {
			if (grp.kind === "domain") seenDomain = true;
			if (seenDomain && grp.kind === "tier") {
				throw new Error(`Tier ${grp.name} comes after a domain in GROUPS`);
			}
		}
	});
});
