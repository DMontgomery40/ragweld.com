/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        crucible: {
          bg: '#0A0B0D',
          panel: '#11141A',
          panelRaised: '#181D26',
          border: '#2B3240',
          text: '#E8EEF8',
          muted: '#95A4B8',
          accent: '#68F0C1',
          accentWarm: '#F4B860',
          danger: '#F87171',
          success: '#22C55E',
          warning: '#F59E0B',
        },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(104, 240, 193, 0.24), 0 0 28px rgba(104, 240, 193, 0.08)',
      },
      backgroundImage: {
        grid: 'linear-gradient(rgba(43, 50, 64, 0.25) 1px, transparent 1px), linear-gradient(90deg, rgba(43, 50, 64, 0.25) 1px, transparent 1px)',
      },
    },
  },
  plugins: [],
}
