# Destroyer input — `credentials` (core-api)

Package: `layers/core-api/credentials`
Surface: 3 exported functions, 1 classes (1 member methods), 1 interface/type declarations, 0 const/enum exports.

## A. Exported functions — EVERY ONE NEEDS A VERDICT

| # | Method | Public | Location |
|---|---|---|---|
| 1 | `readCredentials` | yes | `layers/core-api/credentials/src/credential-store.ts:47` |
| 2 | `writeCredential` | yes | `layers/core-api/credentials/src/credential-store.ts:75` |
| 3 | `deleteCredential` | yes | `layers/core-api/credentials/src/credential-store.ts:118` |

## B. Classes and their member methods — EVERY MEMBER NEEDS A VERDICT

### `DbCredentialResolver` — `layers/core-api/credentials/src/credential-resolver.ts:36` (public)
- `DbCredentialResolver.resolve`

## C. Interface / type declarations — the DI-port surface

Verdict each DECLARATION (not every member individually) unless a member is independently interesting. A port member whose only implementation you are deleting dies with it — say so.

- `CredentialWrite` (interface, public) `layers/core-api/credentials/src/credential-store.ts:32` — members: `encryptedValue`, `validationState`, `lastValidatedAt`, `updatedAt`
