# @hyperidle/strategy-minimal

The reference Strategy — the template you copy. All three responsibilities inert.

## What it is

`minimalStrategy` is a real, documented implementation of the `Strategy<HyperIdleDb>` interface from `@hyperidle/shared`. It ships as a standalone package so contributors have a concrete starting point that is:

- **Copy-paste ready** — one file (`src/minimal-strategy.ts`), self-contained, no runtime dependencies beyond `@hyperidle/shared` and `@hyperidle/db`.
- **Inert by design** — zero context assembly, zero knowledge ingestion, zero background work. A session runs to completion under it with no Fabric involvement.
- **Test-harness for the Kernel** — used in AK2 integration tests to exercise the Kernel independently of the Fabric, proving the Kernel is decoupled (AC1).

## What "inert" means

All three Strategy responsibilities are no-ops:

| Responsibility | Minimal behaviour |
|---|---|
| `assembleContext` | Creates empty `context/`, `knowledge/`, `work/`, `.fabric/` scaffold dirs + writes an empty-items `manifest.json`. Returns `{ itemCount: 0, durationMs: 0 }`. No knowledge injection. |
| `beginLearningIngestion` | Returns a no-op `IngestionHandle`. `dispose()` does nothing and never throws. No file watching, no writeback, no DB writes. |
| Background knowledge work | Absent. No bootstrap, no routines, no spawned agents. |

The scaffold dirs and empty manifest are written even though no context is assembled — they keep the harness and crash post-mortems from seeing a missing directory or missing manifest file.

## How to register it

In the composition root (e.g. `packages/server/src/server-factory.ts`):

```ts
import { minimalStrategy } from "@hyperidle/strategy-minimal";
import { setActiveStrategy } from "./services/strategy-registry.js";

setActiveStrategy(minimalStrategy);
```

In tests, pair it with `clearActiveStrategy()` in `afterEach`:

```ts
import { minimalStrategy } from "@hyperidle/strategy-minimal";
import { setActiveStrategy, clearActiveStrategy } from "../services/strategy-registry.js";

beforeEach(() => { setActiveStrategy(minimalStrategy); });
afterEach(() => { clearActiveStrategy(); });
```

## How to implement a new Strategy

1. Copy `src/minimal-strategy.ts` into your new package (e.g. `packages/strategy-myimpl/src/my-strategy.ts`).
2. Fill in `assembleContext` — read from DB, write context files into `req.sandboxPath`.
3. Fill in `beginLearningIngestion` — start a watcher, return a handle whose `dispose()` flushes and persists captures.
4. Register at boot: `setActiveStrategy(myStrategy)`.

The `Strategy<HyperIdleDb>` interface (defined in `@hyperidle/shared`) is the full contract — two methods, fully doc-commented with error semantics.

## Why this package exists

The Kernel (`@hyperidle/server`) must not import any concrete Strategy. The production default is `fabricStrategy` from `@hyperidle/fabric`. The minimal Strategy gives contributors and CI a way to exercise the Kernel without Fabric dependencies, and gives the AK2 test suite a stable, dependency-free implementation to assert against.

See `docs/architecture/kernel-strategy-split.md` for the port design and `packages/shared/src/strategy-port.ts` for the full interface definition.
