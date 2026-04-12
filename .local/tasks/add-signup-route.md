# Add /signup Route with Clerk

## What & Why
The app has a working `/signin` page using Clerk but no `/signup` route. Users trying to create an account have nowhere to go. This adds a matching `/signup` page using Clerk's `<SignUp />` component, following the exact same patterns as the existing signin page.

## Done looks like
- Navigating to `/signup` renders Clerk's signup UI with the same VetTrack branding, layout, and teal color scheme as the signin page
- After a successful signup, the user is authenticated and redirected to `/`
- A fallback state is shown when `VITE_CLERK_PUBLISHABLE_KEY` is not set (matching the dev-mode fallback on signin)
- The route is lazy-loaded in App.tsx the same way all other pages are

## Out of scope
- Changing the existing signin page
- Adding a link to `/signup` from other pages
- Custom signup form fields beyond what Clerk provides

## Tasks
1. **Create signup page** — Add `src/pages/signup.tsx` mirroring the structure of `src/pages/signin.tsx`: same layout, branding header, Helmet SEO tags, teal appearance config (`routing="hash"`, `fallbackRedirectUrl="/"`), and dev-mode fallback. Use Clerk's `<SignUp />` instead of `<SignIn />`. Redirect to `/` if already signed in.

2. **Register route in App.tsx** — Add a lazy import for the new signup page and a `<Route path="/signup" component={SignUpPage} />` entry alongside the existing `/signin` route.

## Relevant files
- `src/pages/signin.tsx`
- `src/App.tsx:1-27,140-160`
