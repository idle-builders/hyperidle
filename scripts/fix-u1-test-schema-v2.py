#!/usr/bin/env python3
"""
Fix U1 schema migration changes - v2: handles multiline values blocks.
"""

import re
import sys
from pathlib import Path


def fix_file(path: Path) -> tuple[bool, str]:
    """Returns (changed, new_content)"""
    content = path.read_text()
    original = content

    # Step 1: Fix productId in teamMembers insert blocks (multiline)
    # We need to find all insert(teamMembers) blocks and fix productId → teamId
    # Strategy: scan the text for insert(teamMembers) then find the matching .values({ ... })

    def fix_team_members_values(content: str) -> str:
        """Find teamMembers insert blocks and fix productId → teamId"""
        result = []
        i = 0
        text = content
        while i < len(text):
            # Find next .insert(teamMembers)
            pos = text.find('.insert(teamMembers)', i)
            if pos == -1:
                result.append(text[i:])
                break
            result.append(text[i:pos + len('.insert(teamMembers)')])
            i = pos + len('.insert(teamMembers)')

            # Now find .values({ ... }) - search for matching braces
            # Skip whitespace and chained calls
            remaining = text[i:]
            values_match = re.match(r'(\s*\.values\s*\()\s*(\{)', remaining, re.DOTALL)
            if values_match:
                # Found .values(
                before_brace = values_match.group(1)

                # Find the closing } of the values object
                brace_start = i + len(values_match.group(1)) + len(values_match.group(2)) - 1

                # Count braces
                depth = 0
                j = i + len(values_match.group(1)) + len(values_match.group(2)) - 1
                while j < len(text):
                    if text[j] == '{':
                        depth += 1
                    elif text[j] == '}':
                        depth -= 1
                        if depth == 0:
                            break
                    j += 1

                # Extract the values block content
                block_content = text[brace_start:j+1]
                # Fix productId → teamId within this block
                fixed_block = block_content.replace('productId:', 'teamId:')
                # Also fix shorthand: "productId," or "productId\n" → "teamId: productId,"
                # Note: shorthand form means the variable name matches the field name
                # We can't easily fix shorthand without knowing the variable names
                # For now, just handle explicit productId: ... patterns

                result.append(text[i:i + len(values_match.group(1)) - 1])  # before "{"
                result.append('{')
                result.append(fixed_block[1:])  # after opening {
                i = j + 1
            # else: no values found, just continue

        return ''.join(result)

    content = fix_team_members_values(content)

    # Step 2: Fix bets insert blocks (multiline) - remove productId, fix pitch/status/shippedAt
    def fix_bets_values(content: str) -> str:
        result = []
        i = 0
        text = content
        while i < len(text):
            pos = text.find('.insert(bets)', i)
            if pos == -1:
                result.append(text[i:])
                break
            result.append(text[i:pos + len('.insert(bets)')])
            i = pos + len('.insert(bets)')

            remaining = text[i:]
            values_match = re.match(r'(\s*\.values\s*\()\s*(\{)', remaining, re.DOTALL)
            if values_match:
                brace_start = i + len(values_match.group(1)) + len(values_match.group(2)) - 1

                depth = 0
                j = i + len(values_match.group(1)) + len(values_match.group(2)) - 1
                while j < len(text):
                    if text[j] == '{':
                        depth += 1
                    elif text[j] == '}':
                        depth -= 1
                        if depth == 0:
                            break
                    j += 1

                block_content = text[brace_start:j+1]

                # Remove productId: "..." lines
                block_content = re.sub(r'\n\s*productId:\s*["\'][^"\']*["\'],?', '', block_content)
                # Fix pitch → description
                block_content = block_content.replace('pitch:', 'description:')
                # Fix shippedAt → completedAt
                block_content = block_content.replace('shippedAt:', 'completedAt:')
                # Fix status values
                for old, new in [
                    ("'shaped'", "'draft'"), ('"shaped"', '"draft"'),
                    ("'committed'", "'active'"), ('"committed"', '"active"'),
                    ("'in_progress'", "'active'"), ('"in_progress"', '"active"'),
                    ("'shipped'", "'completed'"), ('"shipped"', '"completed"'),
                    ("'behind'", "'active'"), ('"behind"', '"active"'),
                    ("'blocked'", "'active'"), ('"blocked"', '"active"'),
                    ("'review'", "'active'"), ('"review"', '"active"'),
                    ("'paused'", "'active'"), ('"paused"', '"active"'),
                ]:
                    # Only replace status values, not status strings in comments
                    block_content = re.sub(
                        r'(status:\s*)' + re.escape(old),
                        r'\g<1>' + new,
                        block_content
                    )

                result.append(text[i:i + len(values_match.group(1)) - 1])
                result.append('{')
                result.append(block_content[1:])
                i = j + 1

        return ''.join(result)

    content = fix_bets_values(content)

    # Step 3: Fix tasks insert blocks - remove productId
    def fix_tasks_values(content: str) -> str:
        result = []
        i = 0
        text = content
        while i < len(text):
            pos = text.find('.insert(tasks)', i)
            if pos == -1:
                result.append(text[i:])
                break
            result.append(text[i:pos + len('.insert(tasks)')])
            i = pos + len('.insert(tasks)')

            remaining = text[i:]
            values_match = re.match(r'(\s*\.values\s*\()\s*(\{)', remaining, re.DOTALL)
            if values_match:
                brace_start = i + len(values_match.group(1)) + len(values_match.group(2)) - 1

                depth = 0
                j = i + len(values_match.group(1)) + len(values_match.group(2)) - 1
                while j < len(text):
                    if text[j] == '{':
                        depth += 1
                    elif text[j] == '}':
                        depth -= 1
                        if depth == 0:
                            break
                    j += 1

                block_content = text[brace_start:j+1]
                # Remove productId: "..." lines from tasks
                block_content = re.sub(r'\n\s*productId:\s*["\'][^"\']*["\'],?', '', block_content)

                result.append(text[i:i + len(values_match.group(1)) - 1])
                result.append('{')
                result.append(block_content[1:])
                i = j + 1

        return ''.join(result)

    content = fix_tasks_values(content)

    # Step 4: Fix bets.pitch → bets.description in non-insert contexts
    content = content.replace('bets.pitch', 'bets.description')

    # Step 5: Fix API request bodies using productId/pitch
    # These are JSON.stringify({ ... }) blocks in HTTP test calls
    # For now, just fix the obvious patterns in JSON bodies
    def fix_json_body(content: str) -> str:
        # Fix productId in JSON.stringify bodies
        # But we need to be careful: productId in bets API bodies → teamId
        # productId in products/teams API → keep if it's part of a teams API

        # For bet-create API calls: productId → teamId
        # Pattern: JSON.stringify({ ... productId: ... pitch: ... })
        # We can't perfectly determine context, so let's handle explicit patterns

        # Fix pitch → description in API request bodies
        # JSON.stringify({ ... pitch: "..." ... })
        content = re.sub(
            r'(JSON\.stringify\([^)]*?)(\bpitch\b)(\s*:)',
            r'\1description\3',
            content,
            flags=re.DOTALL
        )

        return content

    content = fix_json_body(content)

    return content != original, content


def main():
    from pathlib import Path

    base = Path('/Users/tg/hyperidle/.worktrees/U1/packages')
    patterns = [
        'server/src/__tests__/*.ts',
        'server/src/routes/__tests__/*.ts',
        'server/src/skill-tools/__tests__/*.ts',
        'fabric/src/__tests__/*.ts',
    ]

    # Also the products.ts route
    extra_files = [
        base / 'server/src/routes/products.ts',
        base / 'server/src/skill-tools/__tests__/_helpers.ts',
    ]

    files = []
    for pattern in patterns:
        for f in base.glob(pattern):
            files.append(f)
    files.extend(extra_files)

    changed_count = 0
    for f in sorted(set(files)):
        if not f.exists():
            continue
        changed, new_content = fix_file(f)
        if changed:
            f.write_text(new_content)
            print(f'FIXED: {f.relative_to(base.parent)}')
            changed_count += 1

    print(f'\nFixed {changed_count} files')


if __name__ == '__main__':
    main()
