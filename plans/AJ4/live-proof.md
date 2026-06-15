# AJ4 MAJOR-1 Live Proof

## What was proven

The `uploadShots` orphan-branch upload path works end-to-end against the real `ambrovia/hyperidle` private repo (PR #322).

## Root cause fixed

Two bugs in the original `upload-assets.ts`:

1. `gh api -f tree=[]` sends the *string* `"[]"` as a form field — GitHub POST /git/trees receives it as form-encoded, not JSON → 422 "Unprocessable".  
   Fix: use `--input -` with a JSON body piped to stdin.

2. GitHub POST /git/trees rejects `{"tree":[]}` — an empty tree array is invalid per the API → 422 "Invalid tree info".  
   Fix: create an empty blob (via POST /git/blobs, content="") first, then build a tree with a `.gitkeep` sentinel entry before creating the orphan commit.

## Commands run

```
# Proof script: /tmp/aj4-live-proof.mjs
# Environment: ambrovia/hyperidle (PRIVATE), PR #322
# Branch created: pr-evidence/322 (orphan, no parents)

# Step 1: Create empty blob
gh api --method POST repos/ambrovia/hyperidle/git/blobs --input - --jq .sha
# body: {"content":"","encoding":"utf-8"}
# result: e69de29bb2d1d6434b8b29ae775ad8c2e48c5391

# Step 2: Create tree with .gitkeep
gh api --method POST repos/ambrovia/hyperidle/git/trees --input - --jq .sha
# body: {"tree":[{"path":".gitkeep","mode":"100644","type":"blob","sha":"e69de29bb2d1d6434b8b29ae775ad8c2e48c5391"}]}
# result: d564d0bc3dd917926892c55e3706cc116d5b165e

# Step 3: Create orphan commit (parents: [])
gh api --method POST repos/ambrovia/hyperidle/git/commits --input - --jq .sha
# body: {"message":"init pr-evidence/322","tree":"d564d0bc3dd917926892c55e3706cc116d5b165e","parents":[]}
# result: 6bf8b8de272431405ccc693f669f65455c4c7c66

# Step 4: Create ref
gh api --method POST repos/ambrovia/hyperidle/git/refs -F ref=refs/heads/pr-evidence/322 -F sha=6bf8b8de...

# Step 5: Upload 1x1 PNG via PUT /contents
gh api --method PUT repos/ambrovia/hyperidle/contents/322/AJ4__LiveProof__TestStory__after.png \
  -f message="aj4 live-proof upload 322" -f branch=pr-evidence/322 -f content=<base64>
```

## Result

- Orphan branch: `pr-evidence/322` created successfully on `ambrovia/hyperidle`
- PNG uploaded: `322/AJ4__LiveProof__TestStory__after.png`
- blob-viewer URL: `https://github.com/ambrovia/hyperidle/blob/pr-evidence/322/322/AJ4__LiveProof__TestStory__after.png`
- File confirmed via API:
  ```json
  {"name":"AJ4__LiveProof__TestStory__after.png","sha":"62a5f8f47fec02344e5bf9061888262f677cf5d6","size":69}
  ```
- `download_url` returned a token-gated `raw.githubusercontent.com` URL (private-repo behaviour — expected; blob-viewer page is the openable link)

## Revert

The synthetic PNG and throwaway proof script (`/tmp/aj4-live-proof.mjs`, `/tmp/aj4-test-live-proof.png`) are local only and were NOT committed. The `pr-evidence/322` orphan branch on GitHub contains only the `.gitkeep` sentinel and the proof PNG — no production code was affected.
