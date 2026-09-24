---
description: Load Redirector project context at session start. Use when the user starts a new session, asks what branch they are on, or asks to get oriented.
allowed-tools: Read Bash(git *)
---

## Current project state

!`cd C:/Personal/Redirector && echo "Branch: $(git branch --show-current)" && echo "Version: $(python3 -c "import json; print(json.load(open('manifest.json'))['version'])")" && echo "Last tag: $(git describe --tags --abbrev=0 2>/dev/null || echo none)" && echo "--- Feature-only commits ---" && git log --oneline master..HEAD 2>/dev/null || git log --oneline master..feature/test-instrumentation 2>/dev/null && echo "--- Uncommitted ---" && git status --short`

## Foundational rules (always active)

**No em dash:** Never use any form of em dash in any written output (commit messages, comments, PR descriptions, release notes). Use a colon, comma, or parentheses instead.

**Feature branch first:** All new code (fixes, features, refactors) goes to `feature/test-instrumentation` first, never directly to master. Once behavior is confirmed correct through testing, cherry-pick functional changes to master (stripping rlog calls). Never run `git merge master` on the feature branch.

**No commit before test confirmed:** After making code changes, stop before committing. Tell the user what changed and ask them to test with the redirector-test companion. Only proceed to commit after they confirm it works.

## Foundational commit rules (always active)

**Commit author:** Always commit as `Jerome Pierre <jerome.pierre@sap.com>`. Never use a different author.

**Never push feature branch:** NEVER push `feature/test-instrumentation` to origin. It contains rlog instrumentation and testHooks not intended for users. Push master only, after explicit user confirmation.

**Never force-push.**

**Never merge master into feature branch:** Always cherry-pick instead. `git merge master` creates merge commits that can silently take master's manifest.json (without test scripts) and contaminates cherry-picks back to master.

**rlog/master invariant:** Master must never contain:
- `rlog(` calls in any JS file
- `js/redirectorLog.js` file
- `js/testHooks.js` file
- `importScripts("redirectorLog.js")` or `importScripts("testHooks.js")` in background.js

Verify after every cherry-pick to master: `grep -rn "rlog(" js/*.js` must return nothing (excluding redirectorLog.js and testHooks.js themselves).

**manifest.json invariant:** After every cherry-pick to feature branch, verify `manifest.json` still has `redirectorLog.js` and `testHooks.js` in `background.scripts`. Some cherry-picks can silently overwrite manifest.json with master's version.

## Report

Output a one-block session briefing:

```
Session ready.

Branch:   <branch>
Version:  <version>
Last tag: <tag>
Sync:     <"In sync" OR "N commits on feature need cherry-picking" OR describe mismatch>

Rules active: no em dash | develop on feature branch | no commit before test confirmed
```

Highlight any unexpected state (dirty working tree, master-only commits that are not cherry-picks of feature commits, rlog leak) prominently before the briefing.

Then ask: "What are we working on today?"
