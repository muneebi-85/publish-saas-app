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
        ink: {
          50:  '#FAFAF9',
          100: '#F5F5F4',
          150: '#EFEFEE',
          200: '#E7E5E4',
          300: '#D6D3D1',
          400: '#A8A29E',
          500: '#78716C',
          600: '#57534E',
          700: '#44403C',
          800: '#292524',
          900: '#1C1917',
          950: '#0C0A09',
        },
        surface: {
          canvas:  '#FAFAF9',
          panel:   '#FFFFFF',
          sunken:  '#F5F5F4',
          muted:   '#EFEFEE',
        },
        grass: {
          50:  '#F0FDF4',
          100: '#DCFCE7',
          500: '#16A34A',
          600: '#15803D',
          700: '#166534',
          900: '#14532D',
        },
        amber: {
          50:  '#FFFBEB',
          500: '#F59E0B',
          600: '#D97706',
          700: '#B45309',
        },
        crimson: {
          50:  '#FEF2F2',
          500: '#EF4444',
          600: '#DC2626',
          700: '#B91C1C',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        display: ['Inter Tight', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': ['10.5px', { lineHeight: '14px', letterSpacing: '0.04em' }],
        'xs':  ['12px',   { lineHeight: '18px' }],
        'sm':  ['13.5px', { lineHeight: '20px' }],
        'base':['15px',   { lineHeight: '24px' }],
        'lg':  ['17px',   { lineHeight: '26px' }],
        'xl':  ['20px',   { lineHeight: '28px' }],
        '2xl': ['24px',   { lineHeight: '32px', letterSpacing: '-0.01em' }],
        '3xl': ['30px',   { lineHeight: '36px', letterSpacing: '-0.02em' }],
        '4xl': ['38px',   { lineHeight: '44px', letterSpacing: '-0.025em' }],
        '5xl': ['52px',   { lineHeight: '58px', letterSpacing: '-0.03em' }],
        '6xl': ['68px',   { lineHeight: '72px', letterSpacing: '-0.035em' }],
        '7xl': ['84px',   { lineHeight: '88px', letterSpacing: '-0.04em' }],
      },
      borderRadius: {
        DEFAULT: '10px',
        md: '10px',
        lg: '12px',
        xl: '14px',
        '2xl': '18px',
        '3xl': '24px',
      },
      boxShadow: {
        'xs':      '0 1px 1px rgba(15,15,15,0.03), 0 1px 2px rgba(15,15,15,0.03)',
        'subtle':  '0 1px 2px rgba(15,15,15,0.04), 0 2px 4px -1px rgba(15,15,15,0.03)',
        'card':    '0 1px 2px rgba(15,15,15,0.04), 0 4px 12px -4px rgba(15,15,15,0.04)',
        'float':   '0 6px 24px -8px rgba(15,15,15,0.10), 0 2px 6px -2px rgba(15,15,15,0.05)',
        'ring':    '0 0 0 1px rgba(15,15,15,0.06), 0 1px 2px rgba(15,15,15,0.04)',
        'inset-soft': 'inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -1px 0 rgba(15,15,15,0.04)',
      },
      backgroundImage: {
        'grid': "linear-gradient(rgba(15,15,15,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(15,15,15,0.035) 1px, transparent 1px)",
        'radial-fade': 'radial-gradient(60% 50% at 50% 0%, rgba(15,15,15,0.04) 0%, transparent 70%)',
        'paper': 'linear-gradient(180deg, #FFFFFF 0%, #FAFAF9 100%)',
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
