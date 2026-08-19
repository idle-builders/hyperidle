# filesystem-contract — destroyer verdict (framework)

## Where does this package go?
**Verdict: DISSOLVE → `@hyperidle/filesystems` (layers/agent-orchestration/filesystems)**

This is the textbook case the framework brief warns about: 160 lines, zero functions, zero classes,
12 types + 4 consts. A contract package whose two "seam" interfaces each have effectively **one or
zero real implementations**:

- `FilesystemMounter` — exactly one production implementation (`RegistryFilesystemMounter`,
  `layers/agent-orchestration/filesystem-mounting/src/mounter-registry.ts:290`). One implementation
  is indirection, not abstraction.
- `FilesystemAuthResolver` — two "implementations", both inline objects in ONE file
  (`layers/agent-orchestration/src/routes/filesystems.ts:124-149`), and both hardcode
  `resolve: () => null` and `sourceOf: () => null`. Half the interface is a ritual that returns null
  by construction. Only `resolveToken` does anything.
- `FilesystemAuth` — **never constructed in production** (both `resolve()` impls return literal
  null) and **never read** (the mounter passes `auth` through at mounter-registry.ts:302 and no
  adapter touches it; the only production `mount()` call hardcodes `auth: null` at
  `run-orchestration/src/filesystem-provisioning.ts:103`). The entire auth seam — the reason this
  package claims to exist as a "contract" — is dead wire.

The only genuinely shared thing in the package is the `Filesystem` wire type (4 production
consumers). Its owner is obvious: the `filesystems` service, which owns the registry, the tables,
the reachability lifecycle, and already has the `ports.ts` structural-port pattern the survivors
slot into. Everything else inlines into its single reader or dies.

Note: sibling destroyers are auditing `filesystems` and `filesystem-mounting` and one may recommend
merging them. This verdict stands either way — the target is the service that owns the Filesystem
noun; if they merge, that merged service is the target.

## Consumers (measured, not assumed)

`rg -a -l "@hyperidle/filesystem-contract" layers framework applications tools` — 9 production
files (rest are tests/package.json/comment-only mentions):

| Consumer | What it imports | Could it own this? |
|---|---|---|
| `layers/agent-orchestration/src/routes/filesystems.ts` | `Filesystem`, `FilesystemAuthResolver` (types); `FILESYSTEM_KINDS`, `WRITEBACK_MODES` (Zod enums) | Yes — it is the ONLY reader of both consts, and it defines both resolver impls |
| `layers/core-api/src/routes/filesystems.ts` | `FilesystemInjection` (one `satisfies`) | Doesn't need it — `FilesystemInjectionRow` from `@hyperidle/db` is the identical shape |
| `layers/agent-orchestration/filesystems/src/filesystem-reachability.ts` | `FilesystemAuthResolver`, `FilesystemState` (types) | Yes — only uses `resolveToken`; its own `ports.ts` is the house home for both |
| `layers/agent-orchestration/run-orchestration/src/filesystem-provisioning.ts` | `Filesystem`, `FilesystemMounter` (types) | Already declares structural mirrors locally (house pattern, see its own header comment) |
| `layers/agent-orchestration/run-orchestration/src/provisioner.ts` | `Filesystem`, `FilesystemMounter` (types) | Same — structural port |
| `layers/agent-orchestration/filesystem-mounting/src/mounter-registry.ts` | `Filesystem`, `FilesystemAuth`, `FilesystemMounter`, `MountResult`, `CaptureResult` | Yes — it is the sole implementor; all but `Filesystem` become its local types |
| `layers/agent-orchestration/src/boot.ts` | `FilesystemMounter` (type, composition root) | Uses the concrete `RegistryFilesystemMounter` on the next line — type import is redundant |
| `framework/db/src/schema.ts` | comment mention only (line 1254) | n/a |
| `layers/core-ui/src/settings/SettingsFilesystems.tsx` | comment mention only (line 19) — the UI already hand-mirrors the wire shape | n/a — proof the type never needed to be shared with the UI |

Zero consumers in `applications/` or `tools/`. The `.stories.tsx` files redefine `FilesystemKind`/
`WriteBack` locally rather than import them — even the stories didn't want this package.

## If written today, from scratch

One declaration, living in the owning service:

- `Filesystem` (wire/domain type) → `@hyperidle/filesystems`, with `kind: string`,
  `source: string` (the `(typeof X)[number] | (string & {})` dance is just `string`), and
  `resourceRef` inlined as the discriminated union.
- `FILESYSTEM_KINDS` / `WRITEBACK_MODES` → inline literals in the create route's Zod enums — their
  only reader.
- The reachability token hook → `resolveToken: (connectionId: string) => Promise<string | null>` as
  a plain function field in `filesystems/src/ports.ts`, next to `FilesystemsServiceConnectionResolver`
  which already lives there for exactly this reason.
- The mounter port → run-orchestration declares the two-method structural shape it needs (exactly
  as it already does for `InjectedFilesystemsReaderPort`); `RegistryFilesystemMounter` satisfies it
  structurally. No shared interface.

The package `framework/filesystem-contract` is deleted.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 8 |
| MERGE | 7 |
| SIMPLIFY | 1 |
| KEEP | 0 |

Surface: 16 exports → 1 surviving shared declaration (`Filesystem`, relocated into
`@hyperidle/filesystems`) + inline remnants (94% cut of the shared surface; the package dies).

## Feature-level kills

**The Connection-auth mount seam (`FilesystemAuth` + `FilesystemAuthResolver.resolve/canResolve/sourceOf`).**
Designed in AO1 for AN to fill in; AN filled in a different, simpler path instead (`resolveToken` →
raw token → `GIT_CONFIG` injection, per the AO1 v2 lore in the file itself). The provision-mode
union (`git-credential` / `env` / `none`) has zero producers and zero readers. What breaks: nothing
— production behavior is already "mount runs with `auth: null`, always." This deletion turns a
pretend capability into an honest absence. When authenticated mounts are actually needed, the
proven `resolveToken` path extends to the mounter as a token string — no mode union required.

**The mount result ceremony (`MountResult.sandboxPath`, `CaptureResult`).** `mount()`'s caller reads
`success` and `error` only; `sandboxPath` on the result is write-only. `captureBack()`'s only
external caller (`provisioner.ts:642`) ignores the return value entirely; `captured` is read once,
inside the implementor itself, for the provenance insert. What breaks: nothing.

## Full export audit

Reach evidence: `rg -a` over `layers framework applications tools`; graph cross-check where the
symbol is a value (`trace-uses FILESYSTEM_SOURCES` → "nothing references"). The graph is type-blind,
so type rows rest on the rg sweep.

| # | Export | Kind | Reach | Verdict | Reason |
|---|---|---|---|---|---|
| 1 | `FilesystemKind` | type | INTERNAL (no external importer; stories redefine their own copy) | MERGE | `(string & {})` open vocab = `string`; fold into `Filesystem.kind: string`. |
| 2 | `WriteBack` | type | INTERNAL (no external prod importer) | MERGE | Inline the 3-literal union on `Filesystem.writeback`. |
| 3 | `FilesystemState` | type | UI:GET /api/filesystems/:id via `resolveFilesystemState` (filesystems/filesystem-reachability.ts:4) | MERGE | One prod importer, the filesystems service — declare it there, next to the function that returns it. |
| 4 | `FilesystemSource` | type | DEAD (zero references outside its own file) | DELETE | Effectively `string`; `Filesystem.source: string`. |
| 5 | `ResourceRef` | type | INTERNAL (only ref outside the package is a schema.ts comment) | MERGE | Inline the union into the `Filesystem` declaration — nobody names it independently. |
| 6 | `Filesystem` | interface | UI:GET/POST /api/filesystems (routes serialize) + SCHED/session-provisioning (run-orchestration builds, filesystem-mounting reads) | SIMPLIFY | The one real shared type. Moves to `@hyperidle/filesystems`; `kind`/`source` degrade to `string`, `resourceRef` inlines. |
| 7 | `FilesystemInjection` | interface | UI:POST /api/agents/:id/filesystems (core-api/src/routes/filesystems.ts:116, one `satisfies`) | DELETE | Byte-identical to `FilesystemInjectionRow` (`@hyperidle/db`, all-text columns incl. `createdAt`). A duplicate of a row type is not a contract. |
| 8 | `FilesystemAuth` | interface | DEAD (never constructed — both `resolve()` impls return null; never read — mounter passes it through, no adapter touches it; sole mount call passes literal `null`) | DELETE | The package's flagship concept is dead wire. Delete the interface, its provision union, and the `auth` param off `mount()`. |
| 9 | `FilesystemAuthResolver` | interface | UI:POST /api/filesystems (built per-request in agent-orchestration routes:124, consumed by reachability) | DELETE | Interface dies; the one live member survives as a plain function field in filesystems' `ports.ts`. Member breakdown below. |
| 9a | `FilesystemAuthResolver.canResolve` | member | TEST-ONLY (one caller: AO1-reachability-lane-b test:190) | DELETE | Dead code plus a test assertion that dies with it. |
| 9b | `FilesystemAuthResolver.sourceOf` | member | UI:POST /api/filesystems (routes:210) — but both impls hardcode `null` | DELETE | Every call returns null and falls through to `sourceHint`. A member that cannot return a value is not a member. Delete the call too. |
| 9c | `FilesystemAuthResolver.resolve` | member | DEAD (zero callers; both impls hardcode `null`) | DELETE | Existed to produce `FilesystemAuth` (#8), which is also dead. |
| 9d | `FilesystemAuthResolver.resolveToken` | member | UI:GET /api/filesystems/:id + POST register (reachability probe, filesystem-reachability.ts:101) | MERGE | The only live member. Becomes `resolveToken: (connectionId) => Promise<string \| null>` in `filesystems/src/ports.ts`. |
| 10 | `MountResult` | interface | INTERNAL to the mount call (implementor names it; caller reads `success`/`error` structurally) | MERGE | Local type in filesystem-mounting, shrunk to `{ success, error? }` — `sandboxPath` is write-only. |
| 11 | `CaptureResult` | interface | INTERNAL (return value ignored by the only external caller, provisioner.ts:642; `captured` read only inside mounter-registry:326) | DELETE | `captureBack` returns `Promise<void>`; the provenance branch stays internal. |
| 12 | `FilesystemMounter` | interface | BOOTSTRAP (boot.ts:287 DI slot) + session-provisioning consumers | DELETE | One implementation = indirection. run-orchestration declares its own structural mounter port (its existing pattern); boot passes the concrete `RegistryFilesystemMounter`. |
| 13 | `FILESYSTEM_KINDS` | const | UI:POST /api/filesystems (Zod enum, agent-orchestration routes:31 — sole prod reader) | MERGE | Two literals, one reader. Inline into the route's Zod enum. |
| 14 | `WRITEBACK_MODES` | const | UI:POST /api/filesystems (Zod enum — sole prod reader; SetupFlow/stories mentions are comments/local copies) | MERGE | Three literals, one reader. Inline into the route's Zod enum. |
| 15 | `SUBSTRATE_STATES` | const | DEAD (zero references outside the package; only derived `FilesystemState`) | DELETE | Inline the union in the relocated `FilesystemState`. |
| 16 | `FILESYSTEM_SOURCES` | const | DEAD (rg zero + graph zero) | DELETE | Never read anywhere, ever — not even to derive a useful type (`FilesystemSource` is `string` anyway). |

## Types / DI ports

Covered above — the package IS its type/port surface (rows 1-12).

## Holes this leaves

1. **Authenticated mounts stay impossible — but they already are.** Deleting `FilesystemAuth` and
   `mount()`'s `auth` param codifies today's behavior (`auth: null` hardcoded at the only call
   site). Mounting a private repo cannot authenticate now and cannot after. When someone actually
   needs it, extend the mounter with a raw token (the `resolveToken`/`GIT_CONFIG` path reachability
   already proved) — do not resurrect the provision-mode union.
2. **`Filesystem` needs a home reachable by filesystem-mounting.** Either filesystem-mounting
   imports the type from `@hyperidle/filesystems` (new service→service type edge — governance must
   allow it) or it declares a structural mirror like run-orchestration does. If the sibling
   destroyers merge the two services, the question evaporates.
3. **AO1 tests break.** `AO1-filesystem-reachability.test.ts`, `AO1-reachability-lane-b.integration.test.ts`,
   and `AO1-filesystems.integration.test.ts` import the interface/consts and mock `canResolve`/
   `resolve` — they must shrink to the `resolveToken`-only port. The `canResolve` assertion at
   lane-b:190 dies with the member, correctly: it tests a ritual.
4. **`(string & {})` forward-compat vanishes into plain `string`.** No functional loss — writes are
   gated by the Zod enum, reads were always effectively open.
5. **`docs/process-layer/canonical-shapes.md` and the AO1 lore comments** reference the contract
   package as the wire types' home; they need a pointer update to `@hyperidle/filesystems`.
