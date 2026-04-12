# SEO & Meta Tag Foundation

## What & Why
VetTrack's `index.html` is missing Open Graph tags, Twitter Card tags, JSON-LD structured data, `robots.txt`, and `sitemap.xml`. There are also no per-route dynamic page titles — every tab and bot sees the same static "VetTrack" title. These gaps make the app invisible to social share previews, search crawlers, and link unfurlers, which matters for clinic decision-makers who discover SaaS tools via web search or shared links.

## Done looks like
- Sharing any VetTrack URL on Slack/WhatsApp/LinkedIn shows a rich preview card (correct title, description, and branded OG image)
- Each app route has a unique, descriptive `<title>` tag visible in browser tabs and search snippets
- A `robots.txt` exists at the project root, allowing crawl of public routes and blocking auth-only routes
- A `sitemap.xml` is served at `/sitemap.xml` listing all public-facing routes
- JSON-LD `WebApplication` schema is embedded in the HTML shell so search engines understand the app's purpose
- Google Rich Results Test returns no errors for the home URL

## Out of scope
- Server-side rendering or pre-rendering for SPA routes (future)
- Per-route OG images (use shared branded image for now)
- Google Search Console submission

## Tasks
1. **Install react-helmet-async** — Add the library and wrap the app root in `HelmetProvider` so any route can inject `<title>` and `<meta>` tags into `<head>`.

2. **Add per-route Helmet tags** — In each page component, add a `<Helmet>` block with a unique `<title>` (format: "Page Name — VetTrack") and a relevant `<meta name="description">` summarizing what that page does for clinical staff.

3. **Enrich index.html head** — Add Open Graph tags (`og:title`, `og:description`, `og:image`, `og:url`, `og:type`), Twitter Card tags, and the JSON-LD `WebApplication` schema block. Generate or use an existing `/og-image.png` (1200×630 teal branded image).

4. **Add robots.txt and sitemap.xml** — Create `public/robots.txt` allowing all crawlers on `/`, `/video`, blocking `/admin`, `/api`. Create `public/sitemap.xml` listing the public routes with correct domain from `VITE_PUBLIC_URL` or a hardcoded production URL.

5. **Generate OG image** — Create a simple 1200×630 branded PNG (`public/og-image.png`) with VetTrack logo, tagline, and teal background to use as the social share image.

## Relevant files
- `index.html`
- `src/App.tsx`
- `src/pages/home.tsx`
- `src/pages/equipment-list.tsx`
- `src/pages/equipment-detail.tsx`
- `src/pages/alerts.tsx`
- `src/pages/my-equipment.tsx`
- `src/pages/analytics.tsx`
- `src/pages/management-dashboard.tsx`
