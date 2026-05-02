/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary palette - Emerald forest theme
        primary: {
          DEFAULT: '#2D9E6B',
          hover: '#259058',
          light: '#EDFAF4',
          50: '#ECFDF5',
          100: '#D1FAE5',
          200: '#A7F3D0',
          300: '#6EE7B7',
          400: '#34D399',
          500: '#2D9E6B',
          600: '#059669',
          700: '#047857',
          800: '#065F46',
          900: '#064E3B',
        },
        // Semantic colors
        success: {
          DEFAULT: '#16A34A',
          light: '#DCFCE7',
          dark: '#166534',
        },
        warning: {
          DEFAULT: '#D97706',
          light: '#FEF3C7',
          dark: '#B45309',
        },
        danger: {
          DEFAULT: '#DC2626',
          light: '#FEE2E2',
          dark: '#991B1B',
        },
        info: {
          DEFAULT: '#2563EB',
          light: '#DBEAFE',
          dark: '#1E40AF',
        },
        purple: {
          DEFAULT: '#7C3AED',
          light: '#EDE9FE',
          dark: '#5B21B6',
        },
        gold: {
          DEFAULT: '#B45309',
          light: '#FEF3C7',
          dark: '#92400E',
        },
        // Neutral palette - slate-based
        neutral: {
          50: '#F8FAFC',
          100: '#F1F5F9',
          200: '#E2E8F0',
          300: '#CBD5E1',
          400: '#94A3B8',
          500: '#64748B',
          600: '#475569',
          700: '#334155',
          800: '#1E293B',
          900: '#0F172A',
        },
        // Sidebar theme
        sidebar: {
          bg: '#0F172A',
          hover: '#1E293B',
          active: '#1E3A5F',
          border: '#334155',
          text: '#F8FAFC',
          textMuted: '#94A3B8',
        }
      },
      fontFamily: {
        arabic: ['"Noto Kufi Arabic"', 'sans-serif'],
        latin: ['"DM Sans"', 'sans-serif'],
        sans: ['"DM Sans"', 'Noto Kufi Arabic', 'system-ui', 'sans-serif'],
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
      },
      borderRadius: {
        DEFAULT: '8px',
        'sm': '6px',
        'md': '10px',
        'lg': '14px',
        'xl': '16px',
        '2xl': '20px',
        'full': '9999px',
      },
      boxShadow: {
        'card': '0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.04)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.05)',
        'dropdown': '0 4px 16px rgba(0,0,0,0.12)',
        'modal': '0 20px 40px rgba(0,0,0,0.15)',
        'sidebar': '4px 0 20px rgba(0,0,0,0.1)',
      },
      animation: {
        'fade-in': 'fadeIn 200ms ease-out',
        'slide-up': 'slideUp 200ms ease-out',
        'slide-down': 'slideDown 200ms ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}