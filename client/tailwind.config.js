/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Chess board colors
        'board-light': '#E8D5B5',
        'board-dark': '#B58863',
        'board-highlight': '#F7F769',
        'board-move': '#829769',
        'board-check': '#FF6B6B',
        // UI colors - Midnight theme
        'midnight': {
          50: '#f0f4f8',
          100: '#d9e2ec',
          200: '#bcccdc',
          300: '#9fb3c8',
          400: '#829ab1',
          500: '#627d98',
          600: '#486581',
          700: '#334e68',
          800: '#243b53',
          900: '#102a43',
          950: '#0a1929',
        },
        'accent': {
          DEFAULT: '#00D9FF',
          light: '#5CE5FF',
          dark: '#00A8CC',
        },
        'gold': {
          DEFAULT: '#FFD700',
          light: '#FFE44D',
          dark: '#CC9A00',
        }
      },
      fontFamily: {
        'display': ['Playfair Display', 'Georgia', 'serif'],
        'sans': ['DM Sans', 'system-ui', 'sans-serif'],
        'mono': ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'slide-up': 'slide-up 0.3s ease-out',
        'slide-down': 'slide-down 0.3s ease-out',
        'fade-in': 'fade-in 0.3s ease-out',
        'piece-move': 'piece-move 0.2s ease-out',
        'check-flash': 'check-flash 0.5s ease-in-out',
        'capture': 'capture 0.3s ease-out',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(0, 217, 255, 0.3)' },
          '50%': { boxShadow: '0 0 40px rgba(0, 217, 255, 0.6)' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'slide-down': {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'piece-move': {
          '0%': { transform: 'scale(1.2)' },
          '100%': { transform: 'scale(1)' },
        },
        'check-flash': {
          '0%, 100%': { backgroundColor: 'transparent' },
          '50%': { backgroundColor: 'rgba(255, 107, 107, 0.5)' },
        },
        'capture': {
          '0%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.2)', opacity: '0.5' },
          '100%': { transform: 'scale(0)', opacity: '0' },
        },
      },
      boxShadow: {
        'piece': '0 4px 8px rgba(0, 0, 0, 0.3)',
        'piece-hover': '0 6px 12px rgba(0, 0, 0, 0.4)',
        'board': '0 10px 40px rgba(0, 0, 0, 0.5)',
        'card': '0 4px 20px rgba(0, 0, 0, 0.3)',
        'glow': '0 0 30px rgba(0, 217, 255, 0.4)',
      },
    },
  },
  plugins: [],
}
