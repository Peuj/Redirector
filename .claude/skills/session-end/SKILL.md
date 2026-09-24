---
description: Save all session context to memory before closing. Use when the user says they are done, closing the session, or asks to save context.
allowed-tools: Read Write Edit
---

## Instructions

Review the entire conversation for:
- New bugs found or fixed (root cause, not just the fix)
- New behaviors or constraints discovered about Redirector, browser APIs, or the test suite
- New rules or traps (things that would trip up a future session)
- Decisions made and WHY (architectural, UX, approach)
- Open issues or follow-ups with no resolution yet
- New test patterns added to redirector-test

### Classify each finding by where it belongs

| Type of discovery | Save to |
|---|---|
| New coding trap in background.js or redirect.js | Update `test-run/SKILL.md` or `new-task/SKILL.md` |
| New test pattern or browser behavior | Update `test-run/SKILL.md` |
| New cherry-pick trap or rlog stripping issue | Update `feature-to-master/SKILL.md` |
| New release process step or trap | Update `pre-release/SKILL.md` |
| New build trap | Update `build/SKILL.md` |
| New feature architecture or new subsystem | Add to relevant skill's architecture reference section |
| Dynamic project state (open issue, pending item, current version) | Memory file |

**Skill files are the preferred destination for all rules, traps, and architecture.** Memory files are only for dynamic state that changes between sessions (open issues, pending tasks, unreleased features).

### Ask these targeted questions before writing anything

- "Was there anything surprising or non-obvious about how this worked?"
- "Is there a rule or trap here that would trip up a future session?"
- "Are there any open issues or follow-ups to track?"
- "Did any skill or memory file turn out to have wrong or missing guidance?"

### Present proposed changes as a list

Memory files live at: `C:/Users/I051618/.claude/projects/c--Personal-Redirector/memory/`

```
PROPOSED:
- UPDATE test-run/SKILL.md -- add [rule name] trap
- UPDATE project_X.md -- [what changes]
- UPDATE MEMORY.md -- add pointer for new file (only if a new memory file is created)
```

Wait for confirmation, then write. Rules for all files:
- Skill files: keep the "## Instructions" structure; add new traps to the relevant section
- Memory files: frontmatter with name, description, type (user/feedback/project/reference)
- Feedback/project body: rule/fact, then **Why:** and **How to apply:** lines
- Never use em dash anywhere (use colon, comma, or parentheses)
- MEMORY.md entries: one line, under 150 chars

Finish with: "Memory saved. Safe to close." and a one-line summary of what was saved.
