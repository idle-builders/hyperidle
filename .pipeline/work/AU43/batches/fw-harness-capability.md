# Delete batch — `fw-harness-capability`

4 convicted rows. Delete every one, or record it as a survivor with a reason.

| # | Symbol | Reach | Why it was convicted |
|---|---|---|---|
| 1 | `HarnessOptionControlKind` | type · DEAD | Zero references anywhere, including inside its own package — HarnessModelOptionControl's kind discriminant respells the literals. A3 does not resurrect it: the surviving control union carries its own vocabulary. |
| 2 | `HarnessAccessMode` | type · DEAD (written, never read) | Every descriptor construction stamps it; .accessMode read by zero production files. Premise-free — dead at any user count. Delete type + descriptor field + HarnessCapabilities.accessMode + construction sites. |
| 3 | `HarnessRuntimeCapabilities` | interface · display-only badges; zero runtime branches on the descriptor copy | Feature #2. Crossed-wire badge mapping shipped unnoticed — proof the display carries no value. Ruling 1 re-check: wrong flags shown to a whole team are still wrong flags; DELETE stands. |
| 4 | `HARNESS_OPTION_CONTROL_KINDS` | const · TEST-ONLY (own package's descriptor test) | Only reference outside its declaration is its own test asserting the literal back at itself; part.ts redeclared a private copy rather than import it. A3 does not need it: option-value validation is per-descriptor against the specific control, never against a kind list. |
