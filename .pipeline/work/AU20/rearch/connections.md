# `connections` — Service-as-Product Re-Architecture (AU20, BOTH lenses)

**Layer:** core-api · **Owned tables:** `serverCredentials`, `serviceConnections`
**Now:** 18 methods / 4 types (post-Am4 collapse) · **Target:** 14 methods / 3 types

> The Am4 pass shrank the *barrel* (34→18) but only **hid** internals
> (`getServerSecret`, `SERVICE_CLI_ENV`, `listActiveHeld`, `ResolvedMcpServer`)
> — it never re-derived the surface from the substrate. This pass does both
> lenses. The honest finding: **`connections` is one of the few services already
> near its floor.** It is a credential-and-connection *vault*; almost every
> export maps 1:1 to a genuine custody capability or plain 2-table CRUD. The
> remaining discipline is two real deletions, not a re-collapse.

---

## 1. INSIDE-OUT — substrate → floor → genuine capabilities

### Substrate: **owned-tables** (2)
Everything the service does is built up from two tables it exclusively owns — it
is the **sole plaintext path** to either. That custody is the earned security
seam (ETHOS: security from real custody, not preemptive).

| Table | What it holds | CRUD floor |
|---|---|---|
| `serverCredentials` | AES-256-GCM server-wide secrets (API keys, shared-backend key), keyed by name | read(filter) · write(upsert) · delete = **3** |
| `serviceConnections` | per-user held tokens + outbound MCP pointers | list(filter) · insert · update · delete = **4** |

**5N anchor = 10.** Collapsing `get`+`list` into one filter-parameterized read
per table lands the honest CRUD floor at **7** (3 + 4).

### Genuine owned capabilities beyond CRUD (each = a real product capability, not sprawl)

1. **Cipher — secret custody (internal-logic).** AES-256-GCM + HKDF over a root
   key that **never leaves this service**. `encrypt`/`decrypt` with no secret
   param (key lookup is internal). This is the *reason the boundary exists*:
   `notifications` + `settings` stash *their own* secrets through it. **+2.**
2. **CredentialResolver (Db strategy).** `resolve(name) → plaintext | null` =
   read+decrypt behind an injectable interface (the interface type lives in
   `@hyperidle/shared` so `harness-registry`/`model-gateway` can accept an
   injected resolver without depending on `connections` — Mechanism B). The sole
   decrypt-on-read path for server creds. **+1.**
3. **ServiceConnectionResolver.** `resolve(userId, connId) → plaintext | null` —
   the **sole** per-user held-token plaintext path; per-user isolation via
   `AND(id,userId)`, never throws, never leaks existence. Deliberately *not* a
   method on the plain store (plain `listConnections` returns encrypted rows).
   **+1.**
4. **Provisioning (fs/harness adapter).** `buildProvisioningPlan` (reads active
   held conns, resolves tokens, SSRF-checks URLs → inspectable plan **value**) +
   `applyProvisioningPlan` (writes per-harness carriers: codex-toml /
   opencode-json / claude-native → sandbox). Two-phase build/apply is a legit
   inspectable-plan seam; `session-lifecycle` is the sole consumer. **+2.**
5. **projectInheritedConnections.** Pure in-memory projection of harness
   descriptors → inherited `ServiceConnectionView[]`. The *inherited* half of the
   held-vs-inherited model; no DB. **+1.**

Genuine capabilities = **7.** Target = collapsed CRUD (7) + capabilities (7) =
**14** — *below* the raw 5N=10 anchor + capabilities, because filter-unification
absorbed every `get*`/`listBy*` into one read per table.

---

## 2. OUTSIDE-IN — real consumer demand (from the data)

| Consumer | Requests | Served by |
|---|---|---|
| `model-gateway` | `resolve` | `DbCredentialResolver.resolve(name)` |
| `filesystems` | `resolve` | `ServiceConnectionResolver.resolve(userId,id)` |
| `notifications` | `encryptCredentialValue` / `decryptCredentialValue` | Cipher |
| `notifications` | `findByName` / `upsert` / `deleteByName` | `readCredentials({name})` / `writeCredential` / `deleteCredential` |
| `settings` | `encrypt` / `decrypt` | Cipher |
| `settings` | `listByAuthSource` | `listConnections({authSource})` |
| `settings` | `findByName` / `insert` | `readCredentials({name})` / `writeCredential` |
| `session-lifecycle` (impl) | build/apply provisioning, project inherited | Provisioning + projection |

No consumer requests a `get*`-by-shape, a per-intent write, or the root-secret
plumbing. Demand is: **two resolve paths, one cipher, two-table CRUD, one
provisioning seam.** Every request lands on a general parameterized interface.

---

## 3. THE COHERENT PRODUCT API (14 methods / 3 types)

| # | Interface | Shape | Lens | From |
|---|---|---|---|---|
| A | **Cipher** | `encryptCredentialValue(plaintext) → string` · `decryptCredentialValue(cipher) → string\|null` | both | internal-logic custody capability; `notifications`+`settings` demand |
| B | **CredentialStore** | `readCredentials(filter?{name}) → ServerCredential[]` · `writeCredential(name, patch:CredentialWrite)` · `deleteCredential(name)` | inside-out | `serverCredentials` CRUD; `notifications`/`settings` reads+writes |
| C | **ConnectionStore** | `listConnections(filter{userId?,authSource?,id?}) → Row[]` · `insertConnection(values)` · `updateConnection(id,patch)` · `deleteConnection({id,userId})` | inside-out | `serviceConnections` CRUD; `settings` listByAuthSource; connection-mgmt UI |
| D | **CredentialResolver** | `DbCredentialResolver.resolve(name) → string\|null` (impl of the `@hyperidle/shared` interface) | outside-in | resolve capability; `model-gateway` |
| E | **ServiceConnectionResolver** | `resolve(userId, connId) → string\|null` | outside-in | sole held-token plaintext path; `filesystems`/`session` |
| F | **Provisioning** | `buildProvisioningPlan(deps) → ProvisioningPlan` · `applyProvisioningPlan(args)` | outside-in | fs/harness adapter capability; `session-lifecycle` |
| G | **projectInheritedConnections** | `(descriptors[]) → ServiceConnectionView[]` | outside-in | inherited-half projection; `session`/web |

**Types (3):** `CredentialWrite` (write patch), `ProvisioningPlan` (inspectable
plan value), `ConnectionsUserReader` (DI port — plumbing). `CredentialResolver`
is a **re-export** from `@hyperidle/shared`, not an owned type.

**Filter/patch generality (proves non-lossy):**
- `readCredentials({validationState})` — a future "failed-validation" view is a
  *filter arg*, not a `listInvalidCredentials` method.
- `listConnections({health})` — "needs-attention" dashboard is a filter arg, not
  `listUnhealthy` + `listByUserId` + `listByAuthSource` growing one-per-query.
- `writeCredential(patch)` — value write, validation write-back, and timestamp
  bump are one upsert parameterized by which columns the caller sets.

---

## 4. TARGET NUMBERS + what gets DELETED

**Target: 14 methods / 3 types** (from 18 / 4). Two genuine deletions — **not**
re-hiding:

1. **`resolveOwningHumanUserId` → FOLD into `buildProvisioningPlan`.** Build
   already needs the owner userId to read held connections; it resolves the owner
   internally via the injected `ConnectionsUserReader`. `session-lifecycle` stops
   importing a standalone owner-resolver. **−1 method.**
2. **`EnvCredentialResolver` → RELOCATE to `packages/eval`.** Lore confirms it is
   **eval-only** ("No production code path instantiates EnvCredentialResolver
   after AH1"). An eval-only strategy fixture does not belong in the production
   vault product; move it to the eval package as a `CredentialResolver` impl.
   **−1 method.**

Legitimately-private (stay internal — genuine implementation of a real
capability, *not* hidden public API): `getServerSecret` / `requireServerSecret` /
`deriveKey` (cipher internals), `SERVICE_CLI_ENV` / `listActiveHeld` /
`ResolvedMcpServer` / per-harness writers (provisioning internals). These are the
cipher's and the plan-builder's guts — correct to be private; nothing to delete.

**Lossy check — every current real feature still deliverable:**
- API-key resolution (`model-gateway`) → `DbCredentialResolver.resolve`. ✓
- Held-token resolution (`filesystems`, `session`) → `ServiceConnectionResolver.resolve`. ✓
- Sibling secret stash (`notifications`, `settings`) → cipher + `writeCredential`/`readCredentials`. ✓
- Connection-by-auth-source (`settings`) → `listConnections({authSource})`. ✓
- Connection-mgmt UI (list/create/update/delete/validate) → ConnectionStore. ✓
- Spawn-time provisioning (owner resolve + build + apply) → Provisioning (owner folded in). ✓
- Inherited-connection display → `projectInheritedConnections`. ✓

Nothing lost. The service was already near floor; the win is honest deletion of
an eval fixture and an owner-resolution leak, plus a substrate-grounded
justification for every surviving method.
