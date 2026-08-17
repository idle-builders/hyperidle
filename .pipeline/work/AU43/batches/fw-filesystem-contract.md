# Delete batch — `fw-filesystem-contract`

11 convicted rows. Delete every one, or record it as a survivor with a reason.

| # | Symbol | Reach | Why it was convicted |
|---|---|---|---|
| 1 | `FilesystemSource` | type · DEAD (zero references outside its own file) | Effectively string; Filesystem.source: string. |
| 2 | `FilesystemInjection` | interface · UI:POST /api/agents/:id/filesystems (core-api/src/routes/filesystems.ts:116, one satisfies) | Byte-identical to FilesystemInjectionRow (@hyperidle/db, all-text columns incl. createdAt). A duplicate of a row type is not a contract. |
| 3 | `FilesystemAuth` | interface · DEAD (never constructed — both resolve() impls return null; never read — mounter passes it through, no adapter touches it; sole mount call passes literal null) | The package's flagship concept is dead wire. Delete the interface, its provision union, and the auth param off mount(). |
| 4 | `FilesystemAuthResolver` | interface · UI:POST /api/filesystems (built per-request in agent-orchestration routes:124, consumed by reachability) | Interface dies; the one live member survives as a plain function field in filesystems' ports.ts. Member breakdown below. |
| 5 | `9a` | FilesystemAuthResolver.canResolve · member · TEST-ONLY (one caller: AO1-reachability-lane-b test:190) | Dead code plus a test assertion that dies with it. |
| 6 | `9b` | FilesystemAuthResolver.sourceOf · member · UI:POST /api/filesystems (routes:210) — but both impls hardcode null | Every call returns null and falls through to sourceHint. A member that cannot return a value is not a member. Delete the call too. |
| 7 | `9c` | FilesystemAuthResolver.resolve · member · DEAD (zero callers; both impls hardcode null) | Existed to produce FilesystemAuth (#8), which is also dead. |
| 8 | `CaptureResult` | interface · INTERNAL (return value ignored by the only external caller, provisioner.ts:642; captured read only inside mounter-registry:326) | captureBack returns Promise<void>; the provenance branch stays internal. |
| 9 | `FilesystemMounter` | interface · BOOTSTRAP (boot.ts:287 DI slot) + session-provisioning consumers | One implementation = indirection. run-orchestration declares its own structural mounter port (its existing pattern); boot passes the concrete RegistryFilesystemMounter. |
| 10 | `SUBSTRATE_STATES` | const · DEAD (zero references outside the package; only derived FilesystemState) | Inline the union in the relocated FilesystemState. |
| 11 | `FILESYSTEM_SOURCES` | const · DEAD (rg zero + graph zero) | Never read anywhere, ever — not even to derive a useful type (FilesystemSource is string anyway). |
