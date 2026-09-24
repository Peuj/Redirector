---
description: Start a new Redirector coding task safely -- checks branch, shows recent commits, loads task-relevant context. Use when beginning work on a feature, fix, or issue.
argument-hint: [task description]
allowed-tools: Read Bash(git *)
---

## Current state

!`cd C:/Personal/Redirector && echo "Branch: $(git branch --show-current)" && echo "Last 5 commits:" && git log --oneline -5 && echo "Uncommitted:" && git status --short`

## Task

$ARGUMENTS

## Standing rule: fix the root cause, not the test

When a test fails, the first question is: does this expose a real bug in Redirector? Never adapt a test to mask a real bug.

1. Read the failing test and ask: does this reveal a Redirector behavior that is wrong?
2. If yes: fix Redirector first (on the feature branch), then verify the test passes naturally
3. Only adjust a test when: the assertion itself is wrong, there is a timing issue, or the test no longer applies
4. Never increase wait times without first confirming Redirector's behavior is correct

## Instructions

**If current branch is `master`:** warn clearly -- all coding work must be on `feature/test-instrumentation`. Offer to switch. After checkout, confirm with `git branch --show-current` before proceeding.

**If current branch is `feature/test-instrumentation`:** confirm and show last 5 commits as context.

**If uncommitted changes exist:** list them and ask: "Commit, stash, or continue?"

Load task-relevant context based on keywords in $ARGUMENTS:

| Keyword | Skill or context to load |
|---|---|
| test / companion | `/test-run` |
| cherry-pick / master / rlog | `/feature-to-master` |
| release / version / build | `/pre-release` or `/build` |
| background.js / SPA / history | Architecture: `background.js` has two anti-loop structures (ignoreNextRequest, justRedirected) and `onHistoryStateUpdated` for SPAs |
| redirect.js / pattern / wildcard / regex | Architecture: `Redirect` class in `redirect.js`; `processMatches` transforms; capture group substitution |
| UI / settings / redirector.html | Architecture: custom data binding via `dataBind()` in `util.js`; no framework |
| storage / sync | Architecture: `storageArea` switches between local and sync; 8 KB limit for sync |
| appliesTo / filter / type | Architecture: `createPartitionedRedirects` buckets rules by request type; `createFilter` excludes non-ResourceType values like "history" |

Finish with: "Ready. Working on `feature/test-instrumentation`." and list any context loaded.
