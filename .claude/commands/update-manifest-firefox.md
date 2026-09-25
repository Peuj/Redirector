---
name: update-manifest-firefox
description: Switch both Redirector and redirector-test to Firefox manifest (manifest-f.json → manifest.json)
---

Run this single Bash command:

cp C:/Personal/Redirector/manifest-f.json C:/Personal/Redirector/manifest.json && cp C:/Personal/redirector-test/manifest-f.json C:/Personal/redirector-test/manifest.json

Then print: "manifest.json set to Firefox in Redirector and redirector-test"

Do NOT run the build script. Do NOT stage or commit anything.
