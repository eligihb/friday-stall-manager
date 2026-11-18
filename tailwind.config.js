/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Heebo', 'system-ui', 'sans-serif'],
        serif: ['Frank Ruhl Libre', 'Georgia', 'serif'],
      },
      colors: {
        cream: {
          50: '#FDFBF7',
          100: '#FAF6F0',
          200: '#F3E9DC',
          300: '#E8D5BE',
        },
        terracotta: {
          50: '#FFF7ED',
          100: '#FFEDD5',
          200: '#FED7AA',
          500: '#C85A17',
          600: '#A9440F',
          700: '#8A330B',
          800: '#6D280B',
          900: '#4C1B07',
        },
        amberwarm: {
          500: '#D97706',
          600: '#B45309',
          700: '#92400E',
        },
        slateink: {
          700: '#334155',
          800: '#1E242B',
          900: '#13171C',
        },
      },
      boxShadow: {
        soft: '0 2px 14px -3px rgba(30, 36, 43, 0.08), 0 1px 4px -2px rgba(30, 36, 43, 0.05)',
        card: '0 8px 28px -8px rgba(138, 51, 11, 0.12)',
      },
    },
  },
  plugins: [],
};
