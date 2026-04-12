# Social Preview

This repo now includes a first social preview source asset:

- `assets/social-preview.svg`

## Why this exists

The GitHub repo page is already functional, but a stronger visual header makes
the project easier to understand at a glance.

Reference points taken from stronger repo homepages such as `cube-pets-office`:

- clear top-of-page hero
- one visual asset that explains the project fast
- a small set of badges instead of a wall of text

## Copy used in the preview

Main title:

- `Hot/cold memory for CLI agents`

Support line:

- `Save tokens without rewriting the prompt.`

Capability pills:

- `Hot: SQLite`
- `Cold: Memory Palace`
- `Codex / Claude / Gemini`
- `Fail-open`

Proof points:

- compact bootstrap context
- backend-only Docker cold memory
- strict prompt safety

## Layout

The current SVG uses:

- left panel for project identity and promise
- right column for three proof blocks
- dark technical palette with mint and blue accents

Canvas size:

- `1280 x 640`

That size works well for GitHub social preview uploads and README hero display.

## How to use it

### GitHub social preview

1. Open repository `Settings`
2. Go to `General`
3. Find `Social preview`
4. Upload an exported PNG version of `assets/social-preview.svg`

### README hero

The README can reference the SVG directly from the repo.

## Discussions recommendation

Current recommendation for `v0.1.0-alpha`:

- keep `Discussions` off for now

Why:

- the project is still `0.x`
- issue volume is likely low at first
- a single `Issues` surface keeps feedback tighter during the first release window

Enable `Discussions` later when one of these becomes true:

- repeated Q and A support threads start cluttering issues
- users begin sharing integrations or setup variants
- you want a separate space for ideas that are not actionable bugs

Recommended categories if you enable it later:

- `Q&A`
- `Ideas`
- `Show and tell`
