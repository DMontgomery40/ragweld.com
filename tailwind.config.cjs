/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        ragweld: {
          accent: '#00ff88',
          bg: '#0a0a0a',
          border: '#222',
          muted: '#666'
        }
      }
    },
  },
  plugins: [],
};
