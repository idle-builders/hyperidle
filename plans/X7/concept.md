# X7 Concept: Eval Framework

## Status: No concept-locking needed

"Eval" is developer infrastructure, not a domain primitive. It does not appear in the HyperIdle data model, is not surfaced to end users, and does not participate in the three-layer architecture (Human Interface / Meta Layer / Agent Runtime) as a first-class entity.

The load-bearing nouns in X7 are:

- **EvalScenario** -- a developer-authored test specification. Not a process primitive. Not stored in the DB. A TypeScript interface that scenario files implement.
- **ScoringRubric** -- a structured list of dimensions to evaluate. Configuration data, not a domain concept.
- **EvalReport** -- a JSON file on disk. Not a DB entity. Not a knowledge item.
- **Seeding helpers** -- utility functions that compose existing DB primitives (teams, users, bets, tasks, threads, knowledge items). They create instances of existing concepts; they do not introduce new ones.

None of these nouns collide with existing HyperIdle vocabulary. None need identity, lifecycle, or authority models. None cross layer boundaries in novel ways.

The eval framework consumes the real provisioning pipeline (`provisionSession`), the real harness (`BuiltinHarnessAdapter`), the real tool registry, the real prompt composition, and the real knowledge materialization. It is a consumer of the domain model, not an extension of it.

**Decision:** Proceed directly to architecture. No concept probing required.
