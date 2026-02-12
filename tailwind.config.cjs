/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#edf9f7',
          100: '#d2f1ec',
          200: '#a7e3da',
          300: '#73cfc4',
          400: '#3ab5a8',
          500: '#159587',
          600: '#0f766e',
          700: '#0f615b',
          800: '#114d49',
          900: '#123f3d',
        },
        mint: {
          50: '#fff4e8',
          100: '#ffe6cb',
          200: '#ffce9a',
          300: '#ffaf5f',
          400: '#f58e35',
          500: '#dd6b20',
          600: '#bb521a',
          700: '#973f18',
          800: '#7a3518',
          900: '#642e16',
        },
      },
      fontFamily: {
        sans: ['Lexend', 'sans-serif'],
        display: ['Syne', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 16px 32px rgba(20, 50, 47, 0.16)',
      },
    },
  },
  plugins: [],
};
