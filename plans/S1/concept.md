# S1 Concept Verification

**Status:** Concept locked. No upstream `/concept` work needed.

## Verification against `plans/shared-server/concept.md`

### LoginSession

- **Class:** New primitive. Confirmed.
- **Contracts defined:** Yes. Essential properties (id, userId, tokenHash, expiresAt, createdAt, revokedAt), lifecycle (created -> active -> expired/revoked), authority (server creates on invite claim), cardinality (one user -> many sessions), closure (opaque bearer token only), mutability (append-only), hard rules (plaintext returned once, constant-time hash, no local mode involvement) -- all specified.
- **Vocabulary locked:** LoginSession (not "auth session"), bearer token (not "API key"), server admin key (not "master key").

### InviteCode

- **Class:** Satellite concept. Confirmed.
- **Definition complete:** Table shape specified (code, createdBy, claimedBy, expiresAt, createdAt). Admin creates, user claims, produces LoginSession + user. 7-day default expiry.

### Noun scan -- no missing nouns

The S1 spec introduces no new nouns beyond what the concept already classifies. The spec references:

- `login_sessions` table -- covered by LoginSession primitive
- `invite_codes` table -- covered by InviteCode satellite
- Auth middleware changes -- operational, not a noun
- Bearer token / server admin key -- vocabulary locked in concept
- WebSocket upgrade token -- existing concept (I2 A3), unchanged

### Observations

1. The S1 spec adds a `role` column to `invite_codes` that the concept doc does not mention. This is a refinement, not a concept gap -- the concept says "operational detail of user provisioning" and defers schema to architecture.

2. The concept says "Server creates LoginSessions on invite claim" but the spec also implies token creation needs to work for the existing admin key flow (the admin key falls back to the first human user). This is consistent: admin key is not a LoginSession, it is a separate auth path that resolves to a userId directly.

3. The concept's "no OAuth, no SSO, no passwords" closure is reflected in the S1 spec's "Out of scope: Password auth" and "No OAuth, no SSO, no passwords in this WP."

**Conclusion:** Concept is locked and complete for S1 scope. Proceeding to architecture.
