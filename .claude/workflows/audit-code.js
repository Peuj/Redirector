export const meta = {
  name: 'audit-code',
  description: 'Full-spectrum Redirector audit: all 12 Redirector-specific grep patterns + 8 broad dimensions (architecture, performance, correctness, dead code, duplicates, simplification, memory, security/best-practices) — all run in parallel, one unified report.',
  whenToUse: 'Full quality review. For a focused Redirector-specific correctness check only, use /redirector-audit instead.',
  phases: [
    { title: 'Scan', detail: 'All 12 Redirector grep checks + 8 broad audit dimensions run concurrently' },
    { title: 'Analyze', detail: 'Contextual analysis of grep findings' },
    { title: 'Report', detail: 'Single unified findings report across all dimensions' },
  ],
}

const ROOT = 'c:/Personal/Redirector'

// ── Schemas ───────────────────────────────────────────────────────────────────

const GREP_SCHEMA = {
  type: 'object',
  required: ['patternClass', 'findings'],
  properties: {
    patternClass: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['file', 'line', 'snippet'],
        properties: {
          file: { type: 'string' },
          line: { type: 'number' },
          snippet: { type: 'string' },
        },
      },
    },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['patternClass', 'verdicts'],
  properties: {
    patternClass: { type: 'string' },
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        required: ['file', 'line', 'verdict', 'severity', 'explanation'],
        properties: {
          file: { type: 'string' },
          line: { type: 'number' },
          verdict: { enum: ['real_bug', 'acceptable', 'needs_review'] },
          severity: { enum: ['HIGH', 'MEDIUM', 'LOW', 'NONE'] },
          explanation: { type: 'string' },
        },
      },
    },
  },
}

const BROAD_SCHEMA = {
  type: 'object',
  required: ['dimension', 'findings'],
  properties: {
    dimension: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['file', 'line', 'severity', 'summary', 'recommendation'],
        properties: {
          file: { type: 'string' },
          line: { type: 'number' },
          severity: { enum: ['HIGH', 'MEDIUM', 'LOW'] },
          summary: { type: 'string' },
          recommendation: { type: 'string' },
        },
      },
    },
  },
}

// ── Phase 1: all scans run concurrently ──────────────────────────────────────
// Agents 1-12: Redirector grep patterns (identical to /redirector-audit)
// Agents 13-20: broad audit dimensions

phase('Scan')

const allScanResults = await parallel([

  // ── Redirector grep patterns ─────────────────────────────────────────────

  () => agent(
    `In ${ROOT}/js/background.js, find the chrome.runtime.onMessage.addListener callback.
     Use: grep -n "onMessage\\|addListener\\|return true\\|return false\\|sendResponse" ${ROOT}/js/background.js
     Read the full listener body. Check every if/else branch:
     - Every branch that calls sendResponse asynchronously must fall through to "return true".
     - The unknown-type else branch must explicitly "return false".
     Verify no async branch accidentally reaches the else-return-false path or skips "return true".
     Return patternClass: "message-listener-return-true"`,
    { label: 'grep:message-return', phase: 'Scan', schema: GREP_SCHEMA }
  ),

  () => agent(
    `In ${ROOT}/js, search for how Redirector warns users when a processMatches rule is silently skipped on Chrome DNR.
     Use: grep -rn --include="*.js" "processMatches\\|hasTransform\\|dnr.*skip\\|chrome.*warning" ${ROOT}/js | grep -v node_modules
     Also: grep -rn --include="*.js" "isFirefox\\|warning\\|not.*supported" ${ROOT}/js | grep -v node_modules
     Also: grep -n "processMatches\\|warning\\|chrome\\|transform" ${ROOT}/ui/redirector.html
     Context: updateDNRRules() silently skips rules where processMatches !== "noProcessing".
     Is there a visible UI warning for Chrome users that their rule won't fire?
     Return patternClass: "dnr-processmatch-warning-coverage"`,
    { label: 'grep:dnr-warning', phase: 'Scan', schema: GREP_SCHEMA }
  ),

  () => agent(
    `In ${ROOT}/js/redirect.js, find the _preparePattern method.
     Use: grep -n "_preparePattern\\|replace\\|escape\\|wildcard" ${ROOT}/js/redirect.js
     Read the full method. The wildcard-to-regex conversion escapes special chars before mapping * to (.*?).
     Standard metacharacters needing escaping: . * + ? ^ $ { } [ ] | ( ) \\
     The * is handled separately. Verify the escape character class covers all others.
     Return patternClass: "wildcard-escape-completeness"`,
    { label: 'grep:wildcard-escape', phase: 'Scan', schema: GREP_SCHEMA }
  ),

  () => agent(
    `In ${ROOT}/js/background.js, find the updateDNRRules function.
     Use: grep -n "MAX_NUMBER_OF_DYNAMIC_RULES\\|getDynamicRules\\|addRules\\|newRules\\|updateDynamicRules" ${ROOT}/js/background.js
     Read the full function. Is there a guard checking newRules.length against MAX_NUMBER_OF_DYNAMIC_RULES (5000)?
     Without a guard, exceeding the limit throws inside try/catch with no user feedback about dropped rules.
     Return patternClass: "dnr-rule-count-no-guard"`,
    { label: 'grep:dnr-count', phase: 'Scan', schema: GREP_SCHEMA }
  ),

  () => agent(
    `In ${ROOT}/js/background.js, find the checkHistoryStateRedirects function and all chrome.tabs.update calls.
     Use: grep -n "checkHistoryStateRedirects\\|tabs.update\\|\\.catch\\|try {\\|catch (" ${ROOT}/js/background.js
     Read checkHistoryStateRedirects. chrome.tabs.update returns a Promise.
     Is there a .catch() or try/catch? The tab could be closed between the event and the update call.
     Return patternClass: "history-tabs-update-no-catch"`,
    { label: 'grep:history-catch', phase: 'Scan', schema: GREP_SCHEMA }
  ),

  () => agent(
    `In ${ROOT}/js/background.js, find all reads and writes to the ignoreNextRequest object.
     Use: grep -n "ignoreNextRequest" ${ROOT}/js/background.js
     Read every usage. The map is keyed by URL only (not URL+requestType).
     Check whether cross-type suppression (a sub_frame or script request consuming a main_frame's ignore entry) is intentional.
     Return patternClass: "ignore-next-request-url-keyed-only"`,
    { label: 'grep:ignore-keying', phase: 'Scan', schema: GREP_SCHEMA }
  ),

  () => agent(
    `In ${ROOT}/js/background.js, find all chrome.alarms usage for "cleanup-loop-caches".
     Use: grep -n "cleanup-loop-caches\\|alarms.get\\|alarms.create\\|onAlarm\\|onInstalled\\|onStartup" ${ROOT}/js/background.js
     On Chrome MV3, a SW restart does not fire onInstalled or onStartup. Is the alarm ensured to exist in the main init block too?
     Without this, after a SW restart the cleanup alarm may be missing until the next browser startup.
     Return patternClass: "loop-cache-alarm-re-registration"`,
    { label: 'grep:alarm-race', phase: 'Scan', schema: GREP_SCHEMA }
  ),

  () => agent(
    `In ${ROOT}/js/background.js, find the isRegexSupported check in updateDNRRules.
     Use: grep -n "isRegexSupported\\|isSupported\\|reason\\|skipping\\|log.*DNR" ${ROOT}/js/background.js
     Also: grep -rn --include="*.js" "dnr.*unsupported\\|rule.*skipped\\|warn.*chrome" ${ROOT}/js | grep -v node_modules
     When isRegexSupported returns false, is there a user-visible warning? Silent drops are undiagnosable.
     Return patternClass: "dnr-unsupported-regex-silent"`,
    { label: 'grep:dnr-unsupported', phase: 'Scan', schema: GREP_SCHEMA }
  ),

  () => agent(
    `In ${ROOT}/js/background.js, find the DNR_RESOURCE_TYPES Set definition.
     Use: grep -n "DNR_RESOURCE_TYPES\\|history\\|new Set" ${ROOT}/js/background.js
     "history" is a Redirector-internal synthetic type for SPA navigation. It must NOT be in DNR_RESOURCE_TYPES.
     If present, updateDNRRules would send resourceType: ["history"] to Chrome DNR, which is invalid.
     Return patternClass: "history-type-not-in-dnr"`,
    { label: 'grep:history-dnr', phase: 'Scan', schema: GREP_SCHEMA }
  ),

  () => agent(
    `Read both ${ROOT}/manifest.json and ${ROOT}/manifest-c.json.
     Use: grep -n "scripting\\|contextMenus\\|permissions\\|clipboard" ${ROOT}/manifest.json ${ROOT}/manifest-c.json
     background.js uses chrome.scripting.executeScript (needs "scripting") and chrome.contextMenus (needs "contextMenus").
     Verify both permissions are present in BOTH manifests.
     Return patternClass: "scripting-permission-manifest"`,
    { label: 'grep:permissions', phase: 'Scan', schema: GREP_SCHEMA }
  ),

  () => agent(
    `In ${ROOT}/js/background.js, find the "toggle-sync" message handler and all reads/writes of storageArea.
     Use: grep -n "storageArea\\|toggle-sync\\|isSyncEnabled\\|storage.sync\\|storage.local" ${ROOT}/js/background.js
     During toggle-sync, storageArea is committed only after async migration succeeds.
     Concurrent save-redirects messages during the migration window use the wrong storageArea.
     Is there a guard preventing concurrent storage operations during migration?
     Return patternClass: "sync-storage-area-race"`,
    { label: 'grep:sync-race', phase: 'Scan', schema: GREP_SCHEMA }
  ),

  () => agent(
    `In ${ROOT}/js/background.js, find the regexSubstitution conversion in updateDNRRules.
     Use: grep -n "regexSubstitution\\|replace.*\\\\$\\|\\\\\\\\\\$1" ${ROOT}/js/background.js
     The conversion rObj.redirectUrl.replace(/\\$(\d+)/g, "\\\\$1") converts $N to \\N for DNR.
     Chrome DNR only supports \\0-\\9 (single digit). $10+ produces \\10 which DNR misinterprets as \\1 + "0".
     Is there a guard capping N at 9 or rejecting redirect URLs with 10+ capture group references?
     Return patternClass: "dnr-capture-group-over-nine"`,
    { label: 'grep:dnr-capture', phase: 'Scan', schema: GREP_SCHEMA }
  ),

  // ── Broad audit dimensions ───────────────────────────────────────────────

  () => agent(
    `You are doing an ARCHITECTURE audit of the Redirector browser extension at ${ROOT}.
Read these files in full: js/redirect.js, js/background.js, js/util.js, js/redirectorpage.js, js/editredirect.js, js/importexport.js, js/stub.js.

Module responsibilities:
- redirect.js: Redirect class — pattern compilation, matching, capture group substitution, processMatches transforms. No browser API calls.
- background.js: Event wiring — webRequest/DNR setup, storage listener, message dispatch, context menu, loop detection.
- util.js: Data binding, DOM helpers, showMessage. No browser API calls.
- redirectorpage.js: Settings page UI — render list, save/load, checkbox grouping, drag/drop.
- editredirect.js: Edit/create redirect dialog logic.
- importexport.js: File import (JSON parse + validate) and export (JSON serialize).
- stub.js: Chrome API stubs for local file-server development of the settings UI.

Check:
- Responsibility leaks: background.js logic in UI files, Redirect class making browser API calls, util.js touching storage.
- Coupling: direct access to REDIRECTS array or Redirect internals across files.
- Layering violations: UI files calling background functions instead of going through chrome.runtime.sendMessage.
- Abstraction gaps: identical or near-identical logic in 3+ places that should be a shared helper.
- Over-abstraction: helpers with a single call site.

Return dimension: "architecture". For each finding: file, line, severity, summary, recommendation.`,
    { label: 'broad:architecture', phase: 'Scan', schema: BROAD_SCHEMA }
  ),

  () => agent(
    `You are doing a PERFORMANCE audit of the Redirector browser extension at ${ROOT}.
Read these files in full: js/redirect.js, js/background.js, js/redirectorpage.js, js/editredirect.js.

Check:
- Pattern compilation on every request: Redirect.compile() is guarded by "if (!this._rxInclude) this.compile()" in getMatch(). But compile() is also called explicitly in createPartitionedRedirects(). Verify there is no double-compilation.
- DNR rebuild cost: updateDNRRules calls getDynamicRules() then removes ALL rules and re-adds them. Called on every storage change. Could partial updates be used instead?
- partitionedRedirects rebuild: createPartitionedRedirects() iterates all rules and compiles each. For large rule sets, this fires on every storage change (monitorChanges). Is there debouncing?
- UI render performance: in redirectorpage.js, how is the redirect list rendered? Are DOM operations batched or is there per-rule DOM work in a loop without chunking?
- Sequential awaits: async functions with await A; await B; where A and B are independent (could be Promise.all).
- High-frequency events: onBeforeRequest fires on every HTTP request. Is checkRedirects lean enough (no allocations, no regex compilation)?

Return dimension: "performance". For each finding: file, line, severity, summary, recommendation.`,
    { label: 'broad:performance', phase: 'Scan', schema: BROAD_SCHEMA }
  ),

  () => agent(
    `You are doing a CORRECTNESS audit of the Redirector browser extension at ${ROOT}.
Read these files in full: js/redirect.js, js/background.js, js/importexport.js.

Focus on bugs NOT covered by mechanical grep patterns. Check:
- Edge cases in _preparePattern: empty string input, pattern that is only "*", pattern with consecutive "**".
- Capture group substitution: $0 should be the full match. Verify transformed[0] is the full match, not the first capture.
- Wildcard anchor: _preparePattern adds ^ and $ anchors. Verify this correctly handles patterns with protocol (http://*) vs domain-only (*example.com*).
- excludePattern vs includePattern order: in getMatch(), the include check happens first. If include matches but exclude also matches, the exclude wins. Verify the logic is correct.
- appliesTo empty after constructor: constructor defaults empty appliesTo to ["main_frame"]. But if an imported rule has appliesTo: [] after validation, could it cause a DNR error?
- sourcePattern with empty initiator: if details.initiator is "" and sourcePattern is set, _sourceMatch("") returns false — rule silently doesn't fire. Is this the right semantics?
- processMatches "replace" with empty replaceFrom: updateExampleResult() checks for this and sets an error. But what does _applyTransform do if replaceFrom is "" at runtime?
- Loop detection: justRedirected counts are per URL. Two different rules redirecting the same URL each time would trigger the loop detector after 3 redirects total, even if they are legitimately different final destinations.

Return dimension: "correctness". For each finding: file, line, severity, summary, recommendation.`,
    { label: 'broad:correctness', phase: 'Scan', schema: BROAD_SCHEMA }
  ),

  () => agent(
    `You are doing a DEAD CODE audit of the Redirector browser extension at ${ROOT}.
Read all .js files, all HTML files, and all CSS files.

Check:
- Fields in Redirect.toObject() that are saved to storage but never read back (e.g. exampleResult is excluded from toObject but exampleUrl is included — is exampleUrl used by background.js?).
- patternDesc field: stored and loaded, but is it ever displayed or used for matching logic?
- stub.js stubs: are all stubbed chrome.* methods actually called during local file-server development of ui/redirector.html? Any stub for a method that is never called?
- CSS selectors defined but no corresponding HTML element or JS className usage.
- HTML element IDs queried with getElementById or querySelector that no longer exist in the HTML.
- Multi-line commented-out code blocks (not explanatory comments).
- Redirect.customVariables: set from storage, used in _includeMatch. Is it always populated before rules run?
- The rlog() alias in background.js: is it used anywhere in production code paths, or only in test-only paths?

Return dimension: "dead-code". For each finding: file, line, severity, summary, recommendation.`,
    { label: 'broad:dead-code', phase: 'Scan', schema: BROAD_SCHEMA }
  ),

  () => agent(
    `You are doing a DUPLICATE CODE audit of the Redirector browser extension at ${ROOT}.
Read js/redirect.js, js/background.js, js/redirectorpage.js, js/editredirect.js, js/importexport.js.

Check:
- Pattern compilation duplication: _preparePattern is called inside Redirect.compile() (for all four pattern fields) AND directly in updateDNRRules() for the includePattern. Is the same logic being applied consistently?
- appliesTo filtering: createFilter() filters by chrome.webRequest.ResourceType, updateDNRRules() filters by DNR_RESOURCE_TYPES. Are there rules that pass one filter but not the other in unexpected ways?
- Redirect construction: both importexport.js and redirectorpage.js call new Redirect(obj). Is there duplicated validation logic?
- Storage read patterns: getRedirects() in background.js handles managed storage first. Does the UI also read managed storage, or does it always go through the message channel?
- Error message strings: are error messages for quota exceeded, invalid JSON, etc. defined in multiple places?
- The redirectKey() function in importexport.js builds a canonical key for duplicate detection. Is a similar key used anywhere else for equality checks?

Return dimension: "duplicates". For each finding: file, line, severity, summary, recommendation.`,
    { label: 'broad:duplicates', phase: 'Scan', schema: BROAD_SCHEMA }
  ),

  () => agent(
    `You are doing a SIMPLIFICATION audit of the Redirector browser extension at ${ROOT}.
Read all .js source files.

Check:
- Unnecessary Promise wrapping: new Promise((resolve) => { chrome.foo(args, resolve); }) where chrome.foo returns a Promise in MV3.
- getRedirects() uses a callback pattern — could it be a Promise for consistency with async/await usage elsewhere?
- Collapsible conditionals: deeply nested if/else that could flatten with early returns.
- Pointless intermediates: const x = expr; return x; → return expr.
- async functions without await: functions declared async that never actually use await.
- Redundant boolean coercions: Boolean(x) or !!x where a truthiness check suffices.
- The isFirefox / isOpera flags: are they evaluated once at module scope (correct) or re-evaluated inside hot functions?
- The rlog() no-op alias: the pattern "const rlog = typeof redirectorLog !== 'undefined' ? redirectorLog : () => {}" — is this the simplest guard for optional logging?

Return dimension: "simplification". For each finding: file, line, severity, summary, recommendation.`,
    { label: 'broad:simplification', phase: 'Scan', schema: BROAD_SCHEMA }
  ),

  () => agent(
    `You are doing a MEMORY audit of the Redirector browser extension at ${ROOT}.
Read js/background.js, js/redirect.js, js/redirectorLog.js.

Check:
- partitionedRedirects: rebuilt on every storage change. Previous compiled Redirect objects (with compiled RegExp) are discarded. Any lingering references that prevent GC?
- ignoreNextRequest: keyed by URL, entries deleted after first match. Cleanup alarm fires every 1 minute with a 30-second threshold. Between alarm fires, how many entries can accumulate in a heavy-redirect scenario?
- justRedirected: similar accumulation analysis. Threshold is 3 seconds, alarm fires every 1 minute — entries can be stale for up to 1 minute before cleanup.
- redirectorLog (redirectorLog.js): if logging is enabled, does it accumulate an unbounded array of log entries? Is there a cap?
- Listener accumulation: setUpRedirectListener() removes and re-adds webRequest and webNavigation listeners. On Chrome, it also calls updateDNRRules. Are there any listeners registered inside setUpRedirectListener that stack up on repeated calls?
- Redirect.customVariables: a static class property assigned from storage. In a long session with many storage updates, could this hold large data?

Return dimension: "memory". For each finding: file, line, severity, summary, recommendation.`,
    { label: 'broad:memory', phase: 'Scan', schema: BROAD_SCHEMA }
  ),

  () => agent(
    `You are doing a SECURITY and BEST PRACTICES audit of the Redirector browser extension at ${ROOT}.
Read: manifest.json, manifest-c.json, js/background.js, js/redirectorpage.js, js/editredirect.js, js/importexport.js, js/util.js, ui/redirector.html, and all CSS files.

Security:
- innerHTML with user data: any element.innerHTML = value where value derives from redirect descriptions, URLs, or user-typed patterns. These can contain arbitrary HTML. Prefer textContent or sanitisation.
- Open redirect: the extension's purpose IS to redirect, but check whether the context menu "Copy with Redirect" or the redirect rules themselves could be abused to redirect the user to a malicious URL without warning.
- Message handler validation: does the onMessage handler validate that request.redirects (in save-redirects) is a proper array before saving? A crafted message could inject malformed data.
- Permissions minimisation: check manifest permissions for any that are broader than needed (e.g. host permissions, optional_permissions).
- CSP policy: is content_security_policy present and restrictive (no unsafe-eval, no unsafe-inline)?
- eval() / new Function() / dynamic script injection: any occurrence.

Best practices — JS: var usage, == instead of ===, unhandled Promise rejections, console.log in non-error paths.
Best practices — HTML: div/span with onclick instead of button, missing aria-label on unlabelled interactive controls, inline style= attributes.
Best practices — CSS: magic numbers without comment, duplicate rules, !important without justification.
Best practices — Extension API: deprecated MV2 APIs (chrome.browserAction), incorrect chrome.* vs browser.* usage, service worker DOM access.

Note: testHooks.js is stripped from ALL production builds by build.py — do not flag its patterns as production issues.

Return dimension: "security-and-best-practices". For each finding: file, line, severity, summary, recommendation.`,
    { label: 'broad:security', phase: 'Scan', schema: BROAD_SCHEMA }
  ),

])

// Split results by index: 0-11 = grep, 12-19 = broad
const grepResults = allScanResults.slice(0, 12)
const broadResults = allScanResults.slice(12)

// ── Phase 2: analyze grep findings in context ────────────────────────────────

phase('Analyze')

const nonEmpty = grepResults.filter(Boolean).filter(r => r.findings && r.findings.length > 0)
log(`${nonEmpty.length} Redirector pattern class(es) have grep findings — analyzing in context`)
log(`${broadResults.filter(r => r && r.findings && r.findings.length > 0).length} broad dimension(s) have findings`)

const grepVerdicts = await pipeline(
  nonEmpty,
  async (result) => {
    if (!result || result.findings.length === 0) return null
    const findingsSummary = result.findings
      .slice(0, 20)
      .map(f => `  ${f.file}:${f.line} — ${f.snippet.trim()}`)
      .join('\n')

    return agent(
      `You are reviewing the Redirector browser extension codebase at ${ROOT}.

Pattern class: ${result.patternClass}
Findings (${result.findings.length} total, showing first 20):
${findingsSummary}

For EACH finding, read the surrounding function in the actual file to understand context, then give a verdict:
- "real_bug": genuine defect
- "acceptable": code is correct despite matching the pattern
- "needs_review": uncertain — needs human eyes

Redirector context:
- background.js is dual-mode: Firefox uses webRequest.onBeforeRequest (blocking), Chrome/Edge uses declarativeNetRequest (DNR). isFirefox flag switches at runtime.
- updateDNRRules() silently skips rules where processMatches !== "noProcessing" — intentional, DNR only supports regex substitution. A UI warning was added in a recent commit (check editredirect.js/redirectorpage.js).
- The "history" synthetic type handles SPA navigation via onHistoryStateUpdated → chrome.tabs.update. It must not appear in DNR_RESOURCE_TYPES.
- partitionedRedirects and loop-detection maps (ignoreNextRequest, justRedirected) are module-scope; reset on SW restart.
- The onMessage listener has "return true" after the if/else chain. The unknown-type else branch returns false before that line — this is correct and intentional.
- storageArea defaults to chrome.storage.local; reassigned to chrome.storage.sync only if isSyncEnabled is true.
- DNR regex substitution supports \\0-\\9 only. Redirector's $0-$9 maps correctly; $10+ would be wrong but very rare.
- _preparePattern anchors wildcard patterns with ^ and $; escapes regex metacharacters except *; maps * to (.*?).
- testHooks.js is stripped from all production builds by build.py — do not flag its patterns as production issues.
- The rlog() alias resolves to a no-op in production (redirectorLog.js is stripped from non-test builds).

Read source files as needed, then return your analysis.`,
      { label: `analyze:${result.patternClass}`, phase: 'Analyze', schema: VERDICT_SCHEMA }
    )
  }
)

// ── Phase 3: unified report ───────────────────────────────────────────────────

phase('Report')

const confirmedGrep = grepVerdicts
  .filter(Boolean)
  .flatMap(v => v ? v.verdicts : [])
  .filter(v => v.verdict === 'real_bug' || v.verdict === 'needs_review')

const broadFindings = broadResults
  .filter(Boolean)
  .flatMap(r => (r.findings || []).map(f => ({ ...f, dimension: r.dimension })))

const report = await agent(
  `You are producing the final report of a full-spectrum Redirector extension audit.

## Redirector grep pattern findings (real_bug or needs_review only):
${JSON.stringify(confirmedGrep, null, 2)}

## Broad audit findings (architecture, performance, correctness, dead code, duplicates, simplification, memory, security/best-practices):
${JSON.stringify(broadFindings, null, 2)}

Produce a markdown report with these sections:

1. **Executive Summary** — 2-3 sentences on overall health.

2. **Critical Findings (HIGH severity)** — must fix before next release.
   Table: Category | File:Line | Issue | Recommended Fix

3. **Findings by Dimension** — one table per dimension that has findings.
   Columns: File:Line | Severity | Issue | Recommendation
   Dimensions: Redirector Patterns, Architecture, Performance, Correctness, Dead Code, Duplicates, Simplification, Memory, Security & Best Practices
   Omit dimensions with zero findings.

4. **Quick Wins** — LOW-severity items that are safe, fast, and high-value. Bulleted list.

5. **Scope** — bullet list of all files read and all dimensions checked.

Severity: HIGH = incorrect behaviour / security / data loss. MEDIUM = reliability risk or silent failure. LOW = code quality / style.

6. **Out of scope** — this audit covers JS code quality only. It does not test popup/settings page visual rendering, CSS specificity interactions, or behavioral UI flows (toggle states, form interactions, etc.). For those, run **/ui-audit**.

Notes to apply:
- testHooks.js is stripped from all production builds by build.py — do not flag its patterns as production issues.
- The rlog() alias is a no-op in production — do not flag rlog() calls as console.log leaks.
- On Firefox, webRequest blocking handles all redirects; on Chrome/Edge, DNR handles non-processMatches rules. Rules with processMatches only fire on Firefox.`,
  { label: 'report:final', phase: 'Report' }
)

return report
