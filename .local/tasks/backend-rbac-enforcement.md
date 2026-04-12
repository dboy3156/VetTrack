# Backend RBAC Enforcement

## What & Why
The middleware infrastructure for roles (admin, vet, technician, viewer) exists, but not every endpoint has the correct minimum-role guard applied. A systematic audit and enforcement pass is needed so that server-side permissions are airtight — no route is accessible above the caller's role, and no frontend trick can bypass it.

## Done looks like
- Every `/api` endpoint has an explicit, intentional access level (public, viewer+, technician+, vet+, or admin-only), documented in a permissions matrix comment at the top of each route file.
- Endpoints that should be role-gated but currently only use `requireAuth` are upgraded to the appropriate `requireRole(...)` or `requireAdmin` call.
- A viewer-role session attempting a technician-gated mutation receives a `403 Forbidden` with a clear JSON error body.
- An unauthenticated request to any non-public endpoint receives a `401 Unauthorized`.
- Frontend-supplied role claims in headers or cookies are ignored — role is read exclusively from the server-side session/database record.

## Out of scope
- Changes to the Clerk JWT verification flow (covered by Task #33)
- New roles beyond the existing four (admin, vet, technician, viewer)
- UI permission hiding (frontend guards are nice-to-have but not the enforcement mechanism)
- Rate limiting changes (covered by Task #28)

## Tasks
1. **Define the permissions matrix** — For every existing route (GET, POST, PATCH, DELETE across all route files), determine the correct minimum role and document it in a table comment at the top of each route file. Key decisions: `DELETE /api/alert-acks` (viewer should not bulk-clear acks), `POST /api/storage/upload-url` (viewers should not upload), `POST /api/push/test` (admin-only), `GET /api/analytics` and `GET /api/activity` (confirm viewer read access is intentional).

2. **Apply missing role guards** — Update each route handler to use `requireRole(...)` or `requireAdmin` where the matrix says a higher role is required. Ensure the role is resolved from the server-side user record, never from a request header or body field.

3. **Harden role resolution** — In `server/middleware/auth.ts`, confirm that the `role` attached to `req.user` is always fetched fresh from the database (or session that reflects DB state), so a user whose role was downgraded mid-session cannot still access elevated endpoints.

4. **Add enforcement tests** — Add integration-level checks (can be Jest or a test script) that: (a) a `viewer` session returns 403 on technician-gated endpoints, (b) an unauthenticated request returns 401 on all protected endpoints, (c) passing a spoofed role header does not elevate access.

## Relevant files
- `server/middleware/auth.ts`
- `server/routes/equipment.ts`
- `server/routes/folders.ts`
- `server/routes/users.ts`
- `server/routes/alert-acks.ts`
- `server/routes/activity.ts`
- `server/routes/analytics.ts`
- `server/routes/push.ts`
- `server/routes/storage.ts`
- `server/routes/support.ts`
- `server/routes/whatsapp.ts`
- `server/index.ts`
