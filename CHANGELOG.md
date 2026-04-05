# Changelog

All notable changes to VetTrack are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-04-05

### Added
- Formal database migration system with sequential numbered `.sql` files in `migrations/`
- `vt_migrations` tracking table to record applied migrations, preventing duplicate runs
- `GET /api/version` endpoint exposing the current application version
- Version string embedded into the frontend build via Vite `define`
- Version displayed in the Settings / About section
- Dismissible update notification banner shown when a newer version is detected
- This CHANGELOG file

### Changed
- `package.json` version bumped to `1.1.0` to mark the start of formal versioning
- Server startup now runs pending migrations before initializing the rest of the app
- `initDb()` is now a thin wrapper; all schema logic lives in migration files

## [1.0.0] - 2026-01-01

### Added
- Core equipment tracking with QR code generation and scanning
- Folder-based organisation for grouping equipment
- Role-based access control (admin / technician)
- Clerk authentication integration
- Equipment status lifecycle: ok → warning → critical → repair
- Checkout / check-in flow with user attribution
- Scan log history per equipment item
- Transfer log history when equipment moves between folders
- Analytics dashboard with status breakdowns and activity charts
- Alerts page for overdue maintenance and critical equipment
- WhatsApp alert integration for critical status notifications
- Alert acknowledgement system
- Undo last scan action (time-limited token)
- Push notification support (Web Push API) with per-device settings
- QR code print page (batch PDF export)
- Management dashboard for supervisors
- Demo seed data for evaluation environments
- Progressive Web App (PWA) manifest and service worker
- Dark mode, brightness, density, and locale display settings
- Offline-capable IndexedDB cache via Dexie
- Image upload for equipment photos (object storage)
- Admin panel for user role management
