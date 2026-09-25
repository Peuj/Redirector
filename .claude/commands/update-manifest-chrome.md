---
name: update-manifest-chrome
description: Switch both Redirector and redirector-test to Chrome manifest (manifest-c.json → manifest.json)
---

Run this single Bash command:

cp C:/Personal/Redirector/manifest-c.json C:/Personal/Redirector/manifest.json && cp C:/Personal/redirector-test/manifest-c.json C:/Personal/redirector-test/manifest.json

Then print: "manifest.json set to Chrome in Redirector and redirector-test"

Do NOT run the build script. Do NOT stage or commit anything.
