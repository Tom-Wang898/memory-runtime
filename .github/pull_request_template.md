## Summary

- What changed?
- Why was it needed?

## Verification

- [ ] `npm run check:all`
- [ ] `npm run bench:bootstrap` if bootstrap performance changed
- [ ] `npm run bench:tokens` if token budgeting or context shape changed

## Risk

- Host wrappers affected:
- Hot-memory schema affected:
- Cold-memory behavior affected:
- Docs/install flow affected:

## Notes

- Keep user prompts intact
- Preserve fail-open behavior
- Do not couple host adapters to provider internals
