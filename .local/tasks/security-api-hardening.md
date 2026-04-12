# Security & API Hardening

## What & Why
VetTrack has several security gaps that are unacceptable before real hospital deployment. The most critical: CORS is wide-open (`origin: true, credentials: true`), meaning any website can make authenticated requests on behalf of a logged-in user. There is no rate limiting — a single bad actor or scripting error under ICU load can exhaust the server. Viewer-role users can currently trigger WhatsApp alerts and acknowledge critical alerts (those endpoints only check `requireAuth`, not a role minimum). Finally, the undo token window is 12 seconds — under slow hospital Wi-Fi this almost always times out silently.

## Done looks like
- CORS is locked to `$REPLIT_DEV_DOMAIN` in development and the production domain in production; cross-origin credentialed requests from arbitrary sites are rejected.
- Rate limiting is applied globally (max 100 req/min per IP) and tightly on mutation endpoints — scan (10/min), checkout/return (20/min), login-related paths (5/min). Exceeding the limit returns a clear 429 with a `Retry-After` header.
- `POST /api/whatsapp/alert` and `POST /api/alert-acks` require at minimum the `technician` role; a `viewer` gets a 403.
- Undo token TTL extended from 12 seconds to 90 seconds in the database and the frontend toast countdown updated to match.
- All security changes are tested: a `viewer` JWT hitting a technician-gated endpoint gets 403; a rate-limited burst gets 429.

## Out of scope
- Full Clerk JWT verification on the server side (requires Clerk webhook setup — separate task)
- CSRF tokens (app uses header-based auth, not cookie-only, so CSRF risk is low)
- Penetration testing or third-party security audit

## Tasks
1. **Fix CORS configuration** — Replace `origin: true` with a whitelist derived from `REPLIT_DEV_DOMAIN` env var in dev and a `ALLOWED_ORIGIN` env var in production; keep `credentials: true` only for the whitelisted origins.

2. **Add rate limiting middleware** — Install `express-rate-limit` and apply a global limiter (100 req/min/IP) plus stricter limiters on scan, checkout/return, and auth-related endpoints; return proper 429 responses with `Retry-After`.

3. **Role-gate missing endpoints** — Add `requireRole("technician")` to `POST /api/whatsapp/alert` and `POST /api/alert-acks`; audit all other routes that only have `requireAuth` and confirm viewer-appropriate access is intentional.

4. **Extend undo token TTL** — Change the server-side TTL constant from 12 to 90 seconds; update the frontend toast countdown timer and button label to match; update the `cleanExpiredUndoTokens` interval to use the new TTL.

## Relevant files
- `server/index.ts`
- `server/middleware/auth.ts`
- `server/routes/whatsapp.ts`
- `server/routes/alert-acks.ts`
- `server/routes/equipment.ts`
- `src/components/ui/toast.tsx`
