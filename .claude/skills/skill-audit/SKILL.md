---
description: Audit skill files and memory files for wrong guidance, stale facts, missing steps, and dead cross-references. Run when a skill gives wrong instructions, or periodically after several sessions.
argument-hint: [skill-name or memory-filename -- omit for full audit]
allowed-tools: Read Glob Edit
---

## Files to audit

$ARGUMENTS

If nothing was provided above, run a full audit: read every skill SKILL.md and every non-index memory file.
If a skill name or memory filename was provided, restrict the audit to those files only.

## Step 1 -- Enumerate files

**Skill files:** `C:/Personal/Redirector/.claude/skills/*/SKILL.md`

**Memory files:** `C:/Users/I051618/.claude/projects/c--Personal-Redirector/memory/*.md`
(skip `MEMORY.md` -- that is the index, not a memory file)

Read each file fully before evaluating. Do not skim.

## Step 2 -- Evaluate each file as a standalone document

Read each file without consulting the source code. Evaluate it as if you are a first-time reader with no prior context about Redirector. Check against each pattern below:

### Correctness

- **Code syntax:** do all code blocks have valid syntax, matching braces, and no orphaned fragments like `} else {` with no opening block?
- **Wrong/Correct labels:** if a "Wrong" and "Correct" example are shown side by side, do they describe what they claim? Confirm by reading the logic, not the label.
- **Mislabeled code comments:** does any comment inside a conditional block describe the opposite condition? (e.g., `// feature branch path` inside an `if` that runs on master)
- **Missing required steps:** do the instructions assume the reader has taken a step that is never stated? (e.g., running tests against an extension that was never loaded into the browser)

### Consistency

- **Dual procedures:** do any two sections in the same file describe the same operation with different steps and no rule for which to use when?
- **Cross-file contradictions:** does a rule in this file conflict with a rule in another file on the same topic? (e.g., one file says abort on conflict, another says use `--no-commit`)
- **Stale counts/versions:** does the file claim specific numbers that are known to be outdated?
  - Unit test count (A-P sections): **85**
  - Integration test count (Q-U sections): **11**
  - Total test count: **96**
  - Current extension version: check `manifest.json` -- the value at time of last audit was **v3.5.4**

### Staleness

- **Memory status age:** does a memory file claim a bug is "open," "pending," or "current" with a date older than 60 days? Flag for manual verification -- do not assume it is resolved.
- **Dead cross-references:** for each `[[name]]` in a memory file body, does a file exist whose `name:` frontmatter slug matches exactly? If not, it is a dead link.
- **Unfilled placeholders:** literal `originSessionId: current`, a `$ARGUMENTS` line with no fallback instruction for the no-argument case, `vPREVIOUS` or `vX.Y.Z-previous` with no discovery instruction.
- **Changelog entries in instructions:** lines like "Fixed YYYY-MM-DD: ..." belong in git history, not in skill instruction bodies. Flag them as noise.
- **Dead instructions:** does any step reference a branch, tool, file path, or state that no longer exists or is never reachable? (e.g., a step conditioned on a branch that was deleted, a path that moved, a tool that was removed from `allowed-tools`)

### Completeness

- **Missing commands:** does a step say "copy X to Y" or "update X" without showing the actual shell command or edit instruction?
- **Blank routing table cells:** does a keyword-routing table have blank entries in a "Skill to suggest" or similar column where other rows have entries?
- **Missing preconditions:** does a step silently fail if the reader is on the wrong branch, has the wrong manifest set, or has a required tool not loaded?
- **Missing failure guidance:** for steps that commonly fail in non-obvious ways (cherry-pick conflicts, lint errors, manifest overwrites), is there any guidance on what to do?

### Noise

- **False self-contained claim:** does the file claim to be "self-contained" while referencing external paths, branches, or tools that are not described within it?
- **Unexplained rules:** does any non-obvious rule or restriction appear without a reason? A rule that just says "do X" without explaining why is brittle -- future sessions may skip it or contradict it when edge cases arise. Flag bare imperatives where the motivation is not at least implicit in the surrounding context.
- **Trigger accuracy:** does the `description:` frontmatter accurately describe when this skill should and should not activate? Check for descriptions that are too vague (would trigger on unrelated prompts), too narrow (would miss obvious use cases), or that omit important context words a user would naturally type. A good description names the concrete action AND the situations that call for it.

## Step 3 -- Report findings

For each finding, rate severity:

| Level | Criterion |
|---|---|
| CRITICAL | Following the instruction literally produces wrong or broken behavior |
| HIGH | Significant gap, contradiction, or stale state that misleads or blocks |
| MEDIUM | Unclear or incomplete -- workable with prior knowledge, but trips up a new reader |
| LOW | Noise, redundancy, or minor polish |

Format each finding as:

```
FINDING: <SEVERITY> -- <file> -- <short title>
Problem: <one sentence describing what is wrong>
Fix: <what to change>
```

Group by severity, CRITICAL first. If no findings: "No issues found."

## Step 4 -- Fix

**CRITICAL findings:** fix immediately without asking. Show what you changed.

**HIGH, MEDIUM, LOW:** present the complete findings list grouped by severity. Wait for explicit user confirmation before making any edits.

## When to use this skill

Use `/skill-audit` when a skill gave wrong guidance, after a long gap between sessions, or when something "felt off" during a coding session.
