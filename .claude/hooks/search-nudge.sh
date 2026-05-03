#!/usr/bin/env bash
# PreToolUse hook on Bash. When the model reaches for raw grep/find/git-grep
# to search code, allow the call but inject a context note pointing it at
# the right tool — `bun run search` (ripgrep + ast-grep dispatch) for text
# and structural matches, the typescript-lsp plugin for symbol queries.
#
# Why a hook and not just doc: the model already knows the docs. The trap
# is reflex — it types `grep -r` before reading CLAUDE.md. The hook is a
# situational nudge fired at exactly the moment the wrong choice happens.
#
# Matching strategy: split the command on shell separators (; && || |) and
# inspect the first word of each segment. This avoids false positives where
# the offender appears inside a quoted string (e.g. `echo '... grep -r ...'`).

set -euo pipefail

input="$(cat)"
cmd="$(printf '%s' "$input" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))')"

nudge="$(python3 - "$cmd" <<'PY'
import re, shlex, sys

cmd = sys.argv[1]

# Split on shell control operators outside of quotes.
# We do a coarse split: shlex with posix=True respects quotes when looking at
# tokens, so we walk the original string and slice on top-level separators.
def split_segments(s: str):
    out, buf = [], []
    i, n = 0, len(s)
    quote = None
    while i < n:
        c = s[i]
        if quote:
            buf.append(c)
            if c == quote and (i == 0 or s[i-1] != '\\'):
                quote = None
            i += 1
            continue
        if c in ("'", '"'):
            quote = c
            buf.append(c)
            i += 1
            continue
        # two-char operators
        if c == s[i:i+2][0] and s[i:i+2] in ('&&', '||'):
            out.append(''.join(buf)); buf = []; i += 2; continue
        if c in (';', '|', '\n'):
            out.append(''.join(buf)); buf = []; i += 1; continue
        buf.append(c); i += 1
    if buf:
        out.append(''.join(buf))
    return [seg.strip() for seg in out if seg.strip()]

OFFENDERS = {
    "grep -r": "grep -r",
    "grep -R": "grep -r",
    "grep --recursive": "grep -r",
    "git grep": "git grep",
}

def classify(seg: str) -> str:
    try:
        tokens = shlex.split(seg)
    except ValueError:
        return ""
    if not tokens:
        return ""
    head = tokens[0]
    rest = tokens[1:]

    # git grep
    if head == "git" and rest and rest[0] == "grep":
        return "git grep"

    # find with code-search-style predicates
    if head == "find":
        if any(t in rest for t in ("-name", "-iname", "-regex", "-iregex", "-path", "-ipath")):
            return "find"
        return ""

    # grep: only nudge on explicit recursive flags. Plain `grep PAT file` is
    # a fine reach for a single-file scan; trying to detect "grep across many
    # files" by inspecting args is noisy (regex patterns contain * too).
    if head == "grep":
        if any(t in ("-r", "-R", "--recursive") for t in rest):
            return "grep -r"
        return ""

    return ""

for seg in split_segments(cmd):
    label = classify(seg)
    if label:
        print(label)
        break
PY
)"

if [[ -z "$nudge" ]]; then
	exit 0
fi

NUDGE="$nudge" python3 - <<'PY'
import json, os
nudge = os.environ["NUDGE"]
print(json.dumps({
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "permissionDecisionReason": f"search-nudge: '{nudge}' is a code-search reflex; CLAUDE.md > Code Search lists better lanes.",
    "additionalContext": (
      f"search-nudge: you ran '{nudge}' for code search. For TypeScript, prefer:\n"
      "  - Built-in LSP via the typescript-lsp plugin — find references / go to definition / hover for symbol queries (diagnostics are automatic after edits)\n"
      "  - bun run search '<pattern>' [path]  — auto-dispatches regex→ripgrep, structural $METAVAR→ast-grep\n"
      "Use raw grep/find only for non-code text or single-file inspection."
    ),
  }
}))
PY
