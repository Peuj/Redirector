# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

**Redirector** is a browser extension (Firefox, Chrome, Edge, Opera) that automatically redirects URLs based on user-defined regex or wildcard rules. It is a **vanilla JS, no-framework, Manifest V2** extension. No TypeScript, no bundler, no test suite.

## Linting

```bash
npm run lint        # ESLint (JS)
npm run lint:fix    # ESLint with auto-fix
npm run lint:css    # Stylelint (CSS)
npm run lint:css:fix
npm run lint:html   # HTMLHint (HTML)
npm run lint:all    # All three linters in sequence
```

## Build

```bash
python3 build.py
```

Outputs browser-specific packages to `build/`:
- `redirector-firefox.xpi`
- `redirector-chrome.zip`
- `redirector-edge.zip`
- `redirector-opera.zip` (or `.nex` if `extension-certificate.pem` exists)

Each build applies per-browser manifest patches (e.g., removes `applications.gecko` for Chrome/Edge, adjusts `options_ui.page` for Opera). The `.pem` file is gitignored.

To sign an Opera `.nex` manually:
```bash
bash nex-build.sh
```

## Architecture

### Background (persistent page)
Two scripts load in order per `manifest.json`: `js/redirect.js` then `js/background.js`.

- **`js/redirect.js`** — The `Redirect` class. Handles pattern compilation (wildcard `W` vs regex `R`), URL matching, capture-group substitution (`$1`, `$2`, ...), and `processMatches` transforms (`urlEncode`, `urlDecode`, `base64decode`, etc.).
- **`js/background.js`** — Registers `chrome.webRequest.onBeforeRequest` (blocking) and `chrome.webNavigation.onHistoryStateUpdated` (for SPAs like YouTube/Twitter). Maintains two anti-loop structures: `ignoreNextRequest` (URL → timestamp, prevents redirect target from being re-redirected) and `justRedirected` (stops loops when a URL is redirected 3+ times within 3 seconds). Listens for storage changes to rebuild partitioned rule sets.

### Settings page (`redirector.html`)
Loads JS in this order: `stub.js` → `util.js` → `redirect.js` → `redirectorpage.js` → `editredirect.js` → `importexport.js`.

### Custom data binding (`js/util.js`)
No external framework. `dataBind(el, dataObject)` reads HTML attributes:
- `data-bind="prop"` — binds `.value`, `.checked`, `.textContent`, or checkbox arrays
- `data-show="prop"` / `data-show="!prop"` — show/hide
- `data-disabled="prop"` — disables and adds `.disabled` class
- `data-class="className:prop"` — conditional CSS class
- `data-action="functionName"` — delegated click events on `.redirect-rows`

### Storage
- Default: `chrome.storage.local` (5 MB limit)
- Optional sync: `chrome.storage.sync` (hard limit of 8,192 bytes for the `redirects` key)
- Keys: `redirects` (array), `disabled`, `logging`, `enableNotifications`, `isSyncEnabled`

### Local development
`js/stub.js` stubs the Chrome extension API so `redirector.html` can be opened directly via a local file server without loading the extension. This is the intended way to develop the settings UI without installing the extension.

## Core Data Shape

```javascript
{
  description: string,
  exampleUrl: string,
  exampleResult: string,         // computed, not stored
  error: null | string,          // validation error
  includePattern: string,
  excludePattern: string,
  patternDesc: string,
  redirectUrl: string,           // may use $1, $2, ...
  patternType: 'W' | 'R',        // Wildcard or Regex
  processMatches: 'noProcessing' | 'urlEncode' | 'urlDecode' | 'doubleUrlDecode' | 'base64decode',
  disabled: boolean,
  grouped: boolean,              // session-only: tracks checkbox selection state; always false on load
  appliesTo: string[]            // request types: main_frame, sub_frame, script, image, etc.
}
```
