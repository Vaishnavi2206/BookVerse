---
agent: agent
description: Review my current branch's changes against main
---
First read .github/skills/bookverse-code-review/SKILL.md and follow it exactly.

Run `git diff main...HEAD` to get the changes on this branch. Review only the
changed code, in PR mode. Do not modify any files. Group findings by severity
(🔴, 🟡, 🔵) with file and line, the problem, why it matters, and a fix. If the
changes look clean, say so briefly.