#!/usr/bin/env bash
# AU29 — B1 probe (architecture revision 2): plan validation scenario 3.
#
# Phase 1 proves the critique's premise: a deliberately added no-database export in framework/db
# is NAMED by the unplaced-symbol NOTE but the lint still PASSes (exit 0) — no delivering mechanism.
# Phase 2 proves the chosen mechanism: the same unplaced map surfaced as a registered error rule
# ("db-symbols-all-placed") flips the verdict to FAIL, naming the symbol.
#
# Run from the repo root with node >= 24 on PATH. Restores every touched file on exit.
set -euo pipefail

BARREL=framework/db/src/index.ts
LINT=scripts/governance-lint.ts
PROBE=framework/db/src/no-db-probe.ts

for f in "$BARREL" "$LINT"; do
  git diff --quiet -- "$f" || { echo "refusing: $f is dirty"; exit 2; }
done
[ ! -e "$PROBE" ] || { echo "refusing: $PROBE already exists"; exit 2; }

cleanup() {
  git checkout -- "$BARREL" "$LINT" 2>/dev/null || true
  rm -f "$PROBE"
}
trap cleanup EXIT

cat > "$PROBE" <<'TS'
/** AU29 B1 probe — a deliberately added export that performs no database access. */
export function probeNoDb(input: string): string {
	return `probe:${input}`;
}
TS
printf 'export { probeNoDb } from "./no-db-probe.js";\n' >> "$BARREL"

echo "── phase 1: unmodified lint over the deliberate no-db export ──"
set +e
npx tsx "$LINT" > /tmp/au29-b1-phase1.out 2>&1
P1=$?
set -e
grep -E "probeNoDb|governance-lint: (PASS|FAIL)" /tmp/au29-b1-phase1.out
echo "phase 1 exit: $P1 (expected 0 — the scenario passes lint today: NO delivering mechanism)"
[ "$P1" -eq 0 ] || { echo "UNEXPECTED: lint already fails"; exit 1; }

# Prototype the escalation: register the unplaced map as an error rule (the end-state shape;
# in the real change the rule lives in scripts/rules/ and is registered in BOTH rule lists).
python3 - <<'EOF'
src = open('scripts/governance-lint.ts').read()
rule = '''	const dbSymbolsAllPlaced: Rule = {
		id: "db-symbols-all-placed",
		description: "every symbol reachable through the database package resolves to a named surface",
		scope: (c) => c.files.filter((f) => f.path.startsWith("framework/db/src/")).map((f) => f.path),
		minScope: 5,
		evaluate: () =>
			[...detected.unplacedDbSymbols].map(([symbol, why]) => ({
				ruleId: "db-symbols-all-placed",
				severity: "error" as const,
				message: `${symbol} — ${why}`,
				path: "framework/db/src/index.ts",
			})),
	};

	const RULES: readonly Rule[] = [
		dbSymbolsAllPlaced,
'''
old = '''	const RULES: readonly Rule[] = [
'''
assert src.count(old) == 1
open('scripts/governance-lint.ts','w').write(src.replace(old, rule))
EOF

echo "── phase 2: lint with the escalation rule registered ──"
set +e
npx tsx "$LINT" > /tmp/au29-b1-phase2.out 2>&1
P2=$?
set -e
grep -E "db-symbols-all-placed.*probeNoDb|governance-lint: (PASS|FAIL)" /tmp/au29-b1-phase2.out
echo "phase 2 exit: $P2 (expected 1 — the mechanism fires, naming the symbol)"
[ "$P2" -eq 1 ]
grep -q "db-symbols-all-placed.*probeNoDb" /tmp/au29-b1-phase2.out

echo "VERDICT: PASS — scenario 3 has no mechanism today; the escalation rule delivers it by name."
