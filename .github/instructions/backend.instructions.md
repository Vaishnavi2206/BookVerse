---
applyTo: "backend/**/*.js"
---
- Routes stay thin; business logic goes in services.
- Validate all input at the route boundary.
- Errors flow to a central error-handling middleware.
- No secrets in code; configuration comes from environment variables.