/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
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
          50:  'rgb(var(--ink-50) / <alpha-value>)',
          100: 'rgb(var(--ink-100) / <alpha-value>)',
          150: 'rgb(var(--ink-150) / <alpha-value>)',
          200: 'rgb(var(--ink-200) / <alpha-value>)',
          300: 'rgb(var(--ink-300) / <alpha-value>)',
          400: 'rgb(var(--ink-400) / <alpha-value>)',
          500: 'rgb(var(--ink-500) / <alpha-value>)',
          600: 'rgb(var(--ink-600) / <alpha-value>)',
          700: 'rgb(var(--ink-700) / <alpha-value>)',
          800: 'rgb(var(--ink-800) / <alpha-value>)',
          900: 'rgb(var(--ink-900) / <alpha-value>)',
          950: 'rgb(var(--ink-950) / <alpha-value>)',
        },
        surface: {
          canvas:  'rgb(var(--canvas) / <alpha-value>)',
          panel:   'rgb(var(--panel) / <alpha-value>)',
          raised:  'rgb(var(--surface) / <alpha-value>)',
          sunken:  'rgb(var(--sunken) / <alpha-value>)',
          muted:   'rgb(var(--muted) / <alpha-value>)',
        },
        // Semantic scales. Every step resolves to a CSS variable, so the
        // sidebar's light/dark toggle re-maps the whole system at the token
        // layer and no component ever needs a `dark:` variant.
        //   50/100  → tint fill + hairline for inline callouts
        //   200/300 → decorative (rings, dividers, chart grid)
        //   400/500/600 → solid fills (bars, dots, buttons)
        //   700/800/900 → text that clears AA sitting on the 50 tint
        // Pairing a -50 fill with -700 text is the intended combination.
        brand: {
          50:  'rgb(var(--brand-50) / <alpha-value>)',
          100: 'rgb(var(--brand-100) / <alpha-value>)',
          200: 'rgb(var(--brand-200) / <alpha-value>)',
          300: 'rgb(var(--brand-300) / <alpha-value>)',
          400: 'rgb(var(--brand-400) / <alpha-value>)',
          500: 'rgb(var(--brand-500) / <alpha-value>)',
          600: 'rgb(var(--brand-600) / <alpha-value>)',
          700: 'rgb(var(--brand-700) / <alpha-value>)',
          800: 'rgb(var(--brand-800) / <alpha-value>)',
          900: 'rgb(var(--brand-900) / <alpha-value>)',
          950: 'rgb(var(--brand-900) / <alpha-value>)',
        },
        grass: {
          50:  'rgb(var(--grass-50) / <alpha-value>)',
          100: 'rgb(var(--grass-100) / <alpha-value>)',
          200: 'rgb(var(--grass-200) / <alpha-value>)',
          300: 'rgb(var(--grass-300) / <alpha-value>)',
          400: 'rgb(var(--grass-400) / <alpha-value>)',
          500: 'rgb(var(--grass-500) / <alpha-value>)',
          600: 'rgb(var(--grass-600) / <alpha-value>)',
          700: 'rgb(var(--grass-700) / <alpha-value>)',
          800: 'rgb(var(--grass-800) / <alpha-value>)',
          900: 'rgb(var(--grass-900) / <alpha-value>)',
          950: 'rgb(var(--grass-900) / <alpha-value>)',
        },
        amber: {
          50:  'rgb(var(--amber-50) / <alpha-value>)',
          100: 'rgb(var(--amber-100) / <alpha-value>)',
          200: 'rgb(var(--amber-200) / <alpha-value>)',
          300: 'rgb(var(--amber-300) / <alpha-value>)',
          400: 'rgb(var(--amber-400) / <alpha-value>)',
          500: 'rgb(var(--amber-500) / <alpha-value>)',
          600: 'rgb(var(--amber-600) / <alpha-value>)',
          700: 'rgb(var(--amber-700) / <alpha-value>)',
          800: 'rgb(var(--amber-800) / <alpha-value>)',
          900: 'rgb(var(--amber-900) / <alpha-value>)',
          950: 'rgb(var(--amber-900) / <alpha-value>)',
        },
        crimson: {
          50:  'rgb(var(--crimson-50) / <alpha-value>)',
          100: 'rgb(var(--crimson-100) / <alpha-value>)',
          200: 'rgb(var(--crimson-200) / <alpha-value>)',
          300: 'rgb(var(--crimson-300) / <alpha-value>)',
          400: 'rgb(var(--crimson-400) / <alpha-value>)',
          500: 'rgb(var(--crimson-500) / <alpha-value>)',
          600: 'rgb(var(--crimson-600) / <alpha-value>)',
          700: 'rgb(var(--crimson-700) / <alpha-value>)',
          800: 'rgb(var(--crimson-800) / <alpha-value>)',
          900: 'rgb(var(--crimson-900) / <alpha-value>)',
          950: 'rgb(var(--crimson-900) / <alpha-value>)',
        },
        // Foreground for anything sitting ON a brand fill. White in light
        // theme, near-black in dark — so `bg-brand-600 text-on-brand` is
        // correct in both and no component hardcodes a hex.
        'on-brand': 'rgb(var(--on-brand) / <alpha-value>)',
        // Overlay wash for spinners and hover affordances above a panel or
        // an uploaded image — a token, not a white alpha, so dark theme follows.
        scrim: {
          DEFAULT: 'var(--scrim)',
          strong:  'var(--scrim-strong)',
        },
        // Hairline + focus ring, so `border-line` and `ring-line-strong`
        // follow the theme instead of being written as white/black alphas.
        line: {
          DEFAULT: 'var(--ring)',
          strong:  'var(--ring-strong)',
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
      borderColor: {
        DEFAULT: 'rgb(var(--ink-200) / <alpha-value>)',
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
        'radial-fade': 'radial-gradient(60% 50% at 50% 0%, rgba(224,0,0,0.05) 0%, transparent 70%)',
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
