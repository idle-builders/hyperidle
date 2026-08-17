# credential-access — destroyer verdict (framework)

## Where does this package go?
**Verdict: DISSOLVE → `layers/core-api/credentials`. One place absorbs all three.**

The credentials destroyer was too cautious; do not compound it. Said plainly: the `credentials`
service is the single home for everything in this package — the cipher, the `CredentialResolver`
port, and `resolveModel`. Here is why each of the three belongs there and nowhere else:

- **The cipher** (`encryptCredentialValue`/`decryptCredentialValue`): its root of trust IS the
  credentials story — a key derived from `HYPERIDLE_API_KEY`/`HYPERIDLE_CREDENTIAL_KEY`, the same
  secret `credentials` already owns operationally. The only consumer outside core-api is the
  `connections` surface (`agent-orchestration/src/routes/connections.ts:271,401` and
  `connections/src/service-connection-resolver.ts:52`), which the connections destroyer already
  flagged as "shares a cipher without duplicating it." The resolution is not a shared package — it
  is injection: the composition roots (`desktop/create-server.ts`, `remote-server/create-server.ts`)
  already compose both layers and already thread a `CredentialResolver` value from credentials-land
  into the server handle. Thread `{ encrypt, decrypt }` the same way. Two closures over one wire
  that already exists.
- **The port** (`CredentialResolver`): both production implementations (`DbCredentialResolver`, and
  eval's dev-only `EnvCredentialResolver`) — the real one lives in `@hyperidle/credentials`, which
  ALREADY re-exports this interface "for convenience." A package whose type is re-exported by the
  service that implements it is a laundering layer, and the AU31 lore on `remote-server` admits it
  outright: the framework package exists so an Application can name the type "never
  `@hyperidle/credentials` (a Service) directly" — while the runtime value on that very handle IS a
  `DbCredentialResolver` from that service. That is a governance spelling rule, not architecture.
  Change the declared reach; delete the laundering. The stale lore claiming harness-registry's
  `cli-harness-adapter` consumes this port is false today — `rg` finds zero references to
  `CredentialResolver` anywhere in `layers/agent-execution/harness-registry/src`.
- **`resolveModel`**: exactly ONE production caller — `layers/core-api/src/boot.ts` (the
  composition root building the dispatch capability). Its whole job is "credential + config →
  provider/model/apiKey", and its one dependency is the resolver whose implementation lives in
  `credentials`. It sits next to `DbCredentialResolver` or it sits in the wrong place. (tools/eval
  also imports it — dev world, follows the move.)

## Consumers (measured, not assumed)
| Consumer | What it imports | Could it own this? |
|---|---|---|
| `layers/core-api` root (app.ts, boot.ts, service-bootstrap.ts, routes/credentials.ts) | cipher pair, `resolveModel`, `CredentialResolver` type | Moves to importing `@hyperidle/credentials` — an edge boot.ts already has (`DbCredentialResolver`, `readCredentials`, `writeCredential`) |
| `layers/core-api/credentials` | `decryptCredentialValue`, `CredentialResolver` type | It becomes the owner — imports vanish |
| `layers/agent-orchestration` (routes/connections.ts, connections service) | cipher pair / decrypt | Receives `{ encrypt, decrypt }` injected from the composition roots — same wire the resolver already rides |
| `applications/desktop`, `applications/remote-server` | `type CredentialResolver` only | Type comes from `@hyperidle/credentials`; the type-only Service import is exactly what the runtime value already is |
| `layers/core-ui/__scripts__`, `tools/eval` | encrypt / `resolveModel` / type | Dev world — free to import the Service directly |

## If written today, from scratch
`@hyperidle/credentials` exports: the cipher pair, `CredentialResolver` (declared once, not
re-exported from anywhere), `DbCredentialResolver`, `resolveModel`. `connections` holds two injected
function values. No framework package.

## Kill summary
| Verdict | Count |
|---|---|
| DELETE | 1 |
| MERGE | 0 |
| SIMPLIFY | 0 |
| KEEP | 4 |
Surface: 5 exports → 4 (20% export cut; 100% package cut)

## Feature-level kills
- **The package itself and the type-laundering pattern it anchors**: the "Application must not name
  a Service type" spelling that forced this package into existence dies with it. One declared-reach
  row in governance changes; four packages stop depending on a 5-export shim.
- **`credentials`' convenience re-export of `CredentialResolver`**: becomes the single declaration
  instead of a re-export — the brief's re-export garbage category, resolved by the move itself.

## Full export audit
| # | Export | Kind | Reach | Verdict | Reason |
|---|---|---|---|---|---|
| 1 | `encryptCredentialValue` | function | UI:`POST /api/credentials` + UI:connections store route (`connections.ts:271`) | KEEP | Real secrets at rest (AES-256-GCM over HKDF of the root key) for two live doors. Moves into `credentials`; connections gets it injected. |
| 2 | `decryptCredentialValue` | function | UI:credentials read + `DbCredentialResolver` + connections resolver (`service-connection-resolver.ts:52`) | KEEP | The read half of the same cipher. Moves with it. |
| 3 | `resolveModel` | function | BOOTSTRAP — sole production caller `core-api/src/boot.ts` (builds the dispatch drain's model capability) | KEEP | Load-bearing for every LLM call the server makes; one caller, one owner — moves next to the resolver implementation in `credentials`. |
| 4 | `UnsupportedAgentProviderError` | class | TEST-ONLY (`AH2-resolve-agent-model.integration.test.ts:131` is the only reference; no production catch or `instanceof` anywhere) | DELETE | An error subclass nobody catches is a plain `Error` with a costume. Throw `Error` with the same message; retag the test to assert the message. |
| 5 | `CredentialResolver` | interface | BOOTSTRAP — implemented in `credentials`, threaded by both app composition roots and core-api boot | KEEP | A real port with two ends — but both ends' home is `credentials`; the separate package existed only to launder the Service name out of Application imports. Declare it once, in `credentials`. |

## Holes this leaves
- `connections` gains two injected function parameters (encrypt, decrypt) in its route deps and
  resolver constructor — the AU20 Am4 "no secret param" ergonomics survive because the closures
  still own the key. Cost: two wiring lines per composition root.
- Governance: one framework-surfaces/declared-reach entry deleted, and applications' type-only
  import of `@hyperidle/credentials` must be permitted. If the linter's model cannot express
  "composition roots may name Services," that model — not the code — is what needs the fix.
- The stale `@lore` in `resolve-model.ts` about `cli-harness-adapter` injecting this port must not
  be copied into the new home; it describes an edge that no longer exists.
