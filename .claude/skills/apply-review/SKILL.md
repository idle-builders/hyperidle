---
name: apply-review
description: "Apply review findings. Run by developer (code) or qa (tests) agent."
argument-hint: "[review findings — passed as context from the orchestrating skill]"
user-invocable: false
min_tool_calls: 6
---

# Apply Review

You receive review findings from a scan/review skill. Work through each finding:

1. **Validate** — is the finding correct? Read the referenced code. If the finding is wrong or outdated, skip it and note why.
2. **Apply** — make the fix. Keep changes behavior-preserving unless the finding explicitly identifies a bug.
3. **Verify** — after each logical group of fixes, run `bun run check && bun run lint && bun run test`. Revert anything that breaks tests.

Do not add unrelated improvements. Only address the findings you were given.

## Target

$ARGUMENTS
