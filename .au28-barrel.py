#!/usr/bin/env python3
"""AU28 — split the four development symbols out of `@hyperidle/db`'s public barrel.

Rewrites `import { ..., createTestDb, ... } from "@hyperidle/db"` into two statements:
the production symbols keep the barrel, the development symbols move to
`@hyperidle/db/testing`.
"""
import pathlib
import re
import subprocess

DEV = {"createTestDb", "warmPool", "closeAllInstances", "TestDbHandle"}

files = subprocess.run(["git", "ls-files", "packages"], capture_output=True, text=True, check=True).stdout.split()
pattern = re.compile(r'import\s*\{([^}]*)\}\s*from\s*"@hyperidle/db";', re.S)

changed = 0
for f in files:
    if not f.endswith((".ts", ".tsx")):
        continue
    p = pathlib.Path(f)
    text = p.read_text()
    if "@hyperidle/db" not in text:
        continue

    def repl(m):
        global changed
        raw = m.group(1)
        specs = [s.strip() for s in raw.split(",") if s.strip()]
        prod, dev = [], []
        for spec in specs:
            name = spec.replace("type ", "").split(" as ")[0].strip()
            (dev if name in DEV else prod).append(spec)
        if not dev:
            return m.group(0)
        changed += 1
        out = []
        if prod:
            out.append("import { " + ", ".join(prod) + ' } from "@hyperidle/db";')
        out.append("import { " + ", ".join(dev) + ' } from "@hyperidle/db/testing";')
        return "\n".join(out)

    new = pattern.sub(repl, text)
    if new != text:
        p.write_text(new)

print("rewritten import statements:", changed)
