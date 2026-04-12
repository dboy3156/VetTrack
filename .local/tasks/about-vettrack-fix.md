# Fix About VetTrack Page for Signed-In Users

## What & Why
The "About VetTrack" menu item in the navigation links to `/landing`, but the landing page immediately redirects signed-in users back to `/` and renders nothing. This means logged-in staff who tap "About VetTrack" see a blank flash and get bounced away. The page needs to work for both authenticated and unauthenticated visitors.

## Done looks like
- Signed-in users can navigate to `/landing` via the "About VetTrack" menu item and see the full landing page content
- The CTA buttons adapt based on auth state: signed-in users see a "Back to App" button instead of "Sign In" / "Get Started Free"
- Unauthenticated visitors still see the original sign-in CTAs
- No unwanted redirect happens for signed-in users

## Out of scope
- Redesigning the landing page content or layout
- Adding a separate `/about` route

## Tasks
1. **Remove the signed-in redirect and render guard** — Remove the `useEffect` that navigates signed-in users away and the `if (!isLoaded || isSignedIn) return null` guard from the landing page.
2. **Adapt CTAs based on auth state** — When the user is signed in, replace "Get Started Free" / "Sign In" buttons with a "Back to App" link pointing to `/`. Keep unauthenticated behaviour unchanged.

## Relevant files
- `src/pages/landing.tsx`
- `src/components/layout.tsx:134`
- `src/App.tsx:95`
