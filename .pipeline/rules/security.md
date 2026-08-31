# Security

Read by `/architecture`, `/architecture-critique`, `/write-code`, `/review`. Slot: `security`.

Security here is **earned, never preemptive** (`ETHOS.md` §2). The default is that the agent acts and
the human acts. That inverts most of what a security-minded reviewer brings by habit, so the
inversions are written out.

## Do not propose, do not build

- No gate added because an action *might* be dangerous. **"Irreversible" is not, by itself, a reason to
  gate.**
- No trust-tier policy engine, no reversible/irreversible classifier, no containment scheme, no
  credential-withholding design. Agents hold their own credentials and run their own tools; a tool that
  cannot authenticate is useless.
- No defense against a hypothetical rogue agent. No approval chain, audit trail or permission matrix
  built for its own sake — those are enterprise features and this product has no enterprise customers.
- A finding whose only evidence is "an attacker could" is not a finding. Ask what actually burned
  someone. If the answer is nothing, the finding is noise and adding the control makes the product
  worse.

## What earns a control

A real learning: a specific call that burned someone, a pattern observed going wrong, a signal the
community surfaced. When review genuinely applies — because a human chose it here, or a learning
earned it — it rides the existing review→act loop as a collaboration checkpoint that fades as trust
widens, not a new policy engine.

`.pipeline/audits/security/ledger.json` is where those learnings are recorded. It is empty today: no
surface has ever been audited, so there is no earned control to cite. Do not invent one, and do not
read the empty ledger as "nothing to find" either — it means the pass has not been run.

## The controls that do exist

- **Artifacts are isolated, not sanitized.** Artifact content renders in an iframe with
  `sandbox="allow-scripts"` and no `allow-same-origin`
  (`layers/core-ui/src/ds/artifact-frame/build-srcdoc.ts`). Do not add an HTML scrubber. Isolation
  alone does not stop exfiltration; that is a known, accepted limit, not a bug to patch with a filter.
- **Secrets stay out of the repo and out of commands.** Never inline an API key into a script, a
  config or a verify invocation — provision `.env` by copying `.env.example`.
- **Nothing logs through `console`** in production code; biome's `noConsole` is an error and the
  observability adapter is the one path out.
