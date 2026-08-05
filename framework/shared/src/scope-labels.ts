/**
 * scope-labels — AV3: Promoted from web utils to @hyperidle/shared as SSOT.
 *
 * @lore AV3: scopeKindToLabel was previously web-only (layers/web/src/utils/scope-labels.ts).
 * Moved to @hyperidle/shared so the server fallback and web fallback are the same function,
 * preventing drift between the two. The web file is kept as a thin re-export.
 *
 * @lore AD6: Scope vocabulary was collapsed from 7 SCOPE_KINDS to 3 user-facing
 * choices. "Shared" maps to factory+practice (org-wide scopes).
 * "Team" maps to team+product (U1 renamed Products → Teams; product scope now
 * displays under the Team label). "Private" maps to user scope (only visible to
 * the creator).
 *
 * @lore AE1: "product" maps to "Team" (not "Shared") because U1 renamed
 * Products → Teams. Items that were product-scoped are now displayed under the
 * Team label to avoid surfacing internal vocabulary to users.
 */

/**
 * Maps a raw scopeKind from the API to the user-facing bucket label.
 * factory/practice/bet/task → "Shared"
 * team/product → "Team"
 * user → "Private"
 * Anything else → "Shared" (safe fallback).
 *
 * @lore AU26 F2 (founder ruling): the "filesystem" branch is gone with the
 * scope kind itself. A stored `filesystem` string is now just an unknown kind
 * and takes the safe fallback like any other.
 *
 * This is the single source of truth for scope bucket labels — used by
 * both the server (missing-entity fallback in resolveScopeName) and the
 * web (filter pills, scope-change picker, scope row fallback).
 *
 * @lore AE1: "product" maps to "Team" (not "Shared") because U1 renamed
 * Products → Teams. Items that were product-scoped are now displayed under the
 * Team label to avoid surfacing internal vocabulary to users.
 */
export function scopeKindToLabel(scopeKind: string): string {
	if (scopeKind === "user") return "Private";
	if (scopeKind === "team" || scopeKind === "product") return "Team";
	// factory, practice, bet, task, unknown → Shared
	return "Shared";
}
