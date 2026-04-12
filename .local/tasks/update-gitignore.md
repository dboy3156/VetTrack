# Update .gitignore entries

  ## What & Why
  Add `dist/` and `.env` to .gitignore if not already present, to ensure the build output directory and local environment files are never committed.

  ## Done looks like
  - .gitignore contains `dist/` (with trailing slash)
  - .gitignore contains `.env`
  - No existing lines are removed

  ## Out of scope
  - Any other file changes

  ## Tasks
  1. **Add missing entries** — Check .gitignore for `dist/` and `.env`; append whichever are absent. Note: `.env` is already present; only `dist/` needs to be added after the existing `dist` line.

  ## Relevant files
  - `.gitignore`
  