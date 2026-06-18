/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: '#050505',
        gold: {
          50: '#fcfbf7',
          100: '#f8f4eb',
          200: '#f1e5ac',
          300: '#eadd96',
          400: '#dfc261',
          500: '#d4af37',
          600: '#b8942b',
          700: '#94741e',
          800: '#7a5e1b',
          900: '#654d19',
        }
      },
    },
  },
  plugins: [],
}
