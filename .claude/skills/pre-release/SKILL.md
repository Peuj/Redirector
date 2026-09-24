---
description: Release readiness checklist -- integrity checks, version bump, full release steps. Run before every release.
allowed-tools: Read Write Bash(git *) Bash(grep *) Bash(npm *) Bash(python3 *)
---

## Instructions

### Step 1 -- Mandatory audit

1. Run `git log --oneline feature/test-instrumentation ^master` -- every commit must be either rlog-only, already cherry-picked to master, or needs cherry-picking NOW. If any `needs-cherry-pick` commits exist: stop. Run `/feature-to-master` first, then return here.

2. Run `grep -rn "rlog(" js/*.js` on master (not the feature branch working tree). Must return nothing.

3. Run `npm run lint:all` on master. Must pass with 0 errors, 0 warnings.

4. Confirm no uncommitted changes on master: `git status --short`

### Step 2 -- Integrity checks

Report each as PASS or FAIL:

| Check | Result |
|---|---|
| No feature commits needing cherry-pick | |
| No rlog( in master JS files | |
| redirectorLog.js absent from master | |
| testHooks.js absent from master | |
| manifest.json background.scripts has no test files | |
| npm run lint:all passes (0 errors, 0 warnings) | |
| No uncommitted changes | |

**If any FAIL: stop. Fix it. Do not proceed to version bump.**

### Step 3 -- Version bump

If all checks pass:
1. Show current version from `manifest.json` and suggest next version (patch/minor/major).
2. Ask user to confirm version number.
3. Update `"version"` field in `manifest.json`. Also update `manifest-c.json` if it exists and has a version field. Both must match.
4. Confirm both files show the new version.

### Step 4 -- Build and test

Run `/build` to produce packages, then ask the user to load and smoke-test manually:
- Firefox: load `build/redirector-firefox.xpi`
- Chrome: extract `build/redirector-chrome.zip`, load unpacked

Do NOT tag or push until the user confirms the built package works.

### Step 5 -- Release checklist

```
RELEASE CHECKLIST (vX.Y.Z)

[ ] All integrity checks pass
[ ] Version bumped in manifest.json (and manifest-c.json if present)
[ ] Run /build
[ ] Install and smoke-test the built package manually
[ ] Confirm testing passed
[ ] git fetch origin && git status -- confirm local master is not behind origin
[ ] git tag vX.Y.Z && git push origin master && git push origin --tags
[ ] gh release create vX.Y.Z with release notes
[ ] Cherry-pick version bump commit to feature/test-instrumentation
    (No conflicts expected -- only touches manifest. After the pick, verify
    manifest.json still has redirectorLog.js and testHooks.js in background.scripts.)
```

Remind: "Do NOT push or tag until manual testing of the built package is confirmed."

## Traps

### Version bump cherry-pick to feature can overwrite test manifest

Manifest.json on master has background.scripts = ['js/redirect.js', 'js/background.js']. The feature version has the test scripts added. A cherry-pick of a version-bump commit that touches manifest.json can silently take master's version (without test scripts). After the pick: always verify `manifest.json` background.scripts still contains `redirectorLog.js` and `testHooks.js`.

### build.py creates manifest.json temporarily (for chrome/edge/opera)

`python3 build.py` reads `manifest.json` and applies per-browser patches to produce packages. It does not delete or overwrite `manifest.json` on disk. The manifest.json on master is the source of truth and is tracked.
