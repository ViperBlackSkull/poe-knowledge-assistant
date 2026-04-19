/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        poe: {
          // Gold accents
          gold: '#AF6025',
          'gold-light': '#D4A85A',
          'gold-dark': '#7D4A1C',
          'gold-dim': '#6B5530',
          'gold-muted': '#4A3A28',

          // Dark backgrounds
          bg: {
            primary: '#0C0C0E',
            secondary: '#121215',
            tertiary: '#18181C',
            elevated: '#1E1E24',
            card: '#1A1A1F',
          },

          // Text
          text: {
            primary: '#E0E0E0',
            secondary: '#9F9FA8',
            muted: '#6B6B75',
            highlight: '#FFFFFF',
          },

          // Rarity colors (PoE item rarities)
          rarity: {
            normal: '#C8C8C8',
            magic: '#8888FF',
            rare: '#FFFF77',
            unique: '#AF6025',
            gem: '#1BA29B',
            currency: '#AA9E82',
          },

          // Element/status colors
          fire: '#FF4500',
          cold: '#00BFFF',
          lightning: '#FFD700',
          chaos: '#D02090',

          // UI colors
          border: '#2A2A30',
          'border-light': '#3A3A42',
          hover: '#2A2A32',
          active: '#3A3A44',

          // Accent colors
          teal: '#1BA29B',
          blue: '#8888FF',
          yellow: '#FFFF77',
        },
      },
      fontFamily: {
        display: ['Cinzel', 'Georgia', 'serif'],
        body: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        poe: ['Cinzel', 'Georgia', 'serif'],
        mono: ['Consolas', 'Monaco', 'monospace'],
      },
      boxShadow: {
        'poe-glow': '0 0 10px rgba(175, 96, 37, 0.5)',
        'poe-glow-strong': '0 0 20px rgba(175, 96, 37, 0.7)',
        'poe-inset': 'inset 0 0 10px rgba(0, 0, 0, 0.5)',
        'poe-teal-glow': '0 0 6px rgba(27, 162, 155, 0.4)',
      },
      backgroundImage: {
        'poe-gradient': 'linear-gradient(180deg, #121215 0%, #0C0C0E 100%)',
        'poe-card-gradient': 'linear-gradient(180deg, #1E1E24 0%, #121215 100%)',
        'poe-header-gradient': 'linear-gradient(180deg, #18181C 0%, #121215 100%)',
        'poe-button-gradient': 'linear-gradient(180deg, #4A3A28 0%, rgba(74, 58, 40, 0.8) 100%)',
      },
      borderColor: {
        poe: '#2A2A30',
      },
    },
  },
  plugins: [],
}
