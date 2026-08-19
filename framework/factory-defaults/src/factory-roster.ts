/**
 * AK6 — Factory-roster injection seam (registry-free).
 *
 * `FactoryRosterSpec` is a PURE VALUE (not a port call) consumed by
 * `applyFactoryCoreState` (`layers/core-api/src/bootstrap/factory-state.ts`)
 * so the composition roots (desktop + the `tools/setup` CLIs) can seed
 * facilitators without the server roster registry. The default preserves the
 * app roster (preservation).
 *
 * @lore AK6: This is the "registry-free roster injection" seam, originally for
 * `framework/db` (which could not import server-owned runtime services).
 * AU29 relocated the bootstrap writer out of `framework/db` entirely, into a
 * layer face that routes every write through the owning services
 * (`insertUserIfAbsent` / `setAgentCategoryForRole` / `listFactoryAgents`)
 * instead of writing tables directly — `defaultFactoryRoster` remains its
 * default roster value.
 *
 * @lore AK6: `defaultFactoryRoster` lives in `@hyperidle/factory-defaults` (the contract
 * layer) so both the bootstrap writer and server-owned app defaults can
 * reference the same canonical seed.
 *
 * @lore AK6: Concept hard-rule #1: the bootstrap writer must NOT contain
 * a hard-coded persona constant or roster. The roster *composition* comes from
 * this injected value; the persona *text* still comes from
 * `docs/system-prompts/*.md` read at bootstrap (unchanged).
 */

/**
 * One facilitator entry in the factory roster.
 *
 * NOTE (architecture-critique NIT-1): the facilitator's display name is
 * DERIVED from `community` by `applyFactoryCoreState`
 * (`layers/core-api/src/bootstrap/factory-state.ts`) via `COMMUNITY_DISPLAY_NAMES`,
 * defined below in this file. DO NOT add `name` here — the consumer derives
 * it. The spec carries only the roster COMPOSITION. (`skills` /
 * `FACILITATOR_TOOLS` no longer exist — see the AU26 G1 lore below.)
 */
export interface FactoryFacilitatorSpec {
	/** community of practice key (e.g. "build", "product", "growth", "ops", "facilitation") */
	readonly community: string;
	/** always "facilitator" */
	readonly role: string;
	/** id-hint to preserve: `seed-agent-pf-${community}` */
	readonly idHint: string;
	/** which `system_template:<role>` key in factorySettings the persona reads from */
	readonly templateRole: string;
}

/**
 * The default factory roster — reproduces today's pre-AK6 seed rows byte-for-byte.
 *
 * 5 communities × 1 facilitator + 1 system assistant.
 * This is the value `applyFactoryCoreState(db)` uses.
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
 * `@hyperidle/domain-model`'s roster vocabulary. `PRACTICE_COMMUNITIES` /
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

export const defaultFactoryRoster = {
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
