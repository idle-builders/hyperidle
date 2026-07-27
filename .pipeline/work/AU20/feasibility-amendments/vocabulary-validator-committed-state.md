# AU20 feasibility amendment — vocabulary validator committed state

At clean committed HEAD `7ec8982617baa3929b1a03ac22ed2a397a17d2c3`, both target
documents match their frozen expected hashes and the tracked diff is empty, yet the
validator exits 2 with `FAIL green scope mismatch: []`. The defect is isolated to the
diff-state predicate; content reconstruction and guard evidence remain valid.

**Verdict: GO.** Extend the validator to accept exactly the clean committed green
state while retaining all candidate and negative scope cases. The correction exposes
three test seams from the same module: pure scope and document-state predicates plus
changed-path acquisition parameterized by repository root. A disposable Git repository
proves clean, staged, unstaged, mixed index/worktree, same-path staged/unstaged
cancellation, exact target, exact validator-self candidate, partial, and unrelated
states without mutating the AU20 worktree or index. A separate pure matrix proves
baseline, expected, mixed, and modified document-hash decisions.
