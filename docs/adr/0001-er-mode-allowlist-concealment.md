# ER Mode uses strict allowlist with concealment 404

For the ER wedge pilot, VetTrack will enforce a clinic-scoped ER allowlist and return `404` for non-allowlisted pages and APIs. We chose this over navigation-only hiding or `403` exposure to reduce cognitive load, prevent accidental surface drift, and keep pilot scope enforceable and testable across UX and backend boundaries.
