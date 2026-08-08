/**
 * AK6 — Factory-roster injection seam (registry-free).
 *
 * `FactoryRosterSpec` is a PURE VALUE (not a port call) injected into
 * `applyFactoryBootstrap` so the db leaf + desktop can seed facilitators
 * without the server roster registry. The default preserves the app roster
 * (preservation).
 *
 * @lore AK6: This is the "registry-free roster injection" seam. The db leaf
 * (`framework/db`) cannot import server-owned runtime services (inverts
 * `db→server`). Instead, `applyFactoryBootstrap(db, roster?)` takes
 * this value as an optional param, defaulting to `defaultFactoryRoster`.
 *
 * @lore AK6: `defaultFactoryRoster` lives in `@hyperidle/shared` (the contract
 * layer) so both `framework/db` (the bootstrap writer) and server-owned
 * app defaults can reference the same canonical seed.
 * The `db→shared` import direction is valid (`framework/db/package.json`
 * already depends on `@hyperidle/shared`).
 *
 * @lore AK6: Concept hard-rule #1: `db/factory-bootstrap.ts` must NOT contain
 * a hard-coded persona constant or roster. The roster *composition* comes from
 * this injected value; the persona *text* still comes from
 * `docs/system-prompts/*.md` read at bootstrap (unchanged).
 */

import type { UserRole } from "./types.js";

/**
 * One facilitator entry in the factory roster.
 *
 * NOTE (architecture-critique NIT-1): the facilitator's display name and skills
 * are DERIVED from `community` by the db-bootstrap (it keeps `COMMUNITY_DISPLAY_NAMES`
 * / `FACILITATOR_TOOLS` as db-owned infra). DO NOT add `name` or `skills` here —
 * the db-writer derives them. The spec carries only the roster COMPOSITION.
 */
export interface FactoryFacilitatorSpec {
	/** community of practice key (e.g. "build", "product", "growth", "ops", "facilitation") */
	readonly community: string;
	/** always "facilitator" */
	readonly role: UserRole;
	/** id-hint to preserve: `seed-agent-pf-${community}` */
	readonly idHint: string;
	/** which `system_template:<role>` key in factorySettings the persona reads from */
	readonly templateRole: string;
}

/**
 * The system-assistant singleton entry.
 * null = no system assistant (Minimal factory roster).
 */
export interface FactorySystemAssistantSpec {
	/** always "assistant" */
	readonly role: UserRole;
	/** id-hint to preserve: "seed-agent-cos" */
	readonly idHint: string;
}

/**
 * The factory-bootstrap roster spec — a PURE VALUE injected into
 * `applyFactoryBootstrap(db, roster?)`.
 *
 * Determines:
 *   - Which facilitator agents exist (one per entry in `facilitators`)
 *   - Whether a system-assistant singleton exists (`systemAssistant`)
 *
 * Does NOT determine:
 *   - `system:propagation` (db infra — always written unconditionally)
 *   - `factorySettings` cost/cycle/template rows (db infra — always written)
 *   - `seed-ki-1` knowledge item (db infra — always written)
 *   - Facilitator display names or skills (derived from community by db-bootstrap)
 */
export interface FactoryRosterSpec {
	/** One facilitator per community of practice. Empty under Minimal. */
	readonly facilitators: readonly FactoryFacilitatorSpec[];
	/** The system-assistant singleton. null under Minimal. */
	readonly systemAssistant: FactorySystemAssistantSpec | null;
}

/**
 * The default factory roster — reproduces today's pre-AK6 seed rows byte-for-byte.
 *
 * 5 communities × 1 facilitator + 1 system assistant.
 * This is the value `applyFactoryBootstrap(db)` uses when called with no second arg.
 *
 * All four registry-less boot paths (desktop + 3 leaf CLIs) rely on this default.
 *
 * @lore AU3: App-owned defaults carry the initial persona seed. This value is
 * the *initial state*
 * placed in the DB by bootstrap; post-creation evolution is out of AK6 scope.
 */
/**
 * @lore AU29: folded in from `framework/db/src/seed-fixtures.ts` (verbatim
 * content) — this module already documents the display-name derivation
 * above (`FactoryFacilitatorSpec`'s NOTE), and `factory-bootstrap.ts`'s only
 * consumer of these constants was already a cross-package import into
 * `@hyperidle/shared`'s roster vocabulary. `PRACTICE_COMMUNITIES` /
 * `PracticeCommunity` stay module-internal (not barrel-exported) — their
 * only use is typing this record; repo-grep at architecture time found zero
 * external consumers.
 *
 * @lore AU26 G1: `FACILITATOR_TOOLS` was deleted with the `users.skills`
 * column it was the only writer of. That column had zero production readers
 * repo-wide (this seeder wrote it and nothing ever read it back), so it was
 * DROPPED, not relocated — see migration 0055. If per-agent tool scoping is
 * wanted again it is a new design, not a resurrection of this list.
 */
const PRACTICE_COMMUNITIES = ["build", "product", "growth", "ops", "facilitation"] as const;
type PracticeCommunity = (typeof PRACTICE_COMMUNITIES)[number];

/** Facilitator display name, by community of practice. */
export const COMMUNITY_DISPLAY_NAMES: Record<PracticeCommunity, string> = {
	build: "Build",
	product: "Product",
	growth: "Growth",
	ops: "Ops",
	facilitation: "Facilitation",
};

export const defaultFactoryRoster: FactoryRosterSpec = {
	facilitators: [
		{
			community: "build",
			role: "facilitator",
			idHint: "seed-agent-pf-build",
			templateRole: "facilitator",
		},
		{
			community: "product",
			role: "facilitator",
			idHint: "seed-agent-pf-product",
			templateRole: "facilitator",
		},
		{
			community: "growth",
			role: "facilitator",
			idHint: "seed-agent-pf-growth",
			templateRole: "facilitator",
		},
		{
			community: "ops",
			role: "facilitator",
			idHint: "seed-agent-pf-ops",
			templateRole: "facilitator",
		},
		{
			community: "facilitation",
			role: "facilitator",
			idHint: "seed-agent-pf-facilitation",
			templateRole: "facilitator",
		},
	],
	systemAssistant: {
		role: "assistant",
		idHint: "seed-agent-cos",
	},
};
