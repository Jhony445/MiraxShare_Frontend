/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // Discord-like gray scale: 950 is the darkest (inputs, video stage), 700 is the page.
      colors: {
        surface: {
          950: '#1e1f22',
          900: '#232428',
          800: '#2b2d31',
          700: '#313338',
          600: '#383a40',
          500: '#404249',
          400: '#4e5058',
          300: '#6d6f78',
        },
        fg: {
          DEFAULT: '#dbdee1',
          strong: '#f2f3f5',
          muted: '#949ba4',
        },
        accent: {
          DEFAULT: '#5865f2',
          hover: '#4752c4',
        },
        ok: '#23a55a',
        warn: '#f0b232',
        danger: {
          DEFAULT: '#da373c',
          hover: '#a12828',
        },
      },
    },
  },
  plugins: [],
};
