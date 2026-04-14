# memory-palace-project-tools

Sanitized project-memory optimizer modules exported from a private
Memory Palace checkout.

## Contents

- project memory inventory and digest builders
- duplicate merge helpers
- relation helpers
- optimizer entrypoint
- backend tests for the optimizer flow

## Scope

This export is intentionally narrow. It excludes live databases, sessions,
secrets, deployment state, and dashboard-specific runtime files.

## Publish checklist

1. Review `PUBLIC_EXPORT_MANIFEST.json`.
2. Verify no private absolute paths remain.
3. Add runtime setup notes if you publish this as a standalone mirror.
