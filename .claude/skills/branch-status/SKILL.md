---
description: Quick snapshot of feature vs master parity -- commits, sync state, integrity checks. Use when asked about branch state, sync status, or whether branches are in sync.
allowed-tools: Bash(git *) Bash(grep *)
---

## Branch state

!`cd C:/Personal/Redirector && echo "=== BRANCH ===" && git branch --show-current && echo "=== FEATURE-ONLY COMMITS ===" && git log --oneline master..feature/test-instrumentation 2>/dev/null && echo "=== MASTER-ONLY COMMITS ===" && git log --oneline feature/test-instrumentation..master 2>/dev/null && echo "=== UNCOMMITTED ===" && git status --short && echo "=== RLOG LEAK CHECK (master) ===" && git show master:js/background.js 2>/dev/null | grep -c "rlog(" && echo "=== MANIFEST CHECK (feature) ===" && git show feature/test-instrumentation:manifest.json 2>/dev/null | python3 -c "import sys,json; s=sys.stdin.read(); m=json.loads(s); bg=m.get('background',{}); scripts=bg.get('scripts',[]); ok=('js/redirectorLog.js' in scripts and 'js/testHooks.js' in scripts); print('OK' if ok else 'FAIL -- missing test scripts')" 2>/dev/null`

## Instructions

Classify each commit under "FEATURE-ONLY COMMITS" as:
- `rlog-only` -- diff only adds/removes `rlog(...)` calls, redirectorLog.js/testHooks.js imports, or lint fixes for those. Skip when cherry-picking.
- `needs-cherry-pick` -- any functional change. Must go to master.
- `already-in-master` -- functionally present on master (cherry-picked with different SHA). Skip.

Report:

```
BRANCH STATUS

Branch:   <branch>    Version: <version>

Feature-only commits:
  <classified list, or "none">

Master-only commits (expected: only cherry-picks of feature commits):
  <list or "none">

Checks:
  rlog leak (master):      <OK / FAIL -- N occurrences>
  manifest.json (feature): <OK / FAIL>
  Uncommitted:             <none / list>

SYNC: <"In sync" | "N functional commits need cherry-picking to master" | describe issue>
```

If any FAIL: suggest running `/feature-to-master` to resolve.

**Master-only commits that are NOT cherry-picks:** flag these. A commit on master but not feature may need backporting (e.g., a hotfix that also needs rlog instrumentation). Do not auto-apply; ask the user.

**rlog leak check counts lines containing `rlog(` in master's background.js via `git show`.** A count of 0 is OK. Any higher number is a FAIL. Never check the working tree file when on the feature branch -- it always contains rlog calls.
