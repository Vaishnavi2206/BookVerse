---
agent: agent
description: Full code-quality scan of a folder using the BookVerse review checklist
---
First read .github/skills/bookverse-code-review/SKILL.md and follow it exactly.

Run it in scan mode on ${input:folder:frontend/src}. Review every file in that
folder. Do not change any source files.

Save the report in docs/reviews/ with a filename made from the folder name
(slashes replaced by dashes) and today's date.