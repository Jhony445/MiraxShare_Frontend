/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff7ff',
          100: '#dbeeff',
          200: '#badfff',
          300: '#8bc9ff',
          400: '#57a9ff',
          500: '#2b85ff',
          600: '#1f67e0',
          700: '#1b55b7',
          800: '#1a478f',
          900: '#173a6e',
        },
        mint: {
          50: '#edfbf7',
          100: '#d6f5ec',
          200: '#aee9db',
          300: '#77d7c4',
          400: '#3ec1ac',
          500: '#1aa290',
          600: '#168475',
          700: '#13685f',
          800: '#115349',
          900: '#0f443d',
        },
      },
      fontFamily: {
        sans: ['Manrope', 'sans-serif'],
        display: ['Sora', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 10px 35px rgba(15, 23, 42, 0.08)',
      },
    },
  },
  plugins: [],
};
