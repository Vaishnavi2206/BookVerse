---
name: bookverse-code-review
description: Reviews BookVerse code (React frontend, Node.js backend) for bugs, security, error handling, maintainability and performance. Use for branch reviews, code quality checks, and full project or folder scans.
---

# BookVerse Code Review

## Modes
- PR mode (reviewing a diff): comment only on changed code. Do not flag
  pre-existing issues unless the change makes them worse.
- Scan mode (asked to scan a folder or project): review every file in scope
  and write a report. Do not modify source code.

## Severity
- 🔴 Blocker: bugs, security holes, data loss, crashes
- 🟡 Should fix: missing error handling, maintainability, performance
- 🔵 Nit: naming, minor style (skip if there are many higher-severity items)

## Frontend checklist (React)
- Hooks: wrong or missing dependency arrays; effects missing cleanup
  (listeners, timers, in-flight requests)
- Race conditions on fast input (search-as-you-type without debounce or abort)
- State: derived data stored in state, direct mutation of state or props
- Lists: missing or index-based key
- Open Library calls: loading, error and empty states handled; response shape
  assumptions checked
- Components over about 150 lines mixing fetching, logic and markup
- Accessibility: labels, alt text, keyboard access, semantic elements
- Unnecessary re-renders (inline objects or functions passed to memoized children)

## Backend checklist (Node.js)
- Unhandled promise rejections; async route handlers without error forwarding
- Missing validation on body, params, query
- Hardcoded secrets or sensitive data in logs
- Inconsistent error response shape; no central error middleware
- Unbounded queries or responses; missing pagination; N+1 patterns
- CORS misconfiguration; missing rate limiting or security headers
- Business logic inside route handlers
- Blocking operations in the request path

## General
- Dead code, leftover console.log, commented-out code
- New logic without tests
- Functions doing more than one thing
- Duplicated logic that should be shared

## Output: PR mode
Group findings by severity. Each finding has: file and line, what is wrong,
why it matters, and a concrete fix. If the changes are clean, say so briefly
instead of inventing issues.

## Output: scan mode
Write a markdown report with these parts:
1. Summary: files reviewed and count of findings per severity
2. Findings grouped by folder, then by severity. Each finding has file and
   line, the problem, why it matters, and a suggested fix
3. A "Fix first" list of the top 5 items