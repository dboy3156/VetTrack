# API Validation & Secure Token Hardening

## What & Why
Several backend routes still rely on manual field checks instead of consistent Zod schema validation, leaving room for malformed or malicious payloads to reach business logic. Additionally, the undo-token system and session configuration have gaps that could allow token forgery, session fixation, or cross-user token misuse. This task closes those gaps to make every API endpoint resilient against malformed input and unauthorized action.

Note: Role-based access control (RBAC) enforcement is handled separately in Task #37. This task focuses on the layer beneath RBAC: are the *inputs* trustworthy before the role check even matters?

## Done looks like
- Every POST/PATCH/PUT route validates its request body through a Zod schema; invalid payloads receive a `400 Bad Request` with a descriptive error message before reaching business logic.
- Undo tokens are validated for ownership — a user cannot redeem a token issued for a different user's action.
- Undo tokens are single-use: redeeming a token marks it consumed immediately, preventing replay.
- Session configuration uses `httpOnly`, `secure` (in production), `sameSite: strict`, and a strong secret — session cookies cannot be read by client-side scripts or sent cross-origin.
- Route parameters (equipment IDs, user IDs, folder IDs) are validated as expected types (e.g., positive integers) before hitting the database, preventing injection via malformed IDs.
- No route trusts user-supplied fields that should come from the server (e.g., `userId`, `role`, `createdBy`) — those are stripped from incoming bodies and set from `req.user` exclusively.

## Out of scope
- Role guard assignment across routes (covered by Task #37)
- Clerk JWT verification flow (covered by Task #33)
- Rate limiting changes (already merged in Task #28)
- Frontend input validation (backend enforcement is the source of truth)

## Tasks
1. **Define and apply Zod schemas to all mutating routes** — For every POST, PATCH, PUT, and DELETE route across all route files, replace manual field checks with a shared Zod schema defined at the top of each route file. Return structured `400` errors on validation failure using a consistent error response shape.

2. **Validate and sanitize route parameters** — Add a utility that checks URL path params (`:id`, `:equipmentId`, etc.) are valid positive integers (or UUIDs where applicable) and returns `400` immediately if not. Apply it as a middleware or inline guard at the start of each parameterized route handler.

3. **Harden undo token security** — Update the undo token system to: (a) tie each token to the issuing user ID and verify ownership on redemption, (b) mark tokens consumed atomically on first use to prevent replay, (c) ensure tokens are generated with sufficient entropy (crypto.randomBytes, not Math.random).

4. **Harden session configuration** — Audit the `express-session` setup and ensure cookies are set with `httpOnly: true`, `secure: true` in production, `sameSite: 'strict'`, and that the session secret is sourced from an environment variable (never hardcoded). Regenerate session IDs on privilege change (login, role update).

5. **Strip server-owned fields from request bodies** — Identify any route that accepts fields like `userId`, `role`, `createdBy`, `updatedAt` in the request body and remove them before processing, replacing with authoritative values from `req.user` or the database.

## Relevant files
- `server/index.ts`
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
