/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        coral: {
          50: "#fff1ef",
          100: "#ffe1dd",
          200: "#ffc7bf",
          300: "#ffa194",
          400: "#ff7a68",
          500: "#fa5a45",
          600: "#e8402b",
          700: "#c2301f",
          800: "#9c2a1d",
          900: "#7c271c"
        }
      }
    }
  },
  plugins: []
};
