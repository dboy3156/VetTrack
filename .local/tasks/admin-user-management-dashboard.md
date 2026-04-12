# Admin User Management Dashboard

## What & Why
Build a full user management interface inside the existing Admin panel so admins can view, filter, approve/reject, and manage roles for all users in the system. This requires adding a `status` field to the users table (pending / active / blocked) and wiring up the corresponding API endpoints and UI.

## Done looks like
- Admin panel has a dedicated Users tab showing all registered users in a table/list
- Admins can filter users by status: Pending, Active, or Blocked
- Each user row shows name, email, role, status, and join date
- Admins can approve or reject pending users (changes their status to active or blocked)
- Admins can change a user's role via a dropdown (admin / vet / technician / viewer)
- Status and role changes are reflected immediately in the UI without a full page reload
- Non-admin users cannot access the user management UI or its API endpoints

## Out of scope
- Email notifications on approval/rejection (future work)
- Bulk actions on multiple users at once
- Deleting users (covered by the Soft Delete task)

## Tasks
1. **Add user status to database** — Add a `status` column (`pending`, `active`, `blocked`) to the `vt_users` table via a migration, defaulting new users to `pending`.

2. **Backend API endpoints** — Add or extend endpoints: `GET /api/users` with optional `?status=` filter, `PATCH /api/users/:id/status` to approve/reject, and update `PATCH /api/users/:id/role`. All protected by `requireAdmin` middleware.

3. **Admin User Management UI** — Build the user management section in the existing admin page: a filterable table/list with status badges, inline role selector dropdown, and Approve/Reject action buttons for pending users. Use TanStack Query for data fetching and mutations.

## Relevant files
- `src/pages/admin.tsx`
- `server/routes/users.ts`
- `server/middleware/auth.ts`
- `server/db.ts`
- `src/hooks/use-auth.tsx`
- `src/components/layout.tsx`
