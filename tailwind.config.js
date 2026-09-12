/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 布布一二风：奶油白底 + 蜜桃粉点缀 + 暖褐文字
        cream: {
          50: '#FFFDFA',
          100: '#FFF9F2',
          200: '#FFF3E6',
          300: '#FFEBD8',
          400: '#FFE0C4',
        },
        peach: {
          100: '#FFE3DD',
          200: '#FFCDBF',
          300: '#FFB3A7',
          400: '#FF9A87',
          500: '#FF8E7A',
          600: '#F5725C',
        },
        apricot: '#FFE0B2',
        mint: '#BFE3D0',
        mist: '#C9DDF0',
        lilac: '#DED3F2',
        ink: {
          DEFAULT: '#5B4A42',
          700: '#6E5A50',
          500: '#8C776C',
          300: '#B7A69C',
          200: '#D9CCC4',
          100: '#EFE6DF',
        },
      },
      fontFamily: {
        cute: [
          '"LXGW WenKai"',
          '"Xiaolai SC"',
          '"PingFang SC"',
          '"Microsoft YaHei UI"',
          '"Microsoft YaHei"',
          'system-ui',
          'sans-serif',
        ],
      },
      borderRadius: {
        blob: '28px',
        pill: '999px',
      },
      boxShadow: {
        sticker: '0 6px 0 rgba(91,74,66,0.08)',
        pop: '0 10px 24px -8px rgba(255,142,122,0.45)',
        inset: 'inset 0 -3px 0 rgba(91,74,66,0.06)',
      },
      keyframes: {
        floaty: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        popIn: {
          '0%': { transform: 'scale(0.86)', opacity: '0' },
          '70%': { transform: 'scale(1.04)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(14px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fall: {
          '0%': { transform: 'translateY(-10px) rotate(0deg)', opacity: '1' },
          '100%': { transform: 'translateY(180px) rotate(320deg)', opacity: '0' },
        },
        wiggle: {
          '0%,100%': { transform: 'rotate(-2deg)' },
          '50%': { transform: 'rotate(2deg)' },
        },
        sweep: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        floaty: 'floaty 3.2s ease-in-out infinite',
        popIn: 'popIn 0.28s cubic-bezier(0.34,1.56,0.64,1)',
        slideUp: 'slideUp 0.3s ease-out',
        fall: 'fall 1.1s ease-in forwards',
        wiggle: 'wiggle 0.6s ease-in-out infinite',
        sweep: 'sweep 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
