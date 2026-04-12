# Public Marketing Landing Page

## What & Why
The entire VetTrack app sits behind authentication — there is no public-facing surface that search engines, clinic administrators, or procurement teams can land on. A marketing landing page at `/landing` (linked from the login screen and the root URL when unauthenticated) serves as the primary SEO surface, letting the app rank for keywords like "veterinary equipment tracking software", "vet hospital QR tracking system", and "ER veterinary workflow tool". It also converts decision-makers who find the app via search or a shared link into sign-ups.

## Done looks like
- Unauthenticated users who visit `/` see a rich, keyword-optimized landing page before the login prompt
- The page includes: hero section with headline + tagline, a 3-column feature grid (QR scanning, offline-first, alert management), a "How it works" 3-step visual, a testimonial or social proof callout, and a "Get Started" CTA
- The page uses semantic HTML (`<main>`, `<section>`, `<article>`, `<h1>`–`<h3>`) and exactly one `<h1>` with the primary keyword
- SEO meta tags (`<title>`, `<meta description>`, OG tags via Helmet) are set specifically for the landing page
- The teal VetTrack design system is used throughout (consistent with the rest of the app)
- A "Sign In" button navigates to the auth flow; authenticated users bypass this page entirely and go straight to the dashboard
- The `/video` demo route is linked from the landing page ("Watch a 90-second demo")

## Out of scope
- Contact form or email capture backend
- Pricing page
- Blog or content marketing pages
- Multi-language support

## Tasks
1. **Create the landing page component** — Build `src/pages/landing.tsx` as a standalone full-page component (no bottom nav, no top app bar). Include hero, features grid, how-it-works steps, and CTA sections using semantic HTML and Tailwind.

2. **Wire up routing** — In `App.tsx`, show the landing page to unauthenticated users at `/` and redirect authenticated users past it directly to `/home` (or the existing dashboard). Keep existing routes unchanged for authenticated users.

3. **SEO and Helmet tags** — Add a `<Helmet>` block to the landing page with keyword-rich title ("VetTrack — Veterinary Equipment QR Tracking System"), a 155-character meta description, and all OG/Twitter tags pointing to the production domain.

4. **Link from auth and video** — Update the login/auth screen to include a "Learn more" link back to the landing page. Add a "Back to VetTrack" link on `/video` that returns to the landing page.

## Relevant files
- `src/App.tsx`
- `src/components/layout.tsx`
- `src/main.tsx`
- `src/hooks/use-auth.tsx`
