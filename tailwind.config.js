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
          raised:  'var(--surface)',
          sunken:  'var(--sunken)',
          muted:   'var(--muted)',
        },
        // Semantic scales, split by ROLE for a dark canvas:
        //   50/100 → translucent tint + hairline for inline callout panels
        //   500/600 → saturated solid fills (dots, bars, danger buttons)
        //   700/800/900 → light text that clears AA on #0D0D0D
        // Pairing a -600 fill with -700 text is the intended combination.
        brand: {
          50:  'rgba(124,255,154,0.08)',
          100: 'rgba(124,255,154,0.18)',
          200: '#BBF7D0',
          300: '#9CFFB0',
          400: '#9CFFB0',
          500: '#7CFF9A',
          600: '#7CFF9A',
          700: '#5FE07D',
          800: '#9CFFB0',
          900: '#BBF7D0',
        },
        grass: {
          50:  'rgba(124,255,154,0.08)',
          100: 'rgba(124,255,154,0.18)',
          500: '#7CFF9A',
          600: '#15803D',
          700: '#7CFF9A',
          800: '#BBF7D0',
          900: '#DCFCE7',
        },
        amber: {
          50:  'rgba(245,158,11,0.10)',
          100: 'rgba(245,158,11,0.20)',
          500: '#F59E0B',
          600: '#D97706',
          700: '#FCD34D',
          800: '#FDE68A',
          900: '#FEF3C7',
        },
        crimson: {
          50:  'rgba(239,68,68,0.10)',
          100: 'rgba(239,68,68,0.22)',
          500: '#EF4444',
          600: '#DC2626',
          700: '#FCA5A5',
          800: '#FECACA',
          900: '#FEE2E2',
        },
        // Landing-page brand red — the YouTube mark's pure #FF0000, taken
        // verbatim from the Stitch comp. Registered here (not as hand-written
        // CSS) so variants like hover:text-red-brand and bg-red-brand/20
        // actually generate.
        'red-brand': {
          DEFAULT: '#FF0000',
          ink:  '#E60000',
          50:   '#FFF1F1',
          100:  '#FFE0E0',
          200:  '#FFC7C7',
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
