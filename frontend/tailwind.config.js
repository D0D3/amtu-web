/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        amtu: {
          50: '#f0f4ff',
          100: '#e0e9ff',
          400: '#6b8af7',
          500: '#4f6ef5',
          600: '#3b55e8',
          700: '#2d42cc',
          900: '#1a2580',
        }
      }
    }
  },
  plugins: [],
}
