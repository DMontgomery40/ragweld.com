# Handoff: ragweld SEO + GitHub Linking

## Context

ragweld.com is an Astro static site deployed on Netlify at https://ragweld.com. It's the marketing/docs site for ragweld, an open-source tribrid RAG workbench (vector + sparse + graph retrieval with trainable LoRA reranking). The repo is at github.com/DMontgomery40/ragweld. The owner's GitHub profile is github.com/DMontgomery40.

The site was just updated with:
- 396 individual glossary pages at `/glossary/[slug]/` (Astro dynamic routes via `getStaticPaths`)
- Sitemap (`sitemap-index.xml` → `sitemap-0.xml`, 397 URLs)
- `robots.txt` (permissive, explicitly allows AI crawlers)
- `llms.txt` and `llms-full.txt` (per llmstxt.org spec)
- 2 blog posts under `/blog/posts/`
- A live demo at `/demo/`

## What's Already Working

- **BaseLayout.astro** (`src/layouts/BaseLayout.astro`) already has OG tags (`og:title`, `og:description`, `og:type`, `og:url`, `og:image`) and Twitter Card tags. It accepts `ogImage`, `ogType`, `canonical`, `title`, `description`, `keywords` as props.
- **ogImage defaults to `/og-image.png`** — but **this file does not exist** in `public/`. Every shared link currently shows a blank preview image.
- The glossary `[slug].astro` page already sets `pageTitle`, `pageDescription`, `canonical`, and `keywords` props.
- The glossary index, blog pages, and home page pass `title` and `description`.

## Tasks (in priority order)

### 1. Create a default OG image (`public/og-image.png`)

Generate a 1200×630px PNG social sharing image. Should include:
- "ragweld" wordmark/logo
- Tagline: "See inside your RAG pipeline. Then fix it." or "Grafana for RAG pipelines"
- Dark background consistent with site theme (#09090b or #0f0f12)
- Text in white/light gray
- Subtle visual element suggesting a pipeline or dashboard (doesn't need to be complex)

This is the **highest-impact single task** — it affects every link share across Twitter, LinkedIn, Slack, Discord, HN, etc.

### 2. Add JSON-LD structured data to glossary pages

In `src/pages/glossary/[slug].astro`, add a `<script type="application/ld+json">` block in the `<head>` (via BaseLayout slot or inline). Use the `DefinedTerm` schema:

```json
{
  "@context": "https://schema.org",
  "@type": "DefinedTerm",
  "name": "{term.term}",
  "description": "{definition}",
  "inDefinedTermSet": {
    "@type": "DefinedTermSet",
    "name": "ragweld Parameter Glossary",
    "url": "https://ragweld.com/glossary/"
  },
  "url": "https://ragweld.com/glossary/{slug}/"
}
```

This gives Google rich snippet data for 396 pages. Huge for long-tail SEO on queries like "what is RRF_K_PARAMETER in RAG".

### 3. Add JSON-LD BreadcrumbList to glossary pages

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://ragweld.com/" },
    { "@type": "ListItem", "position": 2, "name": "Glossary", "item": "https://ragweld.com/glossary/" },
    { "@type": "ListItem", "position": 3, "name": "{term.term}", "item": "https://ragweld.com/glossary/{slug}/" }
  ]
}
```

### 4. Add JSON-LD to blog posts

Use `Article` or `BlogPosting` schema with `author`, `datePublished`, `headline`, `description`. Check the blog post layout at `src/layouts/BlogPostLayout.astro` for how frontmatter is passed.

### 5. Add JSON-LD SoftwareApplication to the home page

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "ragweld",
  "description": "Open-source tribrid RAG workbench...",
  "url": "https://ragweld.com",
  "applicationCategory": "DeveloperApplication",
  "operatingSystem": "Linux, macOS, Windows (Docker)",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD",
    "description": "Free self-hosted (MIT license)"
  },
  "author": {
    "@type": "Person",
    "name": "David Montgomery",
    "url": "https://github.com/DMontgomery40"
  }
}
```

### 6. Fix ogImage to be absolute URL

The current `ogImage` prop defaults to `/og-image.png` (relative). OG tags require absolute URLs. In BaseLayout.astro, change the og:image and twitter:image meta tags:

```astro
<!-- Replace relative ogImage with absolute -->
<meta property="og:image" content={new URL(ogImage, site).toString()} />
<meta name="twitter:image" content={new URL(ogImage, site).toString()} />
```

### 7. Add GitHub links to site navigation

In `src/components/Nav.astro` and `src/components/Footer.astro`:
- Add link to owner profile: `https://github.com/DMontgomery40` (use a GitHub icon)
- Add link to project repo: `https://github.com/DMontgomery40/ragweld`
- Both should be `target="_blank" rel="noopener noreferrer"`

### 8. GitHub-side changes (requires GitHub MCP or manual)

On the **ragweld repo** (github.com/DMontgomery40/ragweld):
- Set the "Website" field to `https://ragweld.com` (repo settings → About section)
- Set description to something like: "Open-source tribrid RAG workbench — vector + sparse + graph retrieval with trainable LoRA reranking, embedded Grafana, and 396 configurable parameters"
- Add topics: `rag`, `retrieval-augmented-generation`, `vector-search`, `bm25`, `graphrag`, `reranking`, `lora`, `grafana`, `llm`, `open-source`

On **DMontgomery40 profile**:
- Ensure the profile README links to ragweld.com
- Pin the ragweld repo

### 9. Add a `<head>` slot to BaseLayout (if not present)

Check if BaseLayout supports injecting arbitrary `<head>` content (for JSON-LD). If not, add a named slot:

```astro
<head>
  <!-- existing meta tags -->
  <slot name="head" />
</head>
```

Then glossary pages can do:
```astro
<BaseLayout ...>
  <Fragment slot="head">
    <script type="application/ld+json" set:html={JSON.stringify(jsonLd)} />
  </Fragment>
  <!-- page content -->
</BaseLayout>
```

## File Locations

- `src/layouts/BaseLayout.astro` — base HTML layout with OG/Twitter meta
- `src/layouts/BlogPostLayout.astro` — blog post layout (check for frontmatter handling)
- `src/pages/glossary/[slug].astro` — individual glossary term pages
- `src/pages/glossary/index.astro` — glossary listing page
- `src/pages/index.astro` — home page
- `src/components/Nav.astro` — top navigation
- `src/components/Footer.astro` — site footer
- `src/lib/glossary.ts` — glossary data loading, slugify helpers (`slugifyTerm`, `slugifyKey`), category definitions
- `public/glossary.json` — raw glossary data (396 terms with key, term, definition, category, related, links, badges)
- `public/robots.txt` — already permissive
- `public/llms.txt` — already complete
- `public/og-image.png` — **DOES NOT EXIST, must create**

## Build & Deploy

```bash
cd /Users/davidmontgomery/ragweld.com
npm run build          # builds demo + astro site
npx netlify deploy --prod   # deploys to ragweld.com
```

Build takes ~10 seconds, generates 398 pages. Zero errors as of last build.

## Technical Notes

- Astro 5.x, static output mode, Tailwind CSS, deployed on Netlify
- The slugify bug (bare `slugify()` not defined) was already fixed — helpers are now exported from `src/lib/glossary.ts`
- The glossary JSON can be at `../ragweld/web/public/glossary.json` (sibling repo) or `public/glossary.json` (pinned copy) — see `resolveGlossaryJsonPath()` in glossary.ts
- Site theme: dark (#09090b background, #e4e4e7 text, #64748b accent, #27272a borders)
