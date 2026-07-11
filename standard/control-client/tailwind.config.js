/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'apple-gray': '#D4CDCB',
        'apple-dark': '#17181F',
        'apple-blue': '#000000',
        'apple-blue-hover': '#000000',
      },
    },
  },
  plugins: [],
}
