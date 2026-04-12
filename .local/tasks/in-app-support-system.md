# In-App Support Ticket System

## What & Why
VetTrack has no mechanism for staff to report software bugs or request technical help. This task builds a "Report Issue" button accessible from anywhere in the app, a backend to store and manage support tickets, and an admin support dashboard where issues can be triaged and resolved. It also optionally sends email or Slack alerts when new tickets arrive.

## Done looks like
- A "Report Issue" button is visible in the app's navigation or footer for all authenticated users
- Tapping it opens a short form: title, description, and severity (low/medium/high)
- The submission automatically attaches: current page URL, browser/device info, the logged-in user's email, and the app version string
- A new support ticket is created in the database and a push notification (and optional email) is sent to admins
- The admin panel has a "Support" tab listing all tickets with their status (Open, In Progress, Resolved)
- Admins can click a ticket to view full detail (submitted info + attached context), change its status, and add an internal note
- Ticket count badge on the admin nav item shows unresolved count

## Out of scope
- External helpdesk integrations (Zendesk, Jira) — this is a lightweight internal system
- User-facing ticket history view (admin-only for now)
- File/screenshot attachments on tickets

## Tasks
1. **Database schema** — Add a `vt_support_tickets` table with fields: id, title, description, severity, status (open/in_progress/resolved), user_id, user_email, page_url, device_info, app_version, admin_note, created_at, updated_at.

2. **Backend API** — Create POST `/api/support` (authenticated, any role) to submit a ticket. Create GET `/api/support` (admin only) to list all tickets. Create PATCH `/api/support/:id` (admin only) to update status and admin note. On ticket creation, send a push notification to all subscribed admins.

3. **Report Issue UI component** — Build a compact "Report Issue" dialog accessible from the main navigation. The form captures title, description, and severity. On open, it auto-fills hidden fields with current URL, `navigator.userAgent`, the user's email from the auth context, and the app version from the environment.

4. **Admin support dashboard tab** — Add a "Support" section to the admin panel. Display tickets in a table sorted by date, color-coded by severity and status. Clicking a row opens a detail panel showing all submitted context and an inline form to update status and write an admin note.

## Relevant files
- `server/db.ts`
- `server/index.ts`
- `server/routes/users.ts`
- `server/lib/push.ts`
- `src/pages/admin.tsx`
- `src/hooks/use-auth.tsx`
- `src/components/nav-bar.tsx`
