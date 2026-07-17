# `connections` — Service-as-Product Audit (AU20)

**Layer:** core-api · **Owned tables:** `serverCredentials`, `serviceConnections` · **Current public exports:** 34 · **Target:** ~18

---

## 1. Existence / Consolidation Verdict — **STANDALONE**

`connections` earns its own boundary, and it is the clearest-cut case for a real
security seam in the codebase. It owns the two most sensitive tables in the
system — `serverCredentials` (AES-256-GCM encrypted server-wide secrets: API
keys, shared-backend key) and `serviceConnections` (per-user held tokens) — and
it is the **sole plaintext path** to either. The AU19 "why separate" claim
("single most sensitive data class, one clear owner, no ambiguity about who
touches `server_credentials`") holds up under challenge: the boundary is not
"owns a table" packaging, it is a genuine **encryption/secret-custody seam**.
Every sibling reaches it through a narrow DI port precisely so that no other
file can `db.select` an `encryptedValue` or `encryptedToken`. That is an earned
security boundary (ETHOS: security from real custody needs, not preemptive).

**Candidate neighbors: none** — the landscape pass proposed no cluster for this
service, and that is correct. Its consumers span five unrelated domains
(`model-gateway`, `filesystems`, `session-lifecycle`, `notifications`,
`settings`); it is a shared sink, not a stage in anyone's pipeline. Folding it
into any one consumer would re-expose the secret tables to that consumer's
peers. It is infra-flavored (all consumers are other services, not end users),
but it is **not** the agent-orchestration/agent-execution platform — it is a
distinct **credential & connection vault** product whose customers are services.

**The real finding is not existence — it is the 34→~18 export sprawl.** The
service is genuine; its API is over-fragmented. Roughly 16 of the 34 exports are
raw table-row accessors (`findByName`/`insert`/`upsert`/`delete`/`listAll` ×2
tables), each carved to fit one route or one sibling's DI port. That is the
table-CRUD-leak anti-pattern: the product surface should speak *credentials* and
*connections*, not `db.select().from(...)` shapes with a name on them.

**Product purpose (to whom):** resolve named server credentials for
`model-gateway`; resolve held per-user tokens for `filesystems` +
`session-lifecycle`; encrypt/store sibling-owned secrets for `notifications` +
`settings`; and compute + apply the spawn-time provisioning plan for
`session-lifecycle`.

---

## 2. The Deliberate Target Public API (~18 exports, down from 34)

Eight cohesive interfaces, each general/composable, replacing the per-caller
sprawl.

### A. Cipher (2, was 5)
- `encryptCredentialValue(plaintext) → string`
- `decryptCredentialValue(ciphertext) → string | null`

The root-secret plumbing (`getServerSecret`, `requireServerSecret`, `deriveKey`)
becomes **internal** — bound inside the cipher, not handed to callers.
`notifications`/`settings` today chain `getServerSecret()` then
`encrypt/decrypt(secret)`; the product surface is "encrypt this secret," so the
service owns the key and exposes only the two verbs. (Pure secret-param
functions stay internal for unit testing.)
*Subsumes:* `getServerSecret`, `requireServerSecret`, `deriveKey`,
`encryptCredentialValue`, `decryptCredentialValue`.

### B. CredentialResolver family (3, unchanged)
- `CredentialResolver` (type, re-exported from `@hyperidle/shared`)
- `DbCredentialResolver`, `EnvCredentialResolver`

Already the ideal shape: one method `resolve(name)` parameterized by credential
name; two strategy impls (DB=production, Env=eval-only). This is the model for
the whole service. `model-gateway` consumes `.resolve`. Keep verbatim.

### C. ServiceConnectionResolver (1, unchanged)
- `ServiceConnectionResolver` (class, `resolve(userId, connectionId)`)

The sole decrypted-held-token path. `filesystems` + `session-lifecycle` consume
`.resolve`. One method, per-user-scoped, never throws. Keep verbatim.

### D. CredentialStore (4, was 9)
- `readCredentials(filter?: { name?: string }) → ServerCredential[]`
- `writeCredential(name, patch: CredentialWrite)` — upsert; partial patch of
  value/validation columns
- `deleteCredential(name)`
- `CredentialWrite` (type)

*Subsumes:* `findCredentialByName` + `listAllCredentials` → `readCredentials`
(filter by name or list all); `insertCredential` + `upsertCredential` +
`setCredentialValue` + `updateCredentialValidationState` → `writeCredential`
(one upsert parameterized by which columns the caller sets — value, validation
state, timestamp); `deleteCredentialByName` → `deleteCredential`;
`ServerCredentialWriteValues` + `SetCredentialValueInput` → one `CredentialWrite`
patch type. The "new value ⇒ validation reset" rule is expressed by the caller's
patch, keeping the raw store honest and general.

### E. ConnectionStore (4, was 7)
- `listConnections(filter: { userId?, authSource?, id? }) → ServiceConnectionRow[]`
- `insertConnection(values)`
- `updateConnection(id, patch)` — health/validation write-back
- `deleteConnection({ id, userId })`

*Subsumes:* `listServiceConnectionsByUserId` + `listServiceConnectionsByAuthSource`
+ `getServiceConnectionById` + `getServiceConnectionByIdForUser` →
`listConnections(filter)` (id+userId filter gives the existence-leak-safe scoped
read; `[]` on cross-user → caller 404s); `updateServiceConnectionHealth` →
`updateConnection`; `deleteServiceConnectionForUser` → `deleteConnection`;
`insertServiceConnection` unchanged (409-translation stays the caller's job).

### F. Provisioning (4, was 7)
- `buildProvisioningPlan(deps) → ProvisioningPlan`
- `applyProvisioningPlan(args)`
- `resolveOwningHumanUserId(...)`
- `ProvisioningPlan` (type)

Two-phase build/apply is a legit inspectable-plan seam (`session-lifecycle`
consumes all three + the type). `listActiveHeld`, `SERVICE_CLI_ENV`, and
`ResolvedMcpServer` become **internal** — the data package shows no external
consumer requests them; they are internals of `buildProvisioningPlan`.
(`resolveOwningHumanUserId` is a fold-into-build candidate if
`session-lifecycle` stops needing the userId independently.)

### G. `projectInheritedConnections` (1, unchanged)
Pure in-memory projection of harness descriptors → inherited `ServiceConnectionView[]`.
No DB. A distinct capability (the inherited half of the held-vs-inherited model).

### H. `ConnectionsUserReader` (1, DI port type — plumbing)
Consumed, not offered; exported only so the composition root can wire it.

**Target export count: 18** (2+3+1+4+4+4+1+1, minus fold of `CredentialWrite`/
`resolveOwningHumanUserId` if pursued → 16–18).

---

## 3. Inside Lens — staying clean/evolvable

- **Two stores, one shape.** Both `CredentialStore` and `ConnectionStore`
  follow `read(filter) / write(patch) / delete` — one mental model for both
  tables; a new column is a new patch field, not a new method.
- **Secret custody stays internal.** No caller ever holds the root secret; the
  cipher owns it. Key rotation / a new derivation is a one-file change behind
  `encrypt/decrypt`.
- **Resolvers are strategy interfaces**, not switches: a new backing store
  (e.g. cloud KMS) is a new `CredentialResolver` impl, zero API change.
- **Plan is data.** `buildProvisioningPlan` returns an inspectable value;
  `applyProvisioningPlan` is the only side-effecting call — testable without
  mutating an environment.

---

## 4. Scaling Argument (sub-linear)

Apply the test — "add dozens more services, hundreds more calls":

- New service needs an API key → `CredentialResolver.resolve(name)`. **No new
  method** (parameterized by name).
- Route wants "credentials that failed validation" →
  `readCredentials({ validationState })` — **extend the filter**, not a new
  `listInvalidCredentials`.
- A dashboard wants "connections needing attention" →
  `listConnections({ health: 'needs-attention' })` — **filter param**, versus
  the failing pattern of `listByUserId` + `listByAuthSource` + `listUnhealthy` +
  `listById...` growing one method per query.
- New service needs to stash its own secret → `Cipher.encrypt` +
  `CredentialStore.writeCredential`. **Compose existing verbs.**
- New harness/provisioning target → add an entry to the internal
  `SERVICE_CLI_ENV` map. **Data, not a method.**

The current API fails this test: it grew `findByName`, `listAll`,
`listByUserId`, `listByAuthSource`, `getById`, `getByIdForUser`,
`setCredentialValue`, `updateValidationState` — a method per query/write intent.
The filter/patch redesign absorbs each of those as an argument.

---

## 5. Key Collapses

1. **9 credential-row accessors → 3** (`read(filter)` + `write(patch)` +
   `delete`): `findByName`+`listAll`→`readCredentials`;
   `insert`+`upsert`+`setCredentialValue`+`updateValidationState`→`writeCredential`.
2. **7 service-connection accessors → 4**: four getters/lists
   (`byUserId`/`byAuthSource`/`byId`/`byIdForUser`) → one `listConnections(filter)`.
3. **5 encryption exports → 2**: `getServerSecret`/`requireServerSecret`/`deriveKey`
   internalized; only `encrypt`/`decrypt` remain public.
4. **7 provisioning exports → 4**: `listActiveHeld`, `SERVICE_CLI_ENV`,
   `ResolvedMcpServer` demoted to internal (no external consumer).
5. **Two write-shape types → one** `CredentialWrite` patch.

Net: 34 → ~18, with two symmetric store surfaces and a secret vault whose key
never leaves the service.
