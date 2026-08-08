# The other shrinking record — a decision for the founder

**One question:** Ruling E deletes `governance/baseline.json` and everything that keeps books with it.
`governance/misplaced-files.json` is a second shrink-only record with a committed count. Does Ruling E's
principle reach it, and if so, does that belong in this work package?

Ruling E names the baseline, not this. So the planner is not deciding it. Below are the facts, then a
recommendation.

---

## What it records

Four files that the classifier calls **production** but which are really development, and which cannot
move yet. Each entry is a path and a prose reason:

| file | why it is stuck |
|---|---|
| `layers/agent-execution/harness-registry/src/llm-client.ts` | production, and correctly placed — but `callLlm` reads `LLM_CASSETTE_MODE`, an environment variable only the end-to-end cassette lane sets. Development knowledge inside a production file. |
| `layers/core-ui/src/fixtures/knowledge-data.ts` | mock knowledge items imported by the shipping `KnowledgeDetail` page as its empty-API fallback. Moving it into a `__` folder would make a production page import a development file, which the crossing rule forbids outright. The fix is the API. |
| `layers/core-ui/src/pages/_dev/ArtifactDemo.tsx` | a development-only preview page in a production path. `_dev` is one underscore, so the folder clause (`__`) does not claim it, and renaming the folder would make `router.tsx` import a development file. |
| `layers/core-ui/src/router.tsx` | production, and correctly so — but it registers `/_dev/artifacts` behind `import.meta.env.DEV`, and that registration is the only thing keeping the preview page reachable. Two e2e specs navigate to it. |

Plus one number: `"resolvedFiles": 4`.

Each of those four rows states an **architectural fact** — this file is on the wrong side of the
production/development line — and the classifier cannot derive any of them. Whether a production-path file
is "really development" is a human judgement. That is why there is no generator and, as the rule's own
lore says, there cannot be one.

## Can its rule emit a bookkeeping-only failure?

**Yes. `scripts/rules/misplacement-ledger.ts:94-98`:**

> `4 entr(y/ies) resolve to a tracked file, and governance/misplaced-files.json still commits to 5. A
> misplacement was cleared without committing the shrink — lower resolvedFiles to 4.`

Fix a misplaced file and the build goes red until a number is lowered. That is the same failure Ruling E
removed from the baseline, in a second place, and it names no architectural fact — only a disagreement
with a stored count.

The rule's other errors are different in kind and are worth keeping. Three name real facts: an entry
pointing at a file that no longer exists; an entry the classifier now calls development (it moved); an
entry whose reason is too short to be a reason. A fourth, `:88-93`, fires when the live count is **above**
the committed one — that one at least coincides with a real fact (a new misplaced file appeared), though
its message is about the number rather than the file.

## What is lost by deleting the file outright

The four warnings. They are printed every run, and they are the only record that those four files are
misclassified. Delete the file and the four read as ordinary production code forever — which is exactly
the failure the record was created to prevent, and it is not recoverable by any check, because nothing can
derive the judgement.

Deleting it would also make `router.tsx`'s and `llm-client.ts`'s situation invisible to the next agent who
touches them, and both are live production files.

## Recommendation — keep the record, delete the count

Ruling E's principle is that a guard failure must name an architectural fact and nothing keeps books. That
cuts precisely between the two halves of this file:

- the **four rows** are architectural facts, stated in prose, that nothing else can state → **keep**;
- `resolvedFiles` and the two branches that compare against it are books → **delete**.

After the change: every entry still warns on every run; the three fact-naming errors stay (with the
"lower `resolvedFiles`" instruction removed from their messages); the rule can never fail the build on a
number; fixing a file means deleting its row and nothing goes red; adding a row is a one-line diff that
review is expected to challenge — which the rule's own lore already admits is all the count ever bought,
since nothing derives this file.

This is a smaller change than deleting the record and it keeps the only information the record carries.

## Should it be in this work package?

**Recommended: yes**, with one caveat you should weigh.

For folding it in:

- It is the same principle, applied once instead of twice. Shipping a lint where one record keeps books and
  another does not is the half-removal Ruling E's closure warns about, and the next reader cannot tell
  which half is intended.
- The work is small and entirely inside the files this package is already opening: drop `resolvedFiles` and
  the two count branches (~15 lines in one rule), trim two count assertions from the existing
  `misplacement-ledger-ratchet` break-test, and edit `governance/README.md` — which has to be rewritten in
  this package anyway, because both of its paragraphs about this file describe it as "the same shape as
  `baseline.json`", a file that will not exist.
- The three `@lore` blocks in `scripts/rules/misplacement-ledger.ts` and one in
  `scripts/lib/governance-registry.ts` explain this record by reference to the baseline. They must be
  rewritten in this package regardless of what you decide, so the file is being touched either way.

The caveat: it needs one sentence of **`CLAUDE.md`** edited — the production/development section tells
agents this record's "count only shrinks". `CLAUDE.md` is outside the `scripts/` + `governance/` bounds
these rulings authorize, and it is a file agents read before acting, so it is your call rather than the
planner's.

Against folding it in: it keeps this package's diff to exactly the crossing-severity path, and the ledger
is genuinely a separate mechanism with a separate subject. If you prefer that, the honest cost is one
release in which the lint's two records disagree about whether counting is allowed — plus a note in
`governance/README.md` saying so, so nobody reads the survivor as endorsed.

## What is being asked

1. **Delete `resolvedFiles` and the two count branches, keep the four rows?** (recommended) — or keep the
   count, or delete the whole record.
2. **In this work package, or its own?** (recommended: this one, and it becomes task T13 in
   `architecture.md`.)

Nothing in the current task list touches this file. Until you rule, the only change to it is rewriting the
`@lore` that describes a deleted mechanism.
