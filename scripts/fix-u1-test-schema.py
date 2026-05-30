#!/usr/bin/env python3
"""
Fix U1 schema migration changes across test files.

U1 renames:
- `products` table → `teams` (domain entity)
- `teams` table → `teamMembers` (agent membership)

Column changes:
- bets: productId removed, teamId now refs `teams`, pitch→description, shippedAt→completedAt
- bets status: shaped→draft, committed/in_progress/behind/blocked/paused/review→active, shipped→completed
- tasks: productId removed, teamId now refs `teams` directly
- teamMembers (old teams): productId→teamId
"""

import re
import sys
from pathlib import Path

def fix_file(path: Path) -> tuple[bool, str]:
    """Returns (changed, new_content)"""
    content = path.read_text()
    original = content

    # Step 1: Fix import lines
    # Remove `products` from @hyperidle/db imports
    # Pattern: import { ..., products, ... } from "@hyperidle/db"
    # Also add teamMembers if teams is imported but teamMembers isn't

    def fix_db_import(m):
        full_import = m.group(0)
        items_str = m.group(1)

        # Parse the items
        items = [i.strip() for i in re.split(r',\s*', items_str.strip())]
        items = [i for i in items if i]  # remove empty

        # Remove products
        items = [i for i in items if i not in ('products', 'type products')]

        # Add teamMembers if not present and teams is present
        if 'teams' in items and 'teamMembers' not in items:
            # Insert teamMembers after teams
            idx = items.index('teams')
            items.insert(idx + 1, 'teamMembers')

        # Rebuild import
        if len(items) == 1:
            return f'import {{ {items[0]} }} from "@hyperidle/db"'

        # Check if original had multiline format
        if '\n' in full_import:
            # Multiline
            indent = '\t'
            items_formatted = f',\n{indent}'.join(items)
            return f'import {{\n{indent}{items_formatted},\n}} from "@hyperidle/db"'
        else:
            return f'import {{ {", ".join(items)} }} from "@hyperidle/db"'

    # Match the full import statement for @hyperidle/db
    # Handle both single-line and multi-line imports
    content = re.sub(
        r'import\s*\{([^}]+)\}\s*from\s*["\']@hyperidle/db["\']',
        fix_db_import,
        content,
        flags=re.DOTALL
    )

    # Step 2: Replace `products` variable usage
    # insert(products) → insert(teams)
    content = content.replace('.insert(products)', '.insert(teams)')
    content = content.replace('.delete(products)', '.delete(teams)')
    content = content.replace('.select().from(products)', '.select().from(teams)')
    content = content.replace('.update(products)', '.update(teams)')
    content = content.replace('eq(products.id', 'eq(teams.id')
    content = content.replace('products.id', 'teams.id')

    # Step 3: Old `teams` → `teamMembers`
    # The old `teams` inserts had `productId` field
    # After the rename, old teams inserts now become teamMembers inserts
    # We detect old teams inserts by presence of productId in the values block

    # Replace insert(teams).values({ ... productId: ... }) → insert(teamMembers).values({ ... teamId: ... })
    # This is tricky to do purely with regex, so we do it in passes

    # First, find all insert(teams) blocks that contain productId and replace:
    # 1. insert(teams) → insert(teamMembers)
    # 2. productId → teamId (within those blocks)

    # We'll use a state-machine approach on the content
    lines = content.split('\n')
    result_lines = []
    i = 0
    while i < len(lines):
        line = lines[i]

        # Detect start of old-style teams insert (which becomes teamMembers)
        if '.insert(teams)' in line:
            # Look ahead to find productId within the next ~20 lines
            lookahead = '\n'.join(lines[i:min(i+20, len(lines))])
            if 'productId:' in lookahead:
                # This is an old teams insert → becomes teamMembers
                line = line.replace('.insert(teams)', '.insert(teamMembers)')

        result_lines.append(line)
        i += 1
    content = '\n'.join(result_lines)

    # Step 4: Fix productId fields in old-teams (now teamMembers) insert blocks
    # After we've replaced insert(teamMembers) above, we need to fix productId → teamId
    # But ONLY in teamMembers inserts, not in bets/tasks

    # Process insert(teamMembers).values blocks
    def fix_team_members_block(m):
        block = m.group(0)
        # In teamMembers, productId → teamId
        block = block.replace('productId:', 'teamId:')
        return block

    # Match .insert(teamMembers).values({ ... }) blocks
    content = re.sub(
        r'\.insert\(teamMembers\)\.values\(\{[^}]*?\}\)',
        fix_team_members_block,
        content,
        flags=re.DOTALL
    )

    # Also handle multi-chained version
    # .insert(teamMembers)\n\t.values({...}) — the above should handle this

    # Step 5: Fix bets inserts
    # Remove productId from bets (bets.teamId now refs teams directly)
    # pitch → description
    # status mappings
    # shippedAt → completedAt

    def fix_bets_block(m):
        block = m.group(0)
        # Remove productId line from bets
        block = re.sub(r'\s*productId:\s*["\'][^"\']*["\'],?\s*\n', '\n', block)
        # pitch → description
        block = block.replace('pitch:', 'description:')
        # shippedAt → completedAt
        block = block.replace('shippedAt:', 'completedAt:')
        # Status mappings
        block = block.replace("status: 'shaped'", "status: 'draft'")
        block = block.replace('status: "shaped"', 'status: "draft"')
        block = block.replace("status: 'committed'", "status: 'active'")
        block = block.replace('status: "committed"', 'status: "active"')
        block = block.replace("status: 'in_progress'", "status: 'active'")
        block = block.replace('status: "in_progress"', 'status: "active"')
        block = block.replace("status: 'shipped'", "status: 'completed'")
        block = block.replace('status: "shipped"', 'status: "completed"')
        block = block.replace("status: 'behind'", "status: 'active'")
        block = block.replace('status: "behind"', 'status: "active"')
        block = block.replace("status: 'blocked'", "status: 'active'")
        block = block.replace('status: "blocked"', 'status: "active"')
        block = block.replace("status: 'review'", "status: 'active'")
        block = block.replace('status: "review"', 'status: "active"')
        return block

    content = re.sub(
        r'\.insert\(bets\)\.values\(\{[^}]*?\}\)',
        fix_bets_block,
        content,
        flags=re.DOTALL
    )

    # Step 6: Fix tasks inserts - remove productId
    def fix_tasks_block(m):
        block = m.group(0)
        block = re.sub(r'\s*productId:\s*["\'][^"\']*["\'],?\s*\n', '\n', block)
        return block

    content = re.sub(
        r'\.insert\(tasks\)\.values\(\{[^}]*?\}\)',
        fix_tasks_block,
        content,
        flags=re.DOTALL
    )

    # Step 7: Also fix `bets` schema field access: bets.pitch → bets.description
    content = content.replace('bets.pitch', 'bets.description')

    return content != original, content


def main():
    import glob
    import os

    files = []

    # Collect all test files that need fixing
    base = Path('/Users/tg/hyperidle/.worktrees/U1/packages')
    patterns = [
        'server/src/__tests__/*.ts',
        'server/src/routes/__tests__/*.ts',
        'server/src/skill-tools/__tests__/*.ts',
        'fabric/src/__tests__/*.ts',
    ]

    for pattern in patterns:
        for f in base.glob(pattern):
            files.append(f)

    # Also the products.ts route
    files.append(base / 'server/src/routes/products.ts')

    changed_count = 0
    for f in sorted(files):
        if not f.exists():
            continue
        changed, new_content = fix_file(f)
        if changed:
            f.write_text(new_content)
            print(f'FIXED: {f.relative_to(base.parent)}')
            changed_count += 1
        else:
            pass  # print(f'  ok: {f.relative_to(base.parent)}')

    print(f'\nFixed {changed_count} files')


if __name__ == '__main__':
    main()
