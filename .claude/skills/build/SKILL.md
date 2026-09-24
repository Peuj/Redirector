---
description: Build the Redirector extension packages for all browsers. Run before manual testing of a built package or as part of the release process.
allowed-tools: Bash(python3 *) Bash(bash *)
---

## Instructions

Run the build from the project root:

```bash
python3 build.py
```

Must be on `master` for a release build. The build reads `manifest.json` and applies per-browser patches.

## Output files

All output files go to `build/` in the project root:

| File | Browser |
|---|---|
| `redirector-firefox.xpi` | Firefox |
| `redirector-chrome.zip` | Chrome |
| `redirector-edge.zip` | Edge |
| `redirector-opera.zip` or `.nex` | Opera (`.nex` if `extension-certificate.pem` exists) |

The `.pem` file is gitignored. To sign an Opera `.nex` manually: `bash nex-build.sh`.

## Per-browser manifest patches

The build script applies these patches per browser:
- **Chrome/Edge/Opera:** removes `applications.gecko` key
- **Opera:** adjusts `options_ui.page`

## After a successful build

1. Load the built package manually in the browser for a smoke test.
2. Check that redirects fire correctly on a test rule.
3. Proceed to the `/pre-release` checklist when testing is confirmed.

## Traps

**Build reads manifest.json from disk.** On master, this is the production manifest (background.scripts has only `redirect.js` and `background.js`). Never run the build from the feature branch if you intend to produce a production package -- the feature manifest includes `redirectorLog.js` and `testHooks.js`, which would be bundled into the package.

**`build/` directory is gitignored.** The output packages are not tracked. Do not try to `git add` them.
