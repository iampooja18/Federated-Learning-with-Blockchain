/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        customGreen: 'rgba(204, 203, 181, 0.4)',
        bgMessage: 'rgba(178, 240, 239, 0.3)',
      },
    },
  },
  plugins: [
    require('daisyui'),
    require('tailwind-scrollbar-hide'), // <-- add this line
  ],
}



