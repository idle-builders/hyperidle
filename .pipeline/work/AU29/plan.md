# AU29 — The framework stops acting: `db` exports only the database, `shared` stays off the bus

## Work package

**Work package.** As a maintainer, I want `framework/db` and `framework/shared` to be pure substrate again — `db` exporting nothing but database access, `shared` publishing nothing on the event bus — so that the two packages every other package is allowed to name unconditionally stop being places where behaviour hides. Today `db` re-exports three functions that touch no database at all, three system-prompt template readers, and a `seed` symbol that belongs to no surface; and it writes rows into five tables owned by services, from a bootstrap routine that structurally cannot go through those owners because a framework package may not import a layer. `shared` both provides the event bus and publishes on it. When this ships, every export of `framework/db` resolves to a named database surface, first-boot state is composed by whatever boots the system rather than by the database package, and the framework is a pipe nobody upstream can hear.

**Why this matters.** `framework/db` and `framework/shared` are the two targets with `reach: everyone` — every layer, service, application and tool may name them without a second thought. That permission is only safe while they hold substrate. Each non-database export smuggled into `db` inherits that universal reach and becomes an unowned back-channel: `resolveAgentScaffoldSpecs` is agent configuration reachable from anywhere, and `readSystemPromptTemplateForRole` is prompt content reachable from anywhere, neither by anyone's decision. The maintainer's cost of *not* fixing this is that the one rule the whole model rests on — "the shared substrate is the one target every role may name" — is quietly false, and every future reviewer who trusts it is wrong. This is also the prerequisite AU30 needs: `factory-bootstrap`'s writes into `users` and `knowledgeItems` cannot be routed through their owning services while the code lives in `framework/`.

**Type.** framework / infra. No UI surface.

**What exists today.** `governance/architecture.json` names thirteen modules of `framework/db/src` and maps each to a surface (`db:client`, `db:bootstrap`, `db:util`); anything unmapped falls to `db:unknown` and is reported by name. The `db:util` entry is already marked `ANOMALY, pending follow-up W1` and carries its own reason: `escapeLikePattern` (`like-escape.ts`), `resolveAgentScaffoldSpecs` (`agent-scaffold.ts`) and `resolveProfile` (`profiles.ts`) contain no SQL, no schema reference and no connection — the surface exists only because the exports do. Four symbols currently fall to `db:unknown`: three from `system-prompt-templates.ts` (a module the registry deliberately does not name) and `seed` (absent from the package's re-export list). `framework/db/src/factory-bootstrap.ts` writes `users` (3 sites), `knowledgeItems`, `knowledgeAppProjection` and two unowned tables, and reads two more — it is mapped to `db:bootstrap`, whose stated audience is composition roots, so the routine is already documented as belonging outside the database package. `framework/shared/src/agent-run-admission.ts:65` emits `agent_run_admission_failed` and `framework/shared/src/observability/dispatcher.ts:473` subscribes to `*`. `governance/baseline.json` holds every one of these as a known violation tagged `W1` or `W5-W6`, and `npm run governance:baseline` regenerates the file.

**What's genuinely missing.** Nothing here is undiscovered — the gap is that the three misplaced utilities have no agreed destination, `system-prompt-templates.ts` has never been given a surface or a home, and first-boot composition has never been separated from the database package that happens to host it. The event-bus rows need the observability dispatcher and the admission emitter to live somewhere that is allowed to speak.

**Depends on.** None. Every input is already committed on `pipeline/AU28`.

**Complexity.** M

**Engineering tier.** production — matches AU28's tier; this is foundational substrate in a shipped system.

**Pre-build gates.**
- **Refinement:** Required — run `/refine` first. Three destinations are genuinely unsettled and each is a real decision, not a mechanical move: where the three non-database utilities go, whether `system-prompt-templates.ts` becomes a named `db` surface or leaves the package, and which composition root owns first-boot state. `/refine` must settle those nouns before architecture.
- **Design:** Not required — framework/infra, no UI surface.

**Human review gates.** Yes — mandatory for every work package. Load-bearing here: this changes what the two universally-reachable packages are allowed to contain, which is the assumption the rest of the governance model rests on.

**Plan calls.** Standard architecture pass. One thing to design deliberately rather than assume: moving `factory-bootstrap` to a composition root changes who runs first-boot and when, and the desktop and remote-server applications both boot today through the same path — plan the relocation against both, not one. Confirm against the live tree that `db:testing` and the `db:bootstrap` fixtures are not carrying the same problem before declaring the surface list clean.

**Contracts / constraints.**
- The end state is stated as the end state, never as a migration (Ruling 12). No transitional re-export, no deprecation alias, no "temporary" surface entry.
- No production export may be added that only tests consume — `knip:production` deletes it as dead code.
- The `db:util` surface entry is deleted from `governance/architecture.json`, not emptied or relaxed.
- Every baseline entry this work package clears is deleted from `governance/baseline.json`; none is re-keyed, re-tagged or moved to another group.
- `npm run governance:baseline` is the only way the baseline file is written.

**Out of scope.**
- Splitting `framework/shared` as a whole (568 exports, the markdown toolchain in every layer's closure) — that is its own work package; this one touches only the two bus sites and whatever moving them requires.
- Assigning owners to the unowned tables, and routing service-owned table writes through their owners — AU30.
- The 12 development-world writes in `framework/db`'s own test files — AU32.

**Effort.** M (~1d)

## Acceptance criteria

- Every export of `framework/db` resolves to a named database surface; the governance lint reports zero symbols falling to `db:unknown`.
- No package outside `framework/db` can reach a function that performs no database access through the database package.
- First-boot database state is established by a composition root, and the database package writes no table owned by a service.
- The framework neither publishes to nor subscribes to the event bus.
- Every `framework → *` and `* → db:util` / `* → db:unknown` production entry is gone from `governance/baseline.json`, and the rules covering them fail the build on reappearance.
- `npm run verify` is green, and first boot on a clean database produces the same state it produces today — verified by running it, not by reading the code.

## Validation scenarios

**Given** a clean checkout and an empty database, **when** the application boots for the first time, **then** the resulting rows in `users`, `knowledgeItems` and `knowledgeAppProjection` are identical to those produced by `origin/main`'s first boot, and no write originated in `framework/db`.

**Given** the governance lint runs over the live tree, **when** it reports, **then** the `db:unknown` symbol list is empty and no production violation remains in any `db:util`, `db:unknown`, `framework → db:table` or `framework → EventBus` group.

**Given** a developer adds a new export to `framework/db` that performs no database access, **when** `npm run lint` runs, **then** the build fails naming that symbol.

**Given** a developer adds an `eventBus.emit(...)` call inside `framework/shared`, **when** `npm run lint` runs, **then** the build fails naming the file and event type.
