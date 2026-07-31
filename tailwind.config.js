/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Neutral gray scale — clean SaaS (Linear / Vercel / Notion).
        // 900 = near-black primary text (#111), 600 = secondary (#666),
        // 200 = hairline borders (#ECECEC), 50 = canvas (#FAFAFA).
        ink: {
          50:  'var(--ink-50)',
          100: 'var(--ink-100)',
          150: 'var(--ink-150)',
          200: 'var(--ink-200)',
          300: 'var(--ink-300)',
          400: 'var(--ink-400)',
          500: 'var(--ink-500)',
          600: 'var(--ink-600)',
          700: 'var(--ink-700)',
          800: 'var(--ink-800)',
          900: 'var(--ink-900)',
          950: 'var(--ink-950)',
        },
        surface: {
          canvas:  'var(--canvas)',
          panel:   'var(--panel)',
          sunken:  'var(--sunken)',
          muted:   'var(--muted)',
        },
        // Emerald — the single brand accent. Primary actions, active nav,
        // links, scores. brand-600 = #16A34A (the button green in mockups).
        brand: {
          50:  '#ECFDF3',
          100: '#D1FADF',
          200: '#A6F4C5',
          300: '#6CE9A6',
          400: '#32D583',
          500: '#12B76A',
          600: '#16A34A',
          700: '#15803D',
          800: '#166534',
          900: '#14532D',
        },
        // Success semantics — aligned to the emerald brand.
        grass: {
          50:  '#ECFDF3',
          100: '#D1FADF',
          500: '#16A34A',
          600: '#15803D',
          700: '#166534',
          900: '#14532D',
        },
        amber: {
          50:  '#FFFAEB',
          100: '#FEF0C7',
          500: '#F59E0B',
          600: '#D97706',
          700: '#B45309',
        },
        crimson: {
          50:  '#FEF3F2',
          100: '#FEE4E2',
          500: '#EF4444',
          600: '#DC2626',
          700: '#B91C1C',
        },
      },
      fontFamily: {
        sans: ['Geist', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        // Display is ALSO sans — clean SaaS has no serif. Bold, tight tracking.
        display: ['Geist', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['Geist Mono', 'IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': ['10.5px', { lineHeight: '14px', letterSpacing: '0.02em' }],
        'xs':  ['12px',   { lineHeight: '18px' }],
        'sm':  ['13.5px', { lineHeight: '20px' }],
        'base':['15px',   { lineHeight: '24px' }],
        'lg':  ['17px',   { lineHeight: '26px' }],
        'xl':  ['20px',   { lineHeight: '28px', letterSpacing: '-0.01em' }],
        '2xl': ['24px',   { lineHeight: '32px', letterSpacing: '-0.02em' }],
        '3xl': ['30px',   { lineHeight: '36px', letterSpacing: '-0.025em' }],
        '4xl': ['38px',   { lineHeight: '44px', letterSpacing: '-0.03em' }],
        '5xl': ['52px',   { lineHeight: '56px', letterSpacing: '-0.035em' }],
        '6xl': ['64px',   { lineHeight: '68px', letterSpacing: '-0.04em' }],
        '7xl': ['80px',   { lineHeight: '84px', letterSpacing: '-0.04em' }],
      },
      borderRadius: {
        DEFAULT: '8px',
        sm: '6px',
        md: '8px',
        lg: '10px',
        xl: '12px',   // inputs
        '2xl': '16px', // cards (workhorse)
        '3xl': '24px', // large surfaces / hero panels
      },
      boxShadow: {
        'xs':      '0 1px 2px rgba(17,17,17,0.04)',
        'subtle':  '0 1px 2px rgba(17,17,17,0.05), 0 1px 3px rgba(17,17,17,0.04)',
        'card':    '0 1px 3px rgba(17,17,17,0.05), 0 4px 16px -6px rgba(17,17,17,0.06)',
        'float':   '0 8px 30px -10px rgba(17,17,17,0.12), 0 2px 8px -3px rgba(17,17,17,0.06)',
        'ring':    '0 0 0 1px rgba(17,17,17,0.05), 0 1px 2px rgba(17,17,17,0.04)',
        'inset-soft': 'inset 0 1px 0 rgba(255,255,255,0.6)',
      },
      backgroundImage: {
        'grid': "linear-gradient(rgba(17,17,17,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(17,17,17,0.03) 1px, transparent 1px)",
        'radial-fade': 'radial-gradient(60% 50% at 50% 0%, rgba(22,163,74,0.06) 0%, transparent 70%)',
        'paper': 'linear-gradient(180deg, #FFFFFF 0%, #FAFAFA 100%)',
      },
      backgroundSize: {
        'grid': '40px 40px',
      },
      animation: {
        'fade-in': 'fade-in 0.35s cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in-up': 'fade-in-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) both',
        'scale-in': 'scale-in 0.28s cubic-bezier(0.22, 1, 0.36, 1) both',
        'ticker': 'ticker 40s linear infinite',
        'pulse-soft': 'pulse-soft 2.4s ease-in-out infinite',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(14px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to:   { opacity: '1', transform: 'scale(1)' },
        },
        'ticker': {
          from: { transform: 'translateX(0)' },
          to:   { transform: 'translateX(-50%)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.55' },
        },
      },
    },
  },
  plugins: [],
}
