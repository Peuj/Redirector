---
description: Full UI consistency audit for the Redirector extension. Covers CSS tokens, typography, spacing, color, focus, accessibility, HTML semantics, dead code, and behavioral interaction testing.
allowed-tools: Read Edit Write Bash(npm *) Glob Grep
---

## Instructions

Read every CSS and HTML file in full before writing any findings. Goal: a fully consistent, accessible UI.

**Important:** You are not constrained by existing code. If the right fix requires restructuring a component, renaming a class, changing an element type, or rewriting a CSS section from scratch, propose it. Do not preserve existing patterns just because they are there. Propose the correct solution, then implement it once the user approves.

---

## Extension UI surfaces

| File | CSS | Purpose |
|---|---|---|
| `ui/redirector.html` | `css/redirector.css` | Main settings page |
| `ui/popup.html` | `css/popup.css` | Browser toolbar popup |
| `ui/help.html` | `css/help.css` | Help/documentation page |
| `ui/icon.html` | inline | Icon generator (dev utility) |
| `promo/tiles.html` | inline | Web store tiles (dev utility) |

All CSS files import `css/tokens.css` which holds every design token (colors, radii, shadows, typography, spacing).

**Script loading order** (important for JS-only changes): `stub.js` -> `util.js` -> `redirect.js` -> `redirectorpage.js` -> `editredirect.js` -> `importexport.js`. Do not reorder these.

**Custom data binding** (`js/util.js`): HTML uses `data-bind`, `data-show`, `data-disabled`, `data-class`, `data-action` attributes. These are processed at runtime -- do not remove them when refactoring HTML.

**No framework, no bundler.** Vanilla JS, Manifest V2. No TypeScript, no build step for JS/CSS.

---

## Step 1 -- Read everything

Read all CSS/HTML files completely before forming any finding:

1. `css/tokens.css`
2. `css/redirector.css` + `ui/redirector.html`
3. `css/popup.css` + `ui/popup.html`
4. `css/help.css` + `ui/help.html`

---

## Step 2 -- Audit checklist

Work through every category. For each issue found, note the file, line, current value, and proposed fix.

### Typography

- [ ] **Font family** -- consistent across all surfaces? One token (`--font`), one declaration per file.
- [ ] **Font size scale** -- sizes form a coherent scale (e.g., 12/13/14/15/17/22/28)? Any arbitrary one-off values?
- [ ] **Body font size** -- comfortably readable (14-15px minimum)?
- [ ] **Heading hierarchy** -- `h1->h2->h3` sequence reflects both visual and semantic structure. No skipped levels. No heading used purely for visual sizing.
- [ ] **Line height** -- body text has at least `line-height: 1.5`. Long-form text (`ui/help.html`) ideally 1.6.
- [ ] **Letter spacing** -- only on headings or all-caps labels; never on body text.
- [ ] **Text transform** -- uppercase labels have `letter-spacing` to compensate for reduced legibility.
- [ ] **Font weight** -- limited to 2-3 weights (400, 500/600, 700). No arbitrary weights.
- [ ] **Redundant font-size overrides** -- any `font-size` that just repeats the inherited value?

### Color and tokens

- [ ] **Hardcoded values** -- any hex/rgb color, shadow, or radius appearing more than once anywhere across all CSS files must be a token in `tokens.css`.
- [ ] **Semantic token names** -- tokens use semantic names (`--text`, `--text-muted`, `--surface`, `--border`) not cosmetic names (`--gray-200`).
- [ ] **Dark mode coverage** -- every color token has a dark-mode override in the `@media (prefers-color-scheme: dark)` block inside `tokens.css`. Dark-mode overrides scattered in component CSS files should be moved to `tokens.css` as token overrides, not component overrides.
- [ ] **`white`/`black` keywords** -- replace with `#fff`/`#000` or tokens.
- [ ] **Opacity for muted text** -- muted text uses `var(--text-muted)`, not `opacity` on the element (which fades borders and backgrounds too).

### Spacing and layout

- [ ] **Spacing scale** -- values are multiples of 4px or 8px. Flag arbitrary values (`7px`, `13px`, `17px`).
- [ ] **Dialog padding** -- all three dialogs in `ui/redirector.html` (`#edit-redirect-form`, `#delete-redirect-form`, `#delete-all-form`) have the same internal padding.
- [ ] **Button padding** -- all buttons of the same size class (`.btn.small`, `.btn.medium`, `.btn.large`) have identical padding across all pages.
- [ ] **Form grid alignment** -- label column width is consistent throughout the edit form.

### Borders and radius

- [ ] **Radius tokens** -- all `border-radius` values use `--r-xs`, `--r`, `--r-lg`. No hardcoded `px` values.
- [ ] **Consistent radius per type** -- buttons and inputs use the same token.
- [ ] **Border color** -- all decorative borders use `var(--border)`. No hardcoded colors.

### Shadows

- [ ] **Shadow tokens** -- all `box-shadow` decorative shadows use `--shadow-xs`, `--shadow-sm`, `--shadow-md`. No inline `0 2px 4px rgba(...)`.
- [ ] **Elevation consistency** -- flat surfaces: no shadow. Raised panels (`#variables-section`): `--shadow-sm`. Modals/dialogs: `--shadow-md` or higher.

### Focus and interactivity

- [ ] **Focus ring on every interactive element** -- every `<button>`, `<input>`, `<select>`, `<textarea>`, `<a>`, and wrapping `<label>` has a visible `:focus-visible` style.
- [ ] **Two-pattern rule** -- form controls use `outline: none; box-shadow: var(--focus-ring)`. Inline text-action buttons (`.btn-link`) and links use `outline: 2px solid var(--blue); outline-offset: 2px; border-radius: var(--r-xs)`. Never mixed.
- [ ] **`--focus-ring` token** -- the `box-shadow` focus ring value is the `--focus-ring` token (defined with dark-mode override in `tokens.css`). No hardcoded `rgb()` values for focus rings.
- [ ] **No bare `outline: none`** -- every element that suppresses the default outline has an explicit replacement.
- [ ] **Hover transitions** -- background, color, and opacity changes on hover use `transition`. No instantaneous snaps.
- [ ] **Transition consistency** -- all equivalent elements use the same duration (`0.15s`). No mix of `0.1s`/`0.2s`/`150ms` for the same element type.
- [ ] **Cursor** -- `<label>` wrappers and custom toggles have `cursor: pointer`. Disabled states have `cursor: not-allowed` or `cursor: default`.

### Buttons

- [ ] **Element semantics** -- every clickable action is a `<button>`. `<a>` is reserved for navigation to a URL (including `download` links). No `<div>` or `<span>` click handlers.
- [ ] **`.btn-link` resets** -- every `<button>` styled as inline text (`.btn-link`) has: `background: none; border: none; padding: 0; font-family: var(--font);`.
- [ ] **Size class parity** -- `.btn.small`, `.btn.medium`, `.btn.large` produce identical dimensions on all pages.
- [ ] **Color semantics** -- green = save/confirm, red = destructive, blue = navigate/neutral action, grey = secondary/cancel. Consistent across all three pages.
- [ ] **`font-family` declaration** -- `button { font-family: var(--font); }` present in every CSS file (browsers don't inherit it by default).

### HTML semantics

- [ ] **Heading levels** -- document order `h1->h2->h3`, no skipped levels, no heading used for visual size only.
- [ ] **`<label>` usage** -- `<label>` only wraps or targets form controls. Pure display text (like field-key labels in delete dialogs) uses `<span>`.
- [ ] **No deprecated `<a name="...">`** -- replace with `id` on the nearest meaningful element.
- [ ] **No `<p>` containing block elements** -- `<p>` must not wrap `<div>`, `<ul>`, `<ol>`, `<table>`.
- [ ] **Aria labels on icon-only buttons** -- buttons with no visible text (icon-only move buttons) use `aria-label`, not `title`.
- [ ] **`data-show` + `class="hidden"` conflict** -- grep for `data-show=.*class="hidden"` in all HTML files. Any match is a bug: the element can never be shown by `dataBind`. Replace `class="hidden"` with `style="display:none"` on those elements.
- [ ] **`lang` attribute** -- every `<html>` has `lang="en"`.
- [ ] **`<meta name="viewport">`** -- includes `initial-scale=1`.
- [ ] **Inline styles** -- `style="display: none"` and similar replaced with `.hidden` utility class. **Exception:** elements that are shown/hidden by `dataBind` via `data-show` MUST use `style="display:none"` as the initial hidden state, NOT `class="hidden"`. `dataBind` shows elements by setting `tag.style.display = ""` (clearing the inline property); a CSS class `display:none` has higher specificity than an empty inline style and cannot be overridden this way. Any `data-show` element with `class="hidden"` will be permanently invisible after `dataBind` tries to show it.

### Dead and duplicate CSS

- [ ] **Unused selectors** -- CSS rules matching no element in any HTML file.
- [ ] **Duplicate declarations** -- same property declared twice in one rule block.
- [ ] **Immediately-overridden declarations** -- a value set on line N overridden unconditionally on line N+1.
- [ ] **Vendor prefixes** -- `-webkit-user-select`, `-moz-user-select` and similar for properties now universally supported unprefixed. Verify on caniuse.com before removing.
- [ ] **Redundant dark-mode blocks** -- a component-level `@media (prefers-color-scheme: dark)` block that only overrides a value already handled by a token dark-mode override in `tokens.css`.

### Cross-surface consistency

- [ ] **Token import** -- every CSS file starts with `@import url("tokens.css")`.
- [ ] **`h1` style** -- identical on all pages: same size, weight, color, letter-spacing.
- [ ] **Body font size** -- same across all pages.
- [ ] **`.btn` class** -- identical visual result on all pages.
- [ ] **Focus ring** -- identical on all pages.

---

## Step 3 -- Report findings

Group by category, most impactful first. For each finding:

- **File and line** (or range)
- **Current code** (exact snippet)
- **Problem** (one sentence)
- **Proposed fix** (concrete replacement -- give the answer, not "consider" or "you might")

Tag each finding:
- `QUICK` -- one line or a few mechanical lines
- `STRUCTURAL` -- changes element types, reorganizes HTML, or rewrites a CSS section

---

## Step 4 -- Implement (visual/CSS findings)

After the user approves findings (all or a subset), apply them file by file. For structural changes, show exact before/after and confirm before editing.

Run `npm run lint:all` after all edits. Fix any lint errors introduced.

Do not commit. Report what changed and ask the user to verify visually in the browser before committing.

---

## Step 5 -- Behavioral / interaction audit

Test these scenarios manually. Do not rely on code reading alone -- many bugs are detectable only at runtime.

### Single-rule actions

**Create rule**
- [ ] Edit form opens with blank fields
- [ ] Save stores rule and persists via background message
- [ ] Cancel silently discards (no unsaved-changes guard -- by design)
- [ ] Helper panel: empty from URL or to URL shows inline error near "Suggest rule" button
- [ ] Helper panel: identical from/to URL shows inline error
- [ ] Helper panel: valid URLs generate rule and populate form fields
- [ ] Helper panel: any input change clears the inline error
- [ ] Helper panel: closing the panel clears the inline error

**Edit rule**
- [ ] Edit form opens with all existing field values
- [ ] Save updates the rule
- [ ] Cancel silently discards (no guard -- by design)

**Delete rule**
- [ ] Confirmation dialog shows the rule description
- [ ] Confirm deletes the rule and closes dialog
- [ ] Cancel closes dialog without deleting

**Enable/disable toggle**
- [ ] Click toggles `disabled` for the clicked rule only
- [ ] State persists after save

**Test / example URL**
- [ ] `exampleResult` updates live as include pattern, exclude pattern, redirect URL, or processMatches change
- [ ] Error shown for: empty redirectUrl, invalid regex in any pattern field, replaceFrom empty when processMatches=replace, backreference in regex pattern, pattern >2000 chars, appliesTo empty, exclude pattern matches example URL, include pattern does not match example URL
- [ ] Shows result URL when all validations pass

### Multi-rule actions (2+ rules checked)

**Enable/disable**
- [ ] All checked rules are set to the same state as the CLICKED rule (not a fixed state)
- [ ] No mixed-state ambiguity: clicking "disable" on a rule that is already disabled enables the whole group

**Delete**
- [ ] Confirmation dialog accurately states how many rules will be deleted
- [ ] All checked rules are removed on confirm

**Move up / Move to top**
- [ ] Checked rules move as a contiguous group (their relative order is preserved)
- [ ] Move Up and Move to Top buttons are disabled for all checked rows when the group's top rule is already at index 0
- [ ] No silent no-op: boundary state is reflected in the button enabled/disabled state, not handled silently at click time

**Move down / Move to bottom**
- [ ] Checked rules move as a contiguous group (relative order preserved)
- [ ] Move Down and Move to Bottom buttons are disabled for all checked rows when the group's bottom rule is at the last index

**Move buttons (single rule)**
- [ ] Move Up and Move to Top disabled when rule is at index 0
- [ ] Move Down and Move to Bottom disabled when rule is at last index
- [ ] Icon child elements (`<i>`, `<span>`) inside buttons have `pointer-events: none` so `ev.target` in delegated click handlers resolves to the `<button>`, not the icon

**Tooltips (icon-only buttons)**
- [ ] Move-to-top, move-up, move-down, move-to-bottom each show a native tooltip on hover
- [ ] Tooltip text matches the `aria-label` exactly
- [ ] Disabled move buttons still show tooltip on hover (requires `pointer-events: auto` CSS override on `[disabled]` selector, plus `if (ev.target.disabled) return` guard in the delegated click handler, plus explicit `:hover` reset for background/border-color/cursor)
- [ ] Disabled move buttons do NOT visually change color on hover (the `:hover` reset prevents false interactivity cue)

**Export**
- [ ] Nothing checked: button says "Export All", downloads all rules, filename is `Redirector.json`
- [ ] 1+ rules checked: button says "Export Selected", downloads only checked rules, filename includes count
- [ ] Export button label updates immediately when check state changes (including Select All / Deselect All)

**Select All / Deselect All**
- [ ] Select All checks every rule
- [ ] Deselect All unchecks every rule
- [ ] Both update the Export button label immediately

### Import

- [ ] Selecting a file imports and merges; duplicates (per `equals()`) are skipped
- [ ] `equals()` does NOT compare `disabled` -- an enabled copy of a disabled rule is treated as a duplicate (known limitation)
- [ ] Selecting the same file twice works: file input is reset after every import attempt
- [ ] A file where every rule is a duplicate shows a message and adds no rules

### Delete All

- [ ] Confirmation dialog is shown before deleting
- [ ] Confirm deletes all rules (no success banner -- the empty list is self-evident)
- [ ] Cancel closes dialog without deleting

### Concurrent tabs / external storage changes

- [ ] When a second settings tab (any window) saves rules, this page detects the storage change and reloads rules automatically
- [ ] "Rules updated by another window." banner is shown
- [ ] Own saves do NOT trigger the reload (the `ownSavePending` counter in `redirectorpage.js` tracks this)
- [ ] On save failure (quota exceeded or background unavailable), `ownSavePending` is decremented correctly so future external changes are still detected

### Single settings tab enforcement

- [ ] Clicking the toolbar icon when a settings tab is already open in ANY window: focuses that tab and brings its window to the foreground
- [ ] Does not open a second settings tab

### Options / settings

- [ ] "Disable Redirector" global toggle works and persists
- [ ] Sync toggle: if background page is unreachable, the checkbox reverts and shows an error banner
- [ ] Keyboard shortcut section shows the current hotkey for the global enable/disable command

### Custom variables

- [ ] Add variable: creates a new name/value row
- [ ] Save: blocked and shows error if any two variable names are identical
- [ ] Variables always use `chrome.storage.local`, even when sync is enabled (known limitation -- not a bug)

---

## Known limitations (do not file as bugs)

| Limitation | Reason |
|---|---|
| No undo for delete, bulk disable, or delete all | Deferred by design |
| Cancel on edit form silently discards changes | No unsaved-changes guard by design |
| `equals()` ignores `disabled` | Import merging edge case; harmless in practice |
| Custom variables always use local storage | Sync quota is too small for variables |
| `grouped` written to storage via `toObject()` | Always resets to `false` on load; noise, not a functional problem |
