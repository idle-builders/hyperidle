# BA9a — Implementation review (independent, read-only)

Commit `ce68c6a18`, reviewed against `.pipeline/work/BA9a/plan.md` and the Agent Plugins 1.0.0 spec.

## Verdict: DONE on the plan's ten acceptance criteria. No blocking findings.

Gates re-run by the reviewer and again by the orchestrator: `npm run check` PASS (39 packages),
`npm run lint` exit 0 (pre-existing Biome baseline untouched by BA9a files), `npm run knip:production`
exit 0, 38 unit tests, 23 installer integration tests on real PGlite, and the full service integration
lane at 2381 passed.

## Sanity-breaks — the tests are real

Three load-bearing behaviours were deliberately reverted and confirmed red, then the tree restored clean:

1. Forcing the wrong-`$schema` check never to fire (`plugin-manifest.ts:128`) → the AC3 test went red.
2. Making the resolver ignore overrides (`plugin-configuration.ts`) → seven integration tests went red
   across AC5, AC6, AC8 and AC10.
3. Making `namespacedKey` return the bare key (`plugin-installer.ts:107`) → the AC8 collision test went
   red.

## Questions answered

- **Zip traversal:** no containment escape. Info-ZIP strips `../` and absolute specs; a crafted archive
  extracts entirely inside the temp root. Git clone and folder both stay in resolved roots. No permission
  model was invented — correct per ETHOS.
- **`(kind,key)` collision:** keys are namespaced `<pluginId>/<manifestKey>` on every write and read. The
  pre-existing consumer builds its id as `` `${kind}:${key}` `` and splits on the first `:`
  (`agent-behavior-config-impl.ts:155`), so the `/` round-trips intact.
- **Removal vs restrict:** defaults are hard-deleted first (overrides `set null`), then the plugin row is
  marked removed. A detached edit survives as `user_owned` and reconnects on reinstall via `(kind,key)`.
- **`builtin`:** rejected at parse, excluded from listing, and the resolver's origin branch still works.
- **Migration:** `scope_kind NOT NULL DEFAULT 'factory'` plus nullable `scope_team_id` and a matching
  check constraint; the seeded `builtin` row survives, proven against a populated database.
- **The flagged `validateConfigurationValue` field-name rejection** runs only on the user-edit path, not
  on install. Not a BA9a defect; it will block a person *editing* an `mcp_server` contribution in BA9b.

## Carried forward as required work, not notes

Three items are being sent back rather than accepted, because each would leave the package matching its
written criteria while failing its purpose.

**R1 — There is no door.** `installPlugin` and `listInstalledPlugins` have no route and no interface
caller; only tests reach them. Nothing in the running product can install a plugin. This whole track
exists because of machinery built on both ends with the middle missing, and shipping this way would
recreate exactly that. The founder's own description of installing is pasting a git URL into a settings
screen. Knip does not catch it, because the package index counts as an entry point.

**R2 — Scope is stored but does not bite.** `design-notes.md` states it plainly: the resolver does not
filter by scope, so a `team`-scoped plugin's contributions currently apply everywhere. Founder decision
D4 is that the installer chooses one team or the whole backend. A choice that changes nothing is not that
decision. Either it bites here, or the exact point where it starts biting is named and owned.

**R3 — `plugin-containment.ts` has no production caller.** It is pre-positioned for BA9b, so today it is
reachable only from its own tests. By this repo's standard that is dead code. It should land in the
package that uses it.

## Non-blocking, accepted

- Manifest type-checking is permissive where the spec is strict: only `$schema` and `name` are
  type-checked, so `version: 123` is coerced rather than refused. Worth tightening for conformance, but
  it is permissive rather than corrupting.
- Removal leaves a detached edit applying as `user_owned` — defensible, since the surviving row is the
  user's own, but slightly at odds with the literal wording of the AC7 scenario.
- Cosmetic: a stale comment on `removeStaleDefaults`, redundant checks in `isValidPluginName`.
