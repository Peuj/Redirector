---
description: Run or edit the redirector-test companion test suite -- loading instructions, invocation pattern, test reliability rules, syntax check. Use when running tests, interpreting results, or editing test-runner.js.
allowed-tools: Read Bash(node --check *) Bash(grep *)
---

## Instructions

**Prerequisite:** Redirector must be on `feature/test-instrumentation`. The `onMessageExternal` handlers required by the companion (testHooks.js) do not exist on master. Running against master will cause all ops to fail.

### Step 1 -- Check manifest state

Redirector (`C:/Personal/Redirector/manifest.json`) must have `redirectorLog.js` and `testHooks.js` in background.scripts:

```json
"background": {
    "scripts": ["js/redirect.js", "js/redirectorLog.js", "js/background.js", "js/testHooks.js"]
}
```

If missing: you are on master, or manifest.json was overwritten by a cherry-pick. Switch to `feature/test-instrumentation` and verify.

### Step 2 -- Load Redirector extension

**Firefox:** `about:debugging` -> This Firefox -> Load Temporary Add-on -> select `C:/Personal/Redirector/manifest.json`

**Chrome:** `C:/Personal/Redirector/manifest-c.json` must be copied to `manifest.json` first. Then `chrome://extensions` -> Developer mode -> Load unpacked -> select folder.

### Step 3 -- Load redirector-test companion

Companion lives at `C:/Personal/redirector-test/`.

**Firefox:** Copy `manifest-f.json` to `manifest.json` in that folder, then load via `about:debugging`.

**Chrome:** Copy `manifest-c.json` to `manifest.json`, then load unpacked.

### Step 4 -- Run tests

Click the redirector-test toolbar icon to open `test-runner.html`. Click "Run All".

Current counts:
- Unit tests (A-P): 85 tests. All run on both Firefox and Chrome.
- Integration tests (Q-U): 11 tests. Q1, Q3, S1-S3 are Firefox only; Q2, R1-R3, T1, U1 run on both.
- Integration tests (V): 6 tests. Chrome only (marked `browsers: "chrome"`).
- Total: 102 tests.

The popup count is authoritative -- if the count in this skill diverges from what the UI shows, trust the UI and update this skill. Note: the per-section unit test counts (A-P) sum to 84; there is one unlocated test -- verify the exact section when the companion runs next.

### Step 5 -- Interpret results

Firefox: all 99 tests should pass (V section skipped).
Chrome: Q1, Q3, S1-S3 are skipped; Q2, R1-R3, T1, U1, V1-V6 run and should pass.

A `[FAIL]` in a unit test (A-P) indicates a regression in `redirect.js` logic -- investigate `run-redirect-op` bridge and the specific op.

A `[FAIL]` in an integration test (Q-U) may indicate a timing issue, a background.js regression, or a testHooks issue. Check the error message for clues.

### Syntax check after editing test-runner.js

After every edit to `test-runner.js`, run immediately:

```
node --check C:/Personal/redirector-test/test-runner.js
```

Do NOT report the edit as done without running this check first. A dropped brace or missing `name:` line produces a syntax error only visible when the extension loads in the browser.

Same applies to other plain JS files in redirector-test if edited.

### Commit rule

Do NOT commit until the user confirms all tests pass. Wait for explicit confirmation.

---

## Test architecture

### run-redirect-op bridge

All `Redirect` class operations execute in Redirector's background via `chrome.runtime.onMessageExternal`. The companion never bundles `redirect.js`. Ops: `match`, `equals`, `toObject`, `validateRegexSafety`, `isValidRegex`, `updateExampleResult`.

`updateExampleResult` returns `{ validationError, exampleResult }` (NOT `{ error }`) to avoid collision with `_op`'s error-propagation convention (which throws when `r.error` is set).

### push-state-in-tab relay

Firefox extension pages do not expose `chrome.scripting`. The U1 integration test triggers `history.pushState` via the `push-state-in-tab` testHooks message, which relays `chrome.scripting.executeScript` through Redirector's background (which has the `scripting` permission).

### sourceUrl behavior

`match(config, url, sourceUrl)` sends `sourceUrl: sourceUrl || ""`. When `sourceUrl` is explicitly omitted from the `_op` payload, `getMatch` receives `undefined` and skips the source check (preview mode). Use `_op({ op: "match", config, url })` directly (not the `match` helper) to test this.

### justRedirected anti-loop

`background.js` blocks redirects for a URL redirected 3+ times within 3 seconds (threshold). The integration test S3 uses `waitForLog("background", "redirect-fired", ...)` rather than waiting for page loads, so all 3 navigations stay within the 3-second window.

### filter.types empty guard

When all rules have `appliesTo: ["history"]` only, `createFilter` returns `types: []`. Firefox's `addListener` threw on an empty types array, silently aborting the callback before `onHistoryStateUpdated` was registered. Guard added: `if (filter.types.length > 0)` in `setUpRedirectListener`.

### Chrome integration test rules

**Always use HTTPS URLs.** Chrome auto-upgrades `http://` to `https://` (HSTS / auto-upgrade) before DNR fires. A DNR rule with an `http://` filter never matches the upgraded request, and `waitForTabStaysAt("http://...")` fails because the tab actually lands at `https://...`. Use HTTPS in all tests marked `browsers: "both"` or `browsers: "chrome"`. Firefox-only tests (Q1, Q3, S1-S3) are exempt.

**`browsers` field:** Each test definition accepts an optional `browsers` string:
- `"both"` (default when omitted): runs on Firefox and Chrome
- `"firefox"`: skipped on Chrome with `[SKIP]`
- `"chrome"`: skipped on Firefox with `[SKIP]`

**getDNRRules helper:** `getDNRRules()` in `redirector-bridge.js` sends `get-dnr-rules` to Redirector's testHooks and returns the array from `chrome.declarativeNetRequest.getDynamicRules()`. Use it to assert which rules DNR actually registered (plain rules present, transform rules absent). Returns `[]` on Firefox (no DNR).

---

## Test sections reference

| Section | Tests | Description |
|---|---|---|
| A | 2 | Smoke: bridge connectivity |
| B | 7 | Wildcard matching |
| C | 5 | Regex matching |
| D | 6 | Capture group substitution (incl. $10+ multi-digit) |
| E | 13 | processMatches transforms (all 7 + regex usePatternForReplace) |
| F | 3 | Exclude patterns |
| G | 4 | Source patterns (incl. undefined sourceUrl preview mode) |
| H | 2 | Disabled rules |
| I | 4 | Custom variables (incl. $ in value) |
| J | 5 | validateRegexSafety + isValidRegex |
| K | 4 | equals/toObject (incl. allowLoops) |
| L | 8 | ui/help.html documented examples |
| M | 9 | README documented examples |
| N | 5 | URL pair helper |
| P | 7 | updateExampleResult |
| Q | 3 | Q1 Firefox: basic $1 capture; Q2 both: exact URL; Q3 Firefox: exclude pattern |
| R | 3 | Both: disabled per-rule, global disable, re-enable |
| S | 3 | Firefox: ignoreNextRequest, allowLoops chaining, justRedirected 3x block |
| T | 1 | Both: appliesTo type filtering |
| U | 1 | Both: SPA pushState redirect |
| V | 6 | Chrome: transforms skipped (urlEncode, all 6 types), plain wildcard fires, regex type fires, exclude pattern ignored (limitation) |
