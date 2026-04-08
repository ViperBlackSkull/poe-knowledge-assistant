/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Path of Exile Theme Colors
        poe: {
          // Primary colors
          gold: '#AF6025',
          'gold-light': '#D4A85A',
          'gold-dark': '#7D4A1C',

          // Background colors
          bg: {
            primary: '#0C0C0E',
            secondary: '#141418',
            tertiary: '#1C1C22',
            card: '#1A1A1F',
          },

          // Text colors
          text: {
            primary: '#C8C8C8',
            secondary: '#9F9F9F',
            muted: '#6B6B6B',
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
          border: '#3D3D44',
          'border-light': '#4A4A52',
          hover: '#2A2A32',
          active: '#3A3A44',
        },
      },
      fontFamily: {
        poe: ['Fontin', 'Georgia', 'serif'],
        mono: ['Consolas', 'Monaco', 'monospace'],
      },
      boxShadow: {
        'poe-glow': '0 0 10px rgba(175, 96, 37, 0.5)',
        'poe-glow-strong': '0 0 20px rgba(175, 96, 37, 0.7)',
        'poe-inset': 'inset 0 0 10px rgba(0, 0, 0, 0.5)',
      },
      backgroundImage: {
        'poe-gradient': 'linear-gradient(180deg, #1A1A1F 0%, #0C0C0E 100%)',
        'poe-card-gradient': 'linear-gradient(180deg, #1F1F24 0%, #141418 100%)',
        'poe-header-gradient': 'linear-gradient(180deg, #2A2A32 0%, #1A1A1F 100%)',
      },
      borderColor: {
        poe: '#3D3D44',
      },
    },
  },
  plugins: [],
}
