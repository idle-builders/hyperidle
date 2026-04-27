/**
 * @lore L6: client/server share the request-changes summary upper bound.
 * A unilateral bump on either side breaks the other's validation.
 */
export const REQUEST_CHANGES_SUMMARY_MAX = 140;

/**
 * @lore L6 review (sec must-fix / adv CRIT-3): cap on `inline_comments[]`
 * payload count. Without this, a malicious or buggy client can post an
 * unbounded array (each entry up to 2000 chars) that gets JSON-stringified
 * into the `responses.inline_anchor` text column and re-broadcast to every
 * WebSocket subscriber. 50 line-anchored comments per verdict is well above
 * any realistic line-by-line code review and bounds the JSON blob to a few
 * hundred KB worst case. Mirrored on the client (composer's add-comment
 * affordance disables past this) and the server (Zod schema rejects with
 * 400). A unilateral bump on either side breaks the other's validation.
 */
export const REQUEST_CHANGES_INLINE_COMMENTS_MAX = 50;
