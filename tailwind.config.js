/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{html,js,jsx}'],
  theme: {
    extend: {
      colors: {
        twitch: {
          purple: '#9146FF',
          dark: '#0e0e10',
          mid: '#18181b',
          surface: '#1f1f23',
          border: '#2d2d35',
          text: '#efeff1',
          muted: '#adadb8'
        }
      }
    }
  },
  plugins: []
}
