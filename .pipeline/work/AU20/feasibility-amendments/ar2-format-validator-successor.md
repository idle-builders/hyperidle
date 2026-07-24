# AU20 feasibility amendment — AR2 format validator successor state

At clean HEAD `d1d4fc799a098fef6f4634301ff28021abb86164`, formatted AR2,
Cursor lifecycle state validator, and structural probe are green. The format validator
exits 2 first on the provisional lifecycle architecture hash; its later green scope
also still requires the historical AR2-only dirty state.

**Verdict: GO.** Bind the final lifecycle receipt/hashes and apply the proven
clean/historical-candidate/self lifecycle model to this validator only.

Commit-object binding is directly constructable with `git show -s d1d4fc...` format
fields plus `git show d1d4fc...:<path>` for committed progress, independent of future
HEAD/live progress. Historical AR2 candidate construction is also
executable in a disposable Git repository: commit baseline bytes, replace only the
unique formatter fragment with formatted bytes, then assert AR2-only staged and
unstaged states independently. Cancellation is created by staging formatted bytes and
restoring baseline bytes in the worktree; staged/unstaged intersection must reject.
The combined classifier avoids subprocess-copy ambiguity: exact content states and
real disposable-Git scope states are passed directly to the future validator's own
exported SUT function for every truth-table row. Static AST inspection plus a silent
dynamic import proves operational work is not performed at module load.
