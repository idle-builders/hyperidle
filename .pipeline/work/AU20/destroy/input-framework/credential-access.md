# Destroyer input — `credential-access` (framework)

Package: `framework/credential-access`
Surface: 3 exported functions, 1 classes (0 member methods), 1 interface/type declarations, 0 const/enum exports.

## A. Exported functions — EVERY ONE NEEDS A VERDICT

| # | Method | Public | Location |
|---|---|---|---|
| 1 | `encryptCredentialValue` | yes | `framework/credential-access/src/crypto/credential-encryption.ts:149` |
| 2 | `decryptCredentialValue` | yes | `framework/credential-access/src/crypto/credential-encryption.ts:165` |
| 3 | `resolveModel` | yes | `framework/credential-access/src/resolve-model.ts:202` |

## B. Classes and their member methods — EVERY MEMBER NEEDS A VERDICT

### `UnsupportedAgentProviderError` — `framework/credential-access/src/resolve-model.ts:74` (internal)
- (no public member methods)

## C. Interface / type declarations — the DI-port surface

Verdict each DECLARATION (not every member individually) unless a member is independently interesting. A port member whose only implementation you are deleting dies with it — say so.

- `CredentialResolver` (interface, public) `framework/credential-access/src/resolve-model.ts:39` — members: `resolve`
