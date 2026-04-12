# Clerk Authentication Integration

## What & Why
Wire up real Clerk authentication end-to-end. The packages (`@clerk/clerk-react`, `@clerk/express`) are already installed but the app currently runs on a hardcoded dev-user bypass on both the frontend and backend. Real Clerk must be connected so users can sign in with email/password or Google, sessions persist, and all protected routes are blocked for unauthenticated users.

## Done looks like
- Users can sign in via Clerk's hosted UI (email/password and Google OAuth) embedded on the `/signin` page
- All app routes except `/landing` and `/signin` redirect unauthenticated users to `/signin`
- After sign-in, the session persists across page refresh
- Signing out returns the user to `/landing`
- The backend rejects requests with no valid Clerk session token with a 401 (not just missing custom headers)
- In development (no keys set), the existing dev-bypass behaviour is preserved so the app still runs without env vars

## Out of scope
- Clerk organisation or multi-tenancy features
- Social providers beyond Google
- Clerk webhooks or user management dashboard
- Changes to RBAC roles — only authentication (identity) is in scope

## Tasks
1. **Environment variables** — Ensure `VITE_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` are read from the environment. Add guards so missing keys fall back to dev-bypass mode (same as the current `!process.env.CLERK_SECRET_KEY` check).

2. **Frontend — ClerkProvider** — In `src/main.tsx`, replace `DevAuthProvider` with `ClerkProvider` from `@clerk/clerk-react`, passing `VITE_CLERK_PUBLISHABLE_KEY`. When the key is absent (dev mode), keep `DevAuthProvider` as the fallback.

3. **Frontend — useAuth hook** — Rewrite `src/hooks/use-auth.tsx` so the `AuthProvider` wraps Clerk's `useUser` / `useAuth` hooks, mapping Clerk's user object to the existing `AuthContextType` shape (userId, email, name, role, isLoaded, isSignedIn, isAdmin). The role is still fetched from the app's own DB via the existing `/api/users/me` endpoint after sign-in.

4. **Frontend — auth-store token** — Update `src/lib/auth-store.ts` to store the Clerk session JWT (from `useSession` / `getToken()`) and expose it as an `Authorization: Bearer <token>` header in `getAuthHeaders()`, replacing the current custom `x-clerk-*` header approach.

5. **Frontend — Sign-in page** — Replace the placeholder content in `src/pages/signin.tsx` with Clerk's `<SignIn>` component, pre-configured with Google as a social provider and redirecting to `/` on success. Style the container to match the existing teal brand.

6. **Frontend — Route guards** — Add a `<ProtectedRoute>` wrapper in `src/App.tsx` that checks `isLoaded` and `isSignedIn`. Wrap all routes except `/landing`, `/signin`, and `/video` with it so unauthenticated users are redirected to `/signin`.

7. **Backend — requireAuth middleware** — Update `server/middleware/auth.ts` to verify requests using `getAuth(req)` from `@clerk/express` (which reads the `Authorization: Bearer` token validated by Clerk's SDK). Remove the custom `x-clerk-*` header parsing. Keep the existing dev-bypass when `CLERK_SECRET_KEY` is absent.

8. **Backend — clerkMiddleware** — Add `clerkMiddleware()` from `@clerk/express` to `server/index.ts` so Clerk's SDK can parse and cache the auth token before route handlers run.

## Relevant files
- `src/main.tsx`
- `src/App.tsx`
- `src/hooks/use-auth.tsx`
- `src/lib/auth-store.ts`
- `src/lib/api.ts:41-47`
- `src/pages/signin.tsx`
- `server/index.ts`
- `server/middleware/auth.ts`
