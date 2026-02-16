import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import react from '@astrojs/react';

import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://ragweld.com',
  integrations: [tailwind(), react(), sitemap()],
  output: 'static',
  // Blog post redirect handled by netlify.toml (301) — don't duplicate here
  // or Astro generates an HTML file that shadows the server-level redirect.
});
