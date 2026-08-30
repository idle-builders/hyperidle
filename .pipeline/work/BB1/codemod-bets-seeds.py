#!/usr/bin/env python3
from __future__ import annotations
"""
BB1 codemod: turn `insert(bets)` test seeds into root-task seeds.

Conservative by design. It only rewrites the exact shape it recognises and
REPORTS anything it cannot handle rather than guessing — a silent partial
rewrite of 107 test files would be worse than no rewrite at all.

Transform:
  db.insert(bets).values({ id, teamId, description, appetite?, status, createdAt, ... })
    -> db.insert(tasks).values({ id, teamId, title: <description>, state: <mapped>,
                                 createdAt, updatedAt: <createdAt> })

  and inside task seeds:  betId: X  ->  parentTaskId: X
                          betId,    ->  parentTaskId: betId,
"""
import re
import sys
from pathlib import Path

STATUS_MAP = {
    "draft": "proposed",
    "active": "in_progress",
    "completed": "done",
    "killed": "killed",
}

# Fields on the old bets row that have no task equivalent and are simply dropped.
DROPPED = {"appetite", "atRisk", "hypothesis", "revisionLog", "outcomeSummary"}
# Fields that carry over unchanged.
PASSTHROUGH = {"id", "teamId", "createdAt", "completedAt", "tokensActualJson",
               "sourceKnowledgeItemId", "outcomeRecordedAt", "outcomeRecordedBy",
               "sourceKnowledgeItemId"}

problems = []


def split_top_level(body: str):
    """Split an object-literal body on top-level commas."""
    parts, depth, cur, in_str, quote = [], 0, [], False, ""
    i = 0
    while i < len(body):
        c = body[i]
        if in_str:
            cur.append(c)
            if c == "\\":
                if i + 1 < len(body):
                    cur.append(body[i + 1])
                    i += 2
                    continue
            elif c == quote:
                in_str = False
        else:
            if c in "\"'`":
                in_str, quote = True, c
                cur.append(c)
            elif c in "{[(":
                depth += 1
                cur.append(c)
            elif c in "}])":
                depth -= 1
                cur.append(c)
            elif c == "," and depth == 0:
                parts.append("".join(cur))
                cur = []
            else:
                cur.append(c)
        i += 1
    if "".join(cur).strip():
        parts.append("".join(cur))
    return parts


def find_matching(text: str, start: int) -> int:
    """Index just past the `{...}` beginning at `start`."""
    depth, i, in_str, quote = 0, start, False, ""
    while i < len(text):
        c = text[i]
        if in_str:
            if c == "\\":
                i += 2
                continue
            if c == quote:
                in_str = False
        else:
            if c in "\"'`":
                in_str, quote = True, c
            elif c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    return i + 1
        i += 1
    return -1


def convert_values(body: str, path: str) -> str | None:
    fields = {}
    order = []
    for part in split_top_level(body):
        stripped = part.strip()
        if not stripped:
            continue
        m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$", stripped, re.S)
        if m:
            key, val = m.group(1), m.group(2).strip()
        elif re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", stripped):
            key, val = stripped, stripped  # shorthand
        else:
            problems.append(f"{path}: unparsed field {stripped[:60]!r}")
            return None
        fields[key] = val
        order.append(key)

    if "id" not in fields:
        problems.append(f"{path}: bets seed with no id")
        return None

    out = []
    out.append(("id", fields["id"]))
    out.append(("parentTaskId", "null"))
    if "teamId" in fields:
        out.append(("teamId", fields["teamId"]))

    # title: bets had no title, so the seed's description becomes it.
    desc = fields.get("description")
    if desc is None:
        problems.append(f"{path}: bets seed with no description (no title source)")
        return None
    out.append(("title", desc))
    out.append(("description", desc))
    if "doneCondition" in fields:
        out.append(("doneCondition", fields["doneCondition"]))

    status = fields.get("status")
    if status is None:
        problems.append(f"{path}: bets seed with no status")
        return None
    sm = re.match(r'^"([a-z_]+)"$', status)
    if sm:
        mapped = STATUS_MAP.get(sm.group(1))
        if mapped is None:
            problems.append(f"{path}: unknown bet status {status}")
            return None
        out.append(("state", f'"{mapped}"'))
    else:
        problems.append(f"{path}: non-literal status {status[:40]!r}")
        return None

    if "outcomeVerdict" in fields:
        problems.append(f"{path}: seed sets outcomeVerdict — bet vocabulary, needs a human")
        return None

    created = fields.get("createdAt")
    if created is None:
        problems.append(f"{path}: bets seed with no createdAt")
        return None
    out.append(("createdAt", created))
    out.append(("updatedAt", created))
    for k in ("completedAt", "tokensActualJson", "sourceKnowledgeItemId"):
        if k in fields:
            out.append((k, fields[k]))

    unknown = set(order) - DROPPED - PASSTHROUGH - {
        "description", "status", "doneCondition", "outcomeVerdict"}
    if unknown:
        problems.append(f"{path}: unhandled bets fields {sorted(unknown)}")
        return None

    indent = "\t\t"
    m = re.search(r"\n(\t+)", body)
    if m:
        indent = m.group(1)
    inner = "".join(f"\n{indent}{k}: {v}," for k, v in out)
    return inner + "\n" + indent[:-1]


def process(path: Path) -> bool:
    text = path.read_text()
    orig = text
    changed = False

    while True:
        m = re.search(r"\.insert\(bets\)\s*\.values\(", text)
        if not m:
            break
        brace = text.find("{", m.end())
        if brace == -1:
            problems.append(f"{path}: insert(bets).values( with no object literal")
            return False
        end = find_matching(text, brace)
        if end == -1:
            problems.append(f"{path}: unbalanced braces")
            return False
        body = text[brace + 1:end - 1]
        converted = convert_values(body, str(path))
        if converted is None:
            return False
        text = text[:m.start()] + ".insert(tasks).values({" + converted + "}" + text[end:]
        changed = True

    # `betId` in FIELD position becomes `parentTaskId`; `betId` as an ordinary
    # identifier (a local, a returned key, a type member) becomes `rootTaskId`.
    # The two are told apart by what follows the colon: a TS type annotation
    # (`betId: string`) is a member declaration, not a column.
    # The lookahead must sit BEFORE the whitespace is consumed, or `\s*`
    # backtracks to zero-width and the guard never fires.
    new = re.sub(r"\bbetId:(?!\s*(?:string|number|boolean)\b)\s*", "parentTaskId: ", text)
    if new != text:
        text, changed = new, True
    # shorthand `betId,` inside an object literal
    new = re.sub(r"(\n\t+)betId,", r"\1parentTaskId: rootTaskId,", text)
    if new != text:
        text, changed = new, True
    # everything left is an ordinary identifier
    new = re.sub(r"\bbetId\b", "rootTaskId", text)
    new = re.sub(r"\bBET_ID\b", "ROOT_TASK_ID", new)
    if new != text:
        text, changed = new, True

    # Real USE of the table, as opposed to the (multi-line) import binding.
    if changed and re.search(r"(?:insert|update|delete|from)\(bets\)|\bbets\.", text):
        problems.append(f"{path}: still references `bets` outside imports — needs a human")
        return False

    if changed:
        # tidy the import: drop `bets`, ensure `tasks`
        if "insert(bets)" not in text and re.search(r"\bbets\b", text):
            text = re.sub(r"(\n\t)bets,(?=\n)", "", text)
            text = re.sub(r"\bbets,\s*", "", text)
        if ".insert(tasks)" in text and not re.search(r"(\n\t)tasks,", text):
            text = re.sub(r"(\n\ttasks,)", r"\1", text)
        path.write_text(text)
    return changed


def main():
    roots = [Path(p) for p in sys.argv[1:]] or [Path("layers"), Path("framework"),
                                                Path("tools"), Path("applications")]
    files = []
    for r in roots:
        if r.is_file():
            files.append(r)
        else:
            for p in r.rglob("*.ts"):
                if "node_modules" in p.parts:
                    continue
                if "insert(bets)" in p.read_text() or re.search(r"\bbetId\b", p.read_text()):
                    files.append(p)
    n = 0
    for f in files:
        if process(f):
            n += 1
    print(f"rewrote {n} file(s) of {len(files)} scanned")
    if problems:
        print(f"\n{len(problems)} SITE(S) NEED A HUMAN:")
        for p in problems:
            print("  " + p)
        sys.exit(1)


if __name__ == "__main__":
    main()
