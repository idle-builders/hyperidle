/**
 * P5 FirstTimeHints — hint catalog definitions.
 *
 * The catalog lives in @hyperidle/shared so both the server (for ID
 * validation at the API boundary) and the client (for rendering copy)
 * import from a single source of truth.
 *
 * @lore P5: trigger evaluation is client-side (view state checks);
 * persistence is kernel-level (hint_progress table); catalog types
 * belong in shared — it's a contract between layers.
 */

/** Closed union of all hint identifiers. */
export type HintId =
	| "create-bet"
	| "add-credential"
	| "knowledge-empty"
	| "review-verdict"
	| "review-agents"; // AB3: agent customization first-time hint

/** Static definition of a single hint. */
export interface HintCatalogEntry {
	readonly id: HintId;
	/** One-sentence, action-oriented copy shown to the user. */
	readonly copy: string;
	/** data-testid for E2E and component test selection. */
	readonly testId: string;
}

/** All known hints. Add entries here to introduce new hints. */
export const HINT_CATALOG: readonly HintCatalogEntry[] = [
	{
		id: "create-bet",
		copy: "Create a bet to give your team something to work on.",
		testId: "hint-create-bet",
	},
	{
		id: "add-credential",
		copy: "Your team will pick this up. Add a credential in Settings if you haven't yet.",
		testId: "hint-add-credential",
	},
	{
		id: "knowledge-empty",
		copy: "Knowledge items are created by your team as they work. You can also add your own.",
		testId: "hint-knowledge",
	},
	{
		id: "review-verdict",
		copy: "Approve, request changes, or reject. Your verdict tells the agent what to do next.",
		testId: "hint-review-verdict",
	},
	// AB3: agent customization first-time hint
	{
		id: "review-agents",
		copy: "Your team's agents are ready. Click any agent to review and personalize their style.",
		testId: "hint-review-agents",
	},
] as const;

/** Ordered list of all hint IDs — derived from HINT_CATALOG. */
export const HINT_IDS: readonly HintId[] = HINT_CATALOG.map((h) => h.id);

/**
 * Type guard: returns true if `value` is a known HintId.
 * Case-sensitive — "Create-Bet" returns false.
 */
export function isHintId(value: string): value is HintId {
	return (HINT_IDS as readonly string[]).includes(value);
}
