/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
        fontFamily: {
      sans: ['Inter', 'sans-serif'],
    },
      colors: {
        sidebar: "#f8f9fa",
        primary: "#ff5722",
        border: "#e5e7eb",
      }
    },
  },
  plugins: [],
}