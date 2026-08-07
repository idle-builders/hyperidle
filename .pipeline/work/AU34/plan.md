# AU34 — Split `shared` into named framework packages, each with a decided audience

## Work package

**Work package.** As a maintainer, I want `framework/shared` broken into several smaller framework packages, each named for what it actually holds and each with its own decided audience — so that "who may reach this" becomes a set of deliberate answers instead of one blanket permission covering 92 modules. `shared` is the only target in the whole governance model whose audience is `everyone`, and that permission was granted to a substrate of types, errors and formatting. It now also covers the harness protocol, the HTTP middleware stack, the credential-encryption primitive, the markdown block toolchain, the content-kind registry and an agent work-intent recorder. When this ships, each of those is its own package with its own `reach` entry and a written reason, and the modules that are genuinely universal are the only ones left with `everyone`.

**Why this matters.** Reach is the one permission the model grants unconditionally, and everything else in the design rests on it being narrow. Every module that lands in `shared` inherits it silently — nobody decides that the harness adapter interface should be reachable from the web UI, or that `agent-work-intent-recorder` should be reachable from anywhere; it is simply true because of where the file sits. The maintainer's cost of not fixing this is that `shared` is the one place where the governance model cannot say no, so it is the path of least resistance for exactly the code that most needs a boundary — and it grows monotonically, because adding to it is never a violation. There is a second, concrete cost already visible: the package's manifest carries `hono`, `remark-parse`, `remark-gfm`, `unified`, `github-slugger` and `@noble/hashes`, so a markdown toolchain, an HTTP framework and a hash library sit in the dependency closure of every package that names `shared` — including the browser bundle.

**Type.** framework.

**What exists today.** 92 source modules, ~13,800 lines, one barrel (`src/index.ts`, 89 export statements) plus five declared subpaths (`/crypto`, `/git`, `/http`, `/net`, `/observability`). Measured against the live tree, following re-exports transitively with zero unresolved symbols: **81 of the 92 modules are reached from outside the package, and only six are reached by eight or more packages** — `event-bus` (15), `events` (15), `types` (13), `model-gateway` (10), `agent-work-intent-recorder` (9), `logger` (8). Everything else is a long tail: 42 loose modules at the package root, most reached by one to three packages. The directories that already have an identity are `harness` (9 modules, 10 consumers), `http` (7 modules, 4 consumers — all server-side), `blocks` (5 modules, 3 consumers, and the sole reason `remark`/`unified` are dependencies), `observability` (3 modules, 1 consumer), `kinds` (2 reached of 8), `crypto` (1 module, 6 consumers), `format`, `git`, `net`, `types`. Eleven modules are reached by nothing outside the package at all: `blocks/slug`, `format/money`, six of the eight `kinds/*` definitions, `observability/events`, `toon-errors`. `governance/architecture.json` gives the whole package one entry — `reach: everyone`, "the shared substrate — the one target every role may name".

**What's genuinely missing.** The package boundaries themselves, and — the substance of this work package — the *audience decision* for each. Splitting the files is mechanical; deciding that the harness protocol is reachable by the layers that run harnesses and not by the web UI is the actual work, and it has never been made because there was no place to record it.

**Depends on.**
- **AU29** — `framework/shared/src/agent-run-admission.ts` and `framework/shared/src/observability/dispatcher.ts` are the two files AU29 takes off the event bus, and taking them off means moving them out of the framework role entirely. Splitting the package around files that are about to leave it would place them twice.

**Complexity.** L

**Engineering tier.** production — every package in the repo depends on this one.

**Pre-build gates.**
- **Refinement:** Required — run `/refine` first. The nouns are the deliverable here. What each new package *is* — and therefore what belongs in it and who may name it — is the whole decision, and a split into packages named after directories that already exist would just rename the problem. `/refine` must produce the package set and the audience for each before anything moves.
- **Design:** Not required — framework, no UI surface.

**Human review gates.** Yes — mandatory for every work package. Load-bearing here: this creates several new framework packages and changes the one permission the entire governance model treats as unconditional.

**Plan calls.** Multi-version exploration on the package set, not one pass. Design it twice: once grouped by *what the code is* (protocol, transport, encoding, formatting) and once by *who reaches it* (universal substrate, server-side only, agent-runtime only, interface only), then reconcile — the two cuts will disagree, and where they disagree is where the interesting decision is. Two things to check against the live tree rather than assume: the eleven unreached modules may be dead rather than internal (run `knip:production` before deciding they belong anywhere), and the browser-bundle claim should be measured, not asserted — `blocks/__tests__/browser-safe.test.ts` suggests someone has already been here. Sequence so that the barrel's 1,149 consumer import sites move mechanically and last, once the package set is settled.

**Contracts / constraints.**
- Every new package gets an entry in `governance/architecture.json` `surfaces` with an explicit audience and a written reason. A package with no decided audience does not ship.
- `everyone` is granted only where the reason survives being written down. Inheriting it because the code used to live in `shared` is not a reason.
- No new barrel beyond each package's own `src/index.ts`.
- The end state is stated as the end state. No re-export shim left behind in `shared` to keep old import paths working, and no deprecation period.
- Nothing that only tests consume survives the split — `knip:production` deletes it.
- No behaviour changes. This is placement; a diff that alters what a function does belongs to a different work package.

**Out of scope.**
- Taking the framework off the event bus — AU29.
- Any table, composition-root or cross-layer boundary work — AU30, AU31.
- Reducing what `shared` exports on the merits (dead-code removal beyond what `knip` already flags during the move).

**Effort.** L (~4d)

## Acceptance criteria

- `framework/shared` no longer exists as a single package; what it held lives in framework packages named for what they contain.
- Every one of those packages has a decided audience recorded with its reason, and the build fails on a package with no audience decided.
- Only the packages whose reason for universal reach survives being written down are reachable by everyone; the rest are reachable only by their stated audience, enforced by the lint.
- No package's dependency closure carries a toolchain it does not use — in particular, naming the substrate no longer pulls in a markdown parser or an HTTP framework.
- No module survives the split that nothing outside its own package reaches.
- `npm run verify` is green and the application behaves identically — proven by running it, not by reading the code.

## Validation scenarios

**Given** the governance lint runs over the live tree, **when** it reports, **then** every framework package resolves to a declared surface with a stated audience, and no package falls back to an undecided one.

**Given** a developer imports the harness protocol from a package outside its stated audience, **when** `npm run lint` runs, **then** the build fails naming the file and the audience it is not in.

**Given** the browser bundle is built, **when** its contents are inspected, **then** the markdown toolchain is absent unless a package that genuinely renders markdown is in the graph.

**Given** a new framework package is added with no `reach` entry, **when** `npm run lint` runs, **then** the build fails naming the package.
