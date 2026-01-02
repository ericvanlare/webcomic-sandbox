# Copilot Instructions for Webcomic Sandbox

This is a webcomic website built with Astro SSR, deployed on Cloudflare Pages.

## Project Structure

```
apps/
├── site/                    # Astro SSR site (Cloudflare Pages)
│   └── src/
│       ├── pages/           # Routes (index, comic/[slug], archive, admin)
│       ├── layouts/         # BaseLayout.astro (shared layout)
│       ├── lib/             # sanity.ts (CMS queries)
│       └── styles/          # Global styles (if any)
└── worker/                  # Cloudflare Worker API
    └── src/index.ts         # API endpoints

packages/shared/             # Shared TypeScript types
sanity/                      # Sanity CMS schema definitions
```

## Key Files for Common Changes

### Styling/Theming

- `apps/site/src/layouts/BaseLayout.astro` - Global layout, header, footer, base styles
- `apps/site/src/pages/*.astro` - Page-specific styles (use `<style>` blocks)

### Layout/Navigation

- `apps/site/src/layouts/BaseLayout.astro` - Header, nav, footer
- `apps/site/src/pages/index.astro` - Homepage layout
- `apps/site/src/pages/comic/[slug].astro` - Comic page layout with prev/next nav

### Content Display

- `apps/site/src/pages/index.astro` - Latest comic display
- `apps/site/src/pages/comic/[slug].astro` - Individual comic page
- `apps/site/src/pages/archive.astro` - Archive listing
- `apps/site/src/lib/sanity.ts` - CMS queries

### Admin Panel

- `apps/site/src/pages/admin/index.astro` - Admin UI

## Tech Stack

- **Framework**: Astro 5.x with SSR
- **Hosting**: Cloudflare Pages
- **API**: Cloudflare Workers
- **CMS**: Sanity.io
- **Styling**: Inline styles and scoped `<style>` blocks (no CSS framework)

## Conventions

1. Use scoped `<style>` blocks in Astro components
2. Keep styles simple - no CSS framework is used
3. Use semantic HTML
4. Maintain accessibility (alt text, proper headings)
5. Test changes work with SSR (no client-side only code in initial render)

## Environment Variables

Environment variables are accessed via `astro:env/server`:

```typescript
import { SANITY_PROJECT_ID } from 'astro:env/server';
```

## Don't Modify

- `apps/worker/` - API code (unless specifically asked)
- `sanity/` - CMS schema (unless specifically asked)
- `packages/shared/` - Shared types (unless specifically asked)
- `.github/workflows/` - CI/CD config
- `wrangler.toml` files
- `astro.config.mjs` (unless specifically asked)
