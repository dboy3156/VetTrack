# Version Management & Update Notifications

## What & Why
VetTrack has no formal versioning strategy beyond a static `1.0.0` in package.json, no changelog, and no formal database migration files. This task introduces a proper versioning workflow, a CHANGELOG, structured migration files to replace the ad-hoc ALTER-on-startup approach, and a user-facing banner that notifies staff when a new version has been deployed.

## Done looks like
- A `CHANGELOG.md` file exists at the project root documenting all past releases in Keep-a-Changelog format
- Database schema changes are tracked as sequential numbered SQL migration files in a `migrations/` folder
- The server runs pending migrations in order on startup, safely skipping already-applied ones via a `vt_migrations` tracking table
- A version string is embedded into the frontend build (via Vite's `define`) and shown in the Settings/About page
- When the deployed version is newer than what a user last saw, a dismissible banner or toast appears: "VetTrack v1.x is here — see what's new" with a link to the changelog

## Out of scope
- Automated CI/CD pipelines or blue-green deployments
- Gradual/canary rollouts (infrastructure-dependent)
- Semantic versioning automation tooling (bumping is done manually per release)

## Tasks
1. **Formal migration system** — Create a `migrations/` directory. Extract all existing CREATE TABLE and ALTER TABLE statements from `initDb()` into numbered `.sql` files (e.g. `001_initial_schema.sql`, `002_add_push_subscriptions.sql`). Add a `vt_migrations` table that records which files have been applied. Update server startup to scan the folder, compare against the tracking table, and run any unapplied files in order. Keep `initDb()` as a thin wrapper.

2. **CHANGELOG and versioning** — Write `CHANGELOG.md` covering all significant features delivered to date. Update `package.json` to `1.1.0` to mark the start of formal versioning. Expose the version via an API endpoint `GET /api/version` that returns the current version string.

3. **Version embedding in the frontend** — Configure Vite's `define` to inject the version from `package.json` at build time. Display it in the Settings/About page.

4. **Update notification banner** — Store the last-seen version in the user's browser (localStorage). On app load, fetch `/api/version`. If the fetched version is newer than the stored one, show a dismissible top banner with the new version number and a "See what's new" link to the changelog. Dismiss updates the stored version.

## Relevant files
- `server/db.ts`
- `server/index.ts`
- `package.json`
- `vite.config.ts`
- `src/pages/settings.tsx`
- `src/App.tsx`
