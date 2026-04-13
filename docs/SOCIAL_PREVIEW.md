# Social Preview

This repo now includes two final social preview outputs:

- `assets/social-preview-github-4x3-upload.jpg`
  final GitHub `Settings -> Social preview` upload asset (sub-1MB)
- `assets/social-preview-github-4x3.png`
  high-quality 4:3 master export
- `assets/social-preview-github.png`
  standard wide social card backup for README or external sharing
- `assets/social-preview-render-4x3.html`
  render source for the 4:3 GitHub preview version
- `assets/social-preview-render.html`
  render source for the standard wide version
- `assets/social-preview-background.png`
  shared background image

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

The current composition uses:

- left panel for project identity and promise
- right column for three proof blocks
- dark technical palette with mint and blue accents

Canvas sizes:

- `1280 x 960` 4:3 version via `assets/social-preview-github-4x3.png`
- `1280 x 640` wide version via `assets/social-preview-github.png`

Why two versions exist:

- GitHub's backend preview container visually favors a taller frame
- external social cards usually favor a wider 2:1 style image

## How to use it

### GitHub social preview

1. Open repository `Settings`
2. Go to `General`
3. Find `Social preview`
4. Upload `assets/social-preview-github-4x3-upload.jpg`

### README hero

The README can keep using the wide version:

- `assets/social-preview-github.png`

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
