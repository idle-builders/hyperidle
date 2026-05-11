/**
 * M2: Auth identity contract.
 *
 * GET /api/auth/me — returns the authenticated user's identity.
 * Replaces all hardcoded "u-founder" / DEFAULT_FOUNDER_ID / DEMO_FOUNDER_ID
 * literals across server and client code.
 *
 * @lore M2: v1 is single-founder. The factory has exactly one founder whose
 * id is stored in factorySettings ("founder_id"). Multi-user support is a
 * future concern — this contract is deliberately narrow.
 */

/** Response shape for GET /api/auth/me. */
export interface AuthMeResponse {
	readonly id: string;
	readonly name: string;
	readonly email: string;
	readonly avatarUrl: string | null;
}
