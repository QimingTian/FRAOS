import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: '#08090a',
        fg: '#eee9dc',
        muted: '#9da0a7',
        surface: '#151616',
        line: 'rgba(255, 255, 255, 0.14)',
      },
      fontFamily: {
        sans: [
          'SF Pro Text',
          'SF Pro Display',
          '-apple-system',
          'BlinkMacSystemFont',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        display: [
          'SF Pro Display',
          'SF Pro Text',
          '-apple-system',
          'BlinkMacSystemFont',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
}

export default config
