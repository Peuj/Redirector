---
description: Full cherry-pick workflow from feature/test-instrumentation to master -- classify commits, guide each cherry-pick, verify no rlog leak. Use when porting feature work to master.
allowed-tools: Read Write Edit Bash(git *) Bash(grep *) Bash(npm *)
---

## Lint prerequisite

Before cherry-picking, verify all linters pass on the feature branch:

```
npm run lint:all   # must report 0 errors, 0 warnings (ESLint + Stylelint + HTMLHint)
```

Do not cherry-pick if lint fails. Fix it on the feature branch first.

## Rules (always active for this skill)

**Test before cherry-pick:** Work on feature branch, run the full redirector-test suite, confirm all tests pass, THEN cherry-pick. Never commit to master before tests are confirmed green.

**No commit before test confirmed:** After each cherry-pick, do NOT commit, push, or tag. Wait for explicit user confirmation that testing passed.

**rlog/master invariant:** Master must never contain:
- `rlog(` calls in any JS file
- `js/redirectorLog.js` file
- `js/testHooks.js` file
- `importScripts("redirectorLog.js")` or `importScripts("testHooks.js")` in background.js

**manifest.json invariant:** After every cherry-pick to feature branch, verify `manifest.json` still has `redirectorLog.js` and `testHooks.js` in `background.scripts`. Some cherry-picks silently overwrite manifest.json with master's version (taking the wrong side in a merge).

## Instructions

Confirm you are on `master` (`git checkout master` if not).

### Step 1 -- Classify commits

Run: `git log --oneline master..feature/test-instrumentation`

For each commit, classify as:
- `rlog-only` -- diff only adds/removes `rlog(...)` calls, redirectorLog.js/testHooks.js imports, or lint fixes for test-only files. Skip.
- `needs-cherry-pick` -- any functional change (bug fix, feature, refactor in production files). Must go to master.
- `already-in-master` -- functionally present on master with different SHA (already cherry-picked). Skip.

Show classification and wait for user confirmation.

### Step 2 -- Separate commits on feature branch if needed

If an unpicked commit mixes functional changes with rlog calls in the same file:

**Option A (preferred when hunks are in separate git hunks):** Use `git add -p` to stage only the functional hunk, commit it as a clean standalone, then commit the rlog additions separately. The clean commit cherry-picks with no stripping needed.

```bash
printf 'n\ny\n' | git add -p js/background.js   # skip rlog hunk, stage bug-fix hunk
git commit -m "Fix: <description>"
git add js/background.js                          # stage remaining rlog hunk
git commit -m "rlog: instrument <description>"
```

**Option B (when rlog calls are interleaved with functional code):** Cherry-pick the commit then strip rlog lines manually (see Step 3).

### Step 3 -- Cherry-pick each `needs-cherry-pick` commit (oldest first)

For each:
1. Show diff: `git show <hash>`
2. `git cherry-pick <hash>`
3. If conflicts in rlog lines only: abort (`git cherry-pick --abort`) and apply manually with Edit tool, stripping all `rlog(` lines and any lines that only exist to support them (e.g., variables only referenced by rlog calls).
4. If conflicts in functional code: show conflict and ask user to resolve.

**testHooks.js conflict:** Any commit that touches `js/testHooks.js` will produce a "deleted by us" conflict on master (master never carries that file). Always resolve with `git rm js/testHooks.js` -- it is test-only infrastructure and must stay deleted on master.

After each cherry-pick: run `grep -n "rlog(" js/background.js` on master to confirm no leak.

### Step 4 -- Final verification

```bash
# No rlog calls anywhere except testHooks.js and redirectorLog.js
grep -rn "rlog(" js/*.js | grep -v "testHooks.js\|redirectorLog.js"

# No test file imports
grep -n "redirectorLog\|testHooks" js/background.js

# Lint passes on master
npm run lint
```

All must be clean before reporting done.

### Step 5 -- Remind

"Cherry-picks complete. Note: testHooks.js is feature-branch-only, so ALL companion ops fail against master (the `onMessageExternal` handlers that handle `run-redirect-op` and all other ops live in testHooks.js). Run the test suite on the feature branch only."

## Stripping rlog from a commit manually

When cherry-pick has rlog-only conflicts or you need to strip a mixed commit:

```bash
git cherry-pick --no-commit <hash>
# Edit affected files: remove all lines containing rlog(
# Also remove: const rlog = ..., /* global redirectorLog */, eslint-disable comments for rlog
# Also remove: importScripts("redirectorLog.js") and importScripts("testHooks.js")
# Variables only referenced by removed rlog calls become no-unused-vars: remove them too
git add <files>
git cherry-pick --continue
```

**Empty arrow function divergence:** The feature branch ESLint config allows `() => {}` for the rlog fallback. After stripping `const rlog = ...`, verify no empty arrow function lint errors remain on master.
