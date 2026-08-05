/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        amana: {
          50:  '#f0f9f4',
          100: '#dcf0e5',
          200: '#bbe1cc',
          300: '#8bcaac',
          400: '#55ab83',
          500: '#318e63',
          600: '#22714e',
          700: '#1b5a3f',
          800: '#184834',
          900: '#143b2b',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
