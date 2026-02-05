/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        ragweld: {
          // Match the TriBridRAG "Surgical" UI theme (vendored demo tokens).
          accent: '#64748b',
          bg: '#09090b',
          elev1: '#0f0f12',
          elev2: '#18181b',
          border: '#27272a',
          fg: '#e4e4e7',
          muted: '#71717a',
          link: '#94a3b8',
          code: '#18181b'
        }
      }
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
