# Security Hardening & Full RBAC

## What & Why
Expand VetTrack's security posture to production-grade standards. The app currently has only two roles (admin/technician) and no HTTP security headers or request-level protections. This task adds Vet and Viewer roles, enforces appropriate permission boundaries across all API routes, and introduces security middleware to guard against common web vulnerabilities.

## Done looks like
- Four roles are active in the system: Admin, Vet, Technician, Viewer — each with clearly enforced permissions
- Admin can manage users and all equipment; Vet can scan and add notes; Technician can check out/in; Viewer is read-only
- Existing users with "technician" role are unaffected; existing "admin" users are unaffected
- All API routes enforce the correct minimum role
- Security headers are present on every response (Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, Referrer-Policy)
- CSRF protection is in place for all state-changing requests
- Input sanitization middleware rejects or strips XSS payloads before they reach route handlers
- Role assignment UI in the admin panel shows all four roles

## Out of scope
- SSO or multi-provider authentication (Clerk handles this)
- IP allowlisting or network-level firewall rules
- Penetration testing or external security audit

## Tasks
1. **Expand role definitions** — Update the `vt_users` schema to support four roles (admin, vet, technician, viewer). Write a migration step in `initDb()` that adds the new valid values without breaking existing rows. Update the TypeScript role type everywhere it is referenced.

2. **Update RBAC middleware** — Create `requireRole(minRole)` middleware that maps roles to a permission hierarchy and enforces the minimum level per route. Replace the existing `requireAdmin` and `requireAuth` usages with the new middleware where appropriate. Viewer role must block all write endpoints.

3. **Security headers & input protection** — Add Helmet.js (or equivalent manual header middleware) to set CSP, X-Frame-Options, X-Content-Type-Options, and Referrer-Policy. Add csurf or a double-submit cookie pattern for CSRF on state-changing routes. Add a lightweight sanitization middleware that strips script-injection payloads from string fields on all incoming request bodies.

4. **Admin UI role management** — Update the admin user management page to show and allow setting all four roles. Add a role badge to the user list that displays Vet/Viewer alongside the existing Admin/Technician.

## Relevant files
- `server/middleware/auth.ts`
- `server/db.ts`
- `server/routes/equipment.ts`
- `server/routes/users.ts`
- `server/index.ts`
- `src/pages/admin.tsx`
- `src/hooks/use-auth.tsx`
