# query-escaping — destroyer verdict (framework)

## Where does this package go?
**Verdict: DISSOLVE → inline**

An entire npm package (package.json, tsconfig, index barrel, src file, test file) for ONE line of
production code: `s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")` — collapsible
to a single regex `s.replace(/[\\%_]/g, "\\$&")`.

The founder's question — load-bearing against SQL injection, or a line of code in its caller — has a
clear answer: **it is not injection protection at all.** Every call site feeds the escaped string
into a Drizzle-bound parameter (e.g. `knowledge-repository.ts:986` builds
`` `%${escapeLikePattern(query)}%` `` and passes it through Drizzle operators/`sql` bindings).
Drizzle parameterises the value; injection was never possible through this path. What the function
actually guards is LIKE **wildcard semantics** — the real I2 V4 bug where a search for `_` or `%`
matched every row. That is a correctness behavior worth keeping. It is one line. One line does not
get a package.

AU29 moved it out of `framework/db` with the argument "pure string substrate, so it gets a framework
package of its own." Wrong conclusion: pure one-line string substrate gets inlined, not packaged.

## Consumers (measured, not assumed)
| Consumer | What it imports | Could it own this? |
|---|---|---|
| `layers/core-api/src/routes/users.ts` | `escapeLikePattern` | Yes — one line |
| `layers/core-api/src/routes/threads.ts` | `escapeLikePattern` | Yes — one line |
| `layers/core-api/src/routes/search.ts` | `escapeLikePattern` | Yes — one line |
| `layers/core-api/knowledge/src/knowledge-repository.ts` | `escapeLikePattern` | Yes — one line |
| `layers/core-api/users/src/user-store.ts` | `escapeLikePattern` | Yes — one line |
| `layers/core-api/work/src/work-service.ts` | `escapeLikePattern` | Yes — one line |

Six consumers, one symbol, all inside the core-api layer. This is not a shared abstraction — it is
one line of code that was homeless and got a house instead of moving in with its callers.

## If written today, from scratch
No package. Each search-building call site escapes its own pattern with the one-liner (or the
three routes share a local helper inside core-api root). The `ESCAPE '\\'` pairing note lives as a
comment at each LIKE clause — which is where the obligation sits anyway; a comment in a distant
framework package never enforced it.

## Kill summary
| Verdict | Count |
|---|---|
| DELETE | 0 |
| MERGE | 0 |
| SIMPLIFY | 1 |
| KEEP | 0 |
Surface: 1 export → 0 exports (100% package cut; behavior survives as an inline line)

## Feature-level kills
None — no feature dies. The package dies; the behavior (wildcard-literal search) survives at the
call sites. Its unit test dies with it; wildcard-literalness is assertable in the search tests of
each owning service if anyone cares to keep the I2 V4 regression pinned.

## Full export audit
| # | Export | Kind | Reach | Verdict | Reason |
|---|---|---|---|---|---|
| 1 | `escapeLikePattern` | function | INTERNAL to callers (reached via UI search/list routes: `/api/search`, threads, users, work, knowledge) | SIMPLIFY | One-line pure function; not injection defense (Drizzle parameterises), only wildcard correctness. Inline `s.replace(/[\\%_]/g, "\\$&")` at all 6 call sites; delete the package. |

## Holes this leaves
- Six copies of one regex can drift. Priced: the regex has three characters of domain knowledge and
  has changed once since inception (a comment fix). If drift ever bites, the fix is a failing search
  test, not a package.
- The central doc-comment explaining the `ESCAPE '\\'` contract loses its single home. Postgres
  defaults the escape char to `\`, so today's call sites already rely on default behavior; the
  comment moves to the call sites that need it.
