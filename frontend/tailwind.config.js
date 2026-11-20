/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        whatsapp: {
          dark: '#075E54',      // Deep WhatsApp header/accent green
          teal: '#128C7E',      // WhatsApp secondary brand color
          green: '#25D366',     // WhatsApp accent vibrant green
          light: '#D9FDD3',     // WhatsApp incoming message bubble
          panel: '#F0F2F5',     // WhatsApp Web panel background
          border: '#E9EDEF',    // WhatsApp subtle borders
          text: '#111B21',      // Primary dark text
          muted: '#667781',     // WhatsApp secondary muted text
        },
      },
      fontFamily: {
        sans: [
          'Segoe UI',
          'Helvetica Neue',
          'Helvetica',
          'Lucida Grande',
          'Arial',
          'Ubuntu',
          'Cantarell',
          'Fira Sans',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};

